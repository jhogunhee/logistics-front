import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { PackagePlus, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { rplnApi } from '@/api/rplnApi';
import { INV_MOV_STATUS_META } from '@/constants/badgeMeta';
import { fmtDe, fmtDt, num, todayStr } from '@/utils/format';
import SearchBar, { SearchText, SearchDateRange, SearchProd } from '@/components/common/SearchBar';
import ConfirmModal from '@/components/common/ConfirmModal';
import { Badge } from '@/components/common/Badge';

/** 미확정 강조 — 0이 아니면 언제나 강조한다. 보충이 안 끝난 피킹지시는 실행이 막히므로 이 값이 「집품을 막고 있는 것」의 수다 */
const openCell = (p) => (p.value > 0
    ? <span className="font-bold text-indigo-600 tabular-nums">{num(p.value)}</span>
    : <span className="text-slate-300 tabular-nums">0</span>);

const WAVE_COLUMN_DEFS = [
    { field: 'wavNo', headerName: '웨이브번호', width: 168, cellClass: 'font-bold text-slate-700' },
    {
        field: 'openCount', headerName: '미확정', width: 80, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '아직 확정되지 않은 보충지시 — 짝 피킹지시는 이것이 끝나야 집을 수 있다. 0이 아니면 항상 강조한다',
        cellRenderer: openCell,
    },
    { field: 'rplnCount', headerName: '보충', width: 70, cellClass: 'ag-right-aligned-cell tabular-nums', valueFormatter: (p) => num(p.value) },
    { field: 'expctDe', headerName: '출고예정일', width: 105, valueFormatter: (p) => fmtDe(p.value) },
    { field: 'issuedDt', headerName: '발행일시', flex: 1, minWidth: 120, valueFormatter: (p) => fmtDt(p.value) },
];

const ROW_COLUMN_DEFS = [
    { field: 'srtSeq', headerName: '순번', width: 64, headerTooltip: '짝 피킹지시의 집품 순번', cellClass: 'text-slate-500 tabular-nums' },
    { field: 'invMovNo', headerName: '보충번호', width: 150, cellClass: 'font-bold text-slate-700' },
    { field: 'fromLocCd', headerName: '보관존', width: 120, headerTooltip: '할당이 잡힌 보관존 로케이션 — 여기서 꺼낸다', cellClass: 'text-slate-600' },
    { field: 'toLocCd', headerName: '피킹존', width: 120, headerTooltip: '도착지 — 고정 로케이션 → 같은 상품이 있는 피킹존 → 빈 피킹존 순으로 정해진다', cellClass: 'font-medium text-indigo-700' },
    { field: 'prodCd', headerName: '상품코드', width: 110, cellClass: 'text-slate-600' },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 130 },
    { field: 'lotNo', headerName: 'Lot', width: 150, cellClass: 'text-slate-500' },
    { field: 'expiryDt', headerName: '유통기한', width: 105, valueFormatter: (p) => fmtDe(p.value) },
    { field: 'qty', headerName: '수량', width: 84, headerTooltip: '할당분 그대로 — 전량만 확정한다', cellClass: 'ag-right-aligned-cell tabular-nums', valueFormatter: (p) => num(p.value) },
    {
        field: 'status', headerName: '상태', width: 84,
        cellRenderer: (p) => <Badge meta={INV_MOV_STATUS_META} value={p.value} show="label" />,
    },
    { field: 'outbNo', headerName: '출고번호', width: 168, cellClass: 'font-bold text-slate-700' },
    { field: 'storeNm', headerName: '점포', flex: 1, minWidth: 150, tooltipField: 'storeNm' },
    { field: 'cmplDt', headerName: '확정일시', width: 140, valueFormatter: (p) => fmtDt(p.value) },
];

/**
 * 수시보충 (SC — 출고). <b>보관존에 잡힌 할당분을 피킹존으로 옮기는 지시의 확정·취소.</b>
 *
 * 지시는 피킹지시 발행이 만든다 — 보관존 할당마다 피킹지시(도착지에서 집으라는)와 보충지시가 짝으로
 * 나간다. 확정하면 실물과 예약이 함께 피킹존으로 옮겨 가고 할당이 그 행을 가리키게 된다; 그제야 짝
 * 피킹지시를 실행할 수 있다. 전량만 확정한다(할당 행 하나 = 재고 행 하나).
 * 취소는 예약을 건드리지 않고 짝 피킹지시를 함께 취소한다 — 그 지시의 집품 자리가 이번 발행에서 정한
 * 도착지로 굳어 있어 따로 살릴 수 없다. 할당은 그대로 남으므로 피킹지시 화면에서 다시 발행하면 된다.
 */
export default function Replenishment() {
    // 피킹지시·피킹 화면의 「보충」 뱃지가 ?wavNo=로 들어온다 — 그 웨이브를 찾는 것이 목적이라
    // 출고예정일 기본값(오늘)은 걸지 않는다
    const [searchParams] = useSearchParams();
    const linkedWavNo = searchParams.get('wavNo');
    const [cond, setCond] = useState(linkedWavNo
        ? { wavNo: linkedWavNo, prodCd: '', expctDeFrom: '', expctDeTo: '' }
        : { wavNo: '', prodCd: '', expctDeFrom: todayStr(), expctDeTo: todayStr() });
    const [waves, setWaves] = useState([]);
    const [wave, setWave] = useState(null);
    const [rows, setRows] = useState([]);
    const [checkedCount, setCheckedCount] = useState(0);
    const [confirmRpln, setConfirmRpln] = useState(null);
    const [confirmCancel, setConfirmCancel] = useState(null);
    const gridRef = useRef(null);
    const pendingWaveRef = useRef(null);

    const fetchWaves = async () => {
        pendingWaveRef.current = wave?.wavId ?? null;
        setWaves(await rplnApi.waves(cond));
    };

    const fetchRows = async (wavId) => {
        setCheckedCount(0);
        if (wavId == null) {
            setRows([]);
            return;
        }
        setRows(await rplnApi.rows(wavId));
    };

    const search = async () => {
        try {
            await fetchWaves();
            if (wave) await fetchRows(wave.wavId);
        } catch (e) {
            toast.error(e.message || '조회에 실패했습니다.');
        }
    };

    useEffect(() => {
        rplnApi.waves(cond).then(list => {
            // 링크로 들어왔으면 그 웨이브를 바로 편다 — 온 이유가 그 웨이브 하나다
            const linked = linkedWavNo ? list.find(w => w.wavNo === linkedWavNo) : null;
            if (linked) pendingWaveRef.current = linked.wavId;
            setWaves(list);
            if (linkedWavNo && !linked) {
                toast(`${linkedWavNo} — 확정할 보충지시가 없습니다.`, { id: 'rpln-link-miss' });
            }
        }).catch(() => {});
    }, []);

    const onWaveModelUpdated = (p) => {
        if (pendingWaveRef.current == null) return;
        const wavId = pendingWaveRef.current;
        pendingWaveRef.current = null;
        p.api.forEachNode(n => { if (n.data.wavId === wavId) n.setSelected(true); });
    };

    const onWaveSelectionChanged = (e) => {
        const target = e.api.getSelectedNodes()[0]?.data ?? null;
        if (target?.wavId !== wave?.wavId) {
            setWave(target);
            fetchRows(target?.wavId ?? null).catch(() => {});
        }
    };

    const picked = () => gridRef.current?.api.getSelectedRows() ?? [];

    const handleConfirmClick = () => {
        const rows = picked();
        if (rows.length === 0) {
            toast('확정할 보충지시를 체크하세요.');
            return;
        }
        setConfirmRpln(rows);
    };

    const doConfirm = async (target) => {
        try {
            const res = await rplnApi.confirm(target.map(r => r.rplnTaskId));
            toast.success(`보충 ${res.count}건을 확정했습니다 — 재고와 예약이 피킹존으로 옮겨졌고, 짝 피킹지시를 집품할 수 있습니다.`);
            await fetchWaves();
            await fetchRows(wave?.wavId ?? null);
        } catch (e) {
            toast.error(e.message || '보충 확정에 실패했습니다.');
        }
    };

    const handleCancelClick = () => {
        const rows = picked();
        if (rows.length === 0) {
            toast('취소할 보충지시를 체크하세요.');
            return;
        }
        setConfirmCancel(rows);
    };

    const doCancel = async (target) => {
        try {
            const res = await rplnApi.cancel(target.map(r => r.rplnTaskId));
            toast.success(`보충 ${res.count}건을 취소했습니다 — 짝 피킹지시도 함께 취소됐습니다. 예약은 그대로이니 피킹지시 화면에서 다시 발행하세요.`);
            await fetchWaves();
            await fetchRows(wave?.wavId ?? null);
        } catch (e) {
            toast.error(e.message || '보충 취소에 실패했습니다.');
        }
    };

    const openRows = rows.filter(r => r.status === 'DIRECTED');

    return (
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            <div className="flex items-center gap-2">
                <PackagePlus size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">수시보충</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    보관존에 잡힌 할당분을 피킹존으로 옮깁니다 — 확정해야 짝 피킹지시를 집품할 수 있습니다
                </span>
            </div>

            <SearchBar cond={cond} setCond={setCond} onSearch={search}>
                <SearchText name="wavNo" label="웨이브번호" placeholder="WV-20260822-001" />
                <SearchProd name="prodCd" label="상품" />
                <SearchDateRange from="expctDeFrom" to="expctDeTo" label="출고예정일" />
            </SearchBar>

            <PanelGroup direction="vertical" autoSaveId="outb-rpln-split-v1" className="flex-1 min-h-0">
                <Panel defaultSize={40} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">보충이 있는 웨이브</span>
                        <span className="text-xs text-slate-400 truncate">지시발행 상태만</span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">{waves.length}건</span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            rowData={waves}
                            columnDefs={WAVE_COLUMN_DEFS}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                            onSelectionChanged={onWaveSelectionChanged}
                            onModelUpdated={onWaveModelUpdated}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={60} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">보충지시</span>
                        <span className="text-xs text-slate-400 truncate">
                            {wave ? `${wave.wavNo} · 미확정 ${openRows.length}건` : '위에서 웨이브를 선택하세요'}
                        </span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">
                            선택 {checkedCount} / {rows.length}건
                        </span>
                        <button onClick={handleCancelClick} className="btn-ghost shrink-0"
                                title="체크한 보충지시를 취소합니다 — 짝 피킹지시도 함께 취소되고 예약은 그대로입니다">
                            <Undo2 size={13} /> 취소
                        </button>
                        <button onClick={handleConfirmClick} className="btn-primary shrink-0"
                                title="체크한 보충지시를 전량 확정합니다 — 보관존 → 피킹존으로 실물과 예약이 옮겨집니다">
                            <PackagePlus size={13} /> 보충 확정{checkedCount > 0 ? ` ${checkedCount}` : ''}
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={gridRef}
                            rowData={rows}
                            columnDefs={ROW_COLUMN_DEFS}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{
                                mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false,
                                // 확정된 보충은 할 일이 없다 — 체크 자체를 막는다
                                isRowSelectable: (node) => node.data.status === 'DIRECTED',
                            }}
                            onSelectionChanged={(e) => setCheckedCount(e.api.getSelectedRows().length)}
                            getRowClass={(p) => (p.data.status === 'DIRECTED' ? '' : 'opacity-45')}
                        />
                    </div>
                </Panel>
            </PanelGroup>

            {confirmRpln && (
                <ConfirmModal
                    title="보충을 확정할까요?"
                    confirmText="보충 확정"
                    onCancel={() => setConfirmRpln(null)}
                    onConfirm={() => { doConfirm(confirmRpln); setConfirmRpln(null); }}
                >
                    <p className="text-sm text-slate-500">
                        보충 <b>{confirmRpln.length}건</b> · <b>{num(confirmRpln.reduce((s, r) => s + r.qty, 0))}</b>개를
                        보관존에서 피킹존으로 옮깁니다. 전량 확정만 됩니다.
                    </p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        실물과 함께 할당의 예약도 피킹존으로 옮겨 갑니다 — 확정 뒤 짝 피킹지시를 집품할 수 있습니다.
                        되돌리려면 재고이동으로 옮겨야 합니다.
                    </p>
                </ConfirmModal>
            )}

            {confirmCancel && (
                <ConfirmModal
                    title="보충을 취소할까요?"
                    confirmText="보충 취소"
                    danger
                    onCancel={() => setConfirmCancel(null)}
                    onConfirm={() => { doCancel(confirmCancel); setConfirmCancel(null); }}
                >
                    <p className="text-sm text-slate-500">보충 <b>{confirmCancel.length}건</b>을 취소합니다. 재고·예약은 변하지 않습니다.</p>
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                        짝 피킹지시도 함께 취소됩니다 — 집품 자리가 이번 발행의 도착지로 굳어 있어 따로 살릴 수 없습니다.
                        할당은 남으니 피킹지시 화면에서 다시 발행하세요.
                    </p>
                </ConfirmModal>
            )}
        </div>
    );
}
