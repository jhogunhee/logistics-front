import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Send } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbShmtApi } from '@/api/outbShmtApi';
import { OUTB_STATUS_META } from '@/constants/badgeMeta';
import { fmtDe, fmtDt, num, todayStr } from '@/utils/format';
import SearchBar, { SearchText, SearchDateRange } from '@/components/common/SearchBar';
import ConfirmModal from '@/components/common/ConfirmModal';
import { Badge } from '@/components/common/Badge';

/** 확정대상 강조 — 0이 아니면 언제나 강조한다. 확정을 강제하는 마감이 없어 이 값이 「닫을 것이 남았다」의 신호다 */
const readyCell = (p) => (p.value > 0
    ? <span className="font-bold text-indigo-600 tabular-nums">{num(p.value)}</span>
    : <span className="text-slate-300 tabular-nums">0</span>);

/** 작업중 강조 — 이 주문이 섞이면 그 주문은 확정할 수 없다 (집품을 끝내거나 지시취소 → 할당해제) */
const workingCell = (p) => (p.value > 0
    ? <span className="font-bold text-amber-600 tabular-nums">{num(p.value)}</span>
    : <span className="text-slate-300 tabular-nums">0</span>);

/** 결품 강조 — 주문수량 − 피킹수량. 확정하면 이 수량은 부족 출고로 닫힌다 */
const shotgeCell = (p) => (p.value > 0
    ? <span className="font-bold text-rose-600 tabular-nums">{num(p.value)}</span>
    : <span className="text-slate-300 tabular-nums">0</span>);

/** 웨이브 목록 — 지시발행(ISSUED)된 웨이브의 주문 상태별 건수 */
const WAVE_COLUMN_DEFS = [
    { field: 'wavNo', headerName: '웨이브번호', width: 168, cellClass: 'font-bold text-slate-700' },
    {
        field: 'readyCount', headerName: '확정대상', width: 86, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '지금 확정할 수 있는 주문 — 피킹완료(정상) + 신규(할당 0건, 전량 미출고). 0이 아니면 항상 강조한다',
        cellRenderer: readyCell,
    },
    {
        field: 'workingCount', headerName: '작업중', width: 76, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '할당·피킹중 주문 — 집품이 끝나야 확정할 수 있다',
        cellRenderer: workingCell,
    },
    {
        field: 'shippedCount', headerName: '확정완료', width: 86, cellClass: 'ag-right-aligned-cell tabular-nums text-slate-500',
        headerTooltip: '이미 출고확정된 주문. 주문 수와 같아지는 순간 웨이브가 종료된다',
        valueFormatter: (p) => num(p.value),
    },
    { field: 'orderCount', headerName: '주문', width: 70, cellClass: 'ag-right-aligned-cell tabular-nums', valueFormatter: (p) => num(p.value) },
    { field: 'expctDe', headerName: '출고예정일', width: 105, valueFormatter: (p) => fmtDe(p.value) },
    { field: 'issuedDt', headerName: '발행일시', flex: 1, minWidth: 120, valueFormatter: (p) => fmtDt(p.value) },
];

/** 주문 그리드 — 체크 가능한 행은 확정할 수 있는 상태(피킹완료 · 신규)뿐이다 */
const ORDER_COLUMN_DEFS = [
    { field: 'outbNo', headerName: '출고번호', width: 150, cellClass: 'font-bold text-slate-700' },
    { field: 'storeNm', headerName: '점포', flex: 1, minWidth: 110 },
    {
        field: 'status', headerName: '상태', width: 92,
        headerTooltip: '피킹완료 · 신규(할당 0건)만 확정할 수 있다. 할당·피킹중은 출고작업중이라 막힌다',
        cellRenderer: (p) => <Badge meta={OUTB_STATUS_META} value={p.value} show="label" />,
    },
    { field: 'odrQty', headerName: '주문수량', width: 96, cellClass: 'ag-right-aligned-cell tabular-nums', valueFormatter: (p) => num(p.value) },
    { field: 'alocQty', headerName: '할당수량', width: 96, cellClass: 'ag-right-aligned-cell tabular-nums', valueFormatter: (p) => num(p.value) },
    {
        field: 'pikngQty', headerName: '피킹수량', width: 96,
        headerTooltip: '집품돼 SHIP-STAGE에 있는 수량 — 확정하면 이만큼이 창고 밖으로 나간다',
        cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 0 ? 'text-emerald-600 font-bold' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
    {
        field: 'shotgeQty', headerName: '결품', width: 82, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '주문수량 − 피킹수량. 할당에서 못 채운 것과 집품에서 못 채운 것을 합친 값 — 확정하면 부족 출고로 닫힌다 (백오더 없음)',
        cellRenderer: shotgeCell,
    },
    { field: 'shmtDt', headerName: '확정일시', width: 140, valueFormatter: (p) => fmtDt(p.value) },
];

/**
 * 출고확정 (SC — 출고). <b>피킹이 끝난 주문을 닫고 SHIP-STAGE의 실물·예약을 함께 소진한다</b> —
 * 재고가 창고 밖으로 나가는 유일한 지점이고, 웨이브의 주문이 전부 닫히면 웨이브도 종료된다.
 *
 * 확정할 수 있는 주문은 둘이다. 피킹완료(정상)와 신규(할당 0건 — 지시취소 → 할당해제로 비워졌거나
 * 재고가 없어 한 번도 할당되지 못한 주문, 전량 미출고로 닫는다). 할당·피킹중은 출고작업중이라 막힌다.
 * 되돌릴 수 없다 — 출고확정 취소는 지원하지 않는다.
 */
export default function Shipping() {
    const [cond, setCond] = useState({ wavNo: '', outbNo: '', expctDeFrom: todayStr(), expctDeTo: todayStr() });
    const [waves, setWaves] = useState([]);
    const [wave, setWave] = useState(null);          // 선택 웨이브 (단일)
    const [rows, setRows] = useState([]);
    const [checkedCount, setCheckedCount] = useState(0);
    const [confirmShmt, setConfirmShmt] = useState(null);
    const orderGridRef = useRef(null);
    // 재조회 뒤 보고 있던 웨이브를 다시 열기 위한 wavId (피킹 화면과 같은 방식)
    const pendingWaveRef = useRef(null);

    const fetchWaves = async () => {
        pendingWaveRef.current = wave?.wavId ?? null;
        setWaves(await outbShmtApi.waves(cond));
    };

    const fetchRows = async (wavId) => {
        setCheckedCount(0);
        if (wavId == null) {
            setRows([]);
            return;
        }
        setRows(await outbShmtApi.orders(wavId));
    };

    const search = async () => {
        try {
            await fetchWaves();
            if (wave) await fetchRows(wave.wavId);
        } catch (e) {
            toast.error(e.message || '조회에 실패했습니다.');
        }
    };

    // 최초 1회 조회 (검색조건 기본값 = 출고예정일 오늘)
    useEffect(() => {
        outbShmtApi.waves(cond).then(setWaves).catch(() => {});
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

    // 확정 뒤에 웨이브가 종료되는지 — 이번에 체크한 것 + 이미 확정된 것이 주문 전부인가
    const willCloseWave = (picked) => wave && rows.length > 0
        && rows.every(r => r.status === 'SHIPPED' || picked.some(p => p.outbOrderId === r.outbOrderId));

    // ── 출고확정 ─────────────────────────────────────────────
    const handleConfirmClick = () => {
        const picked = orderGridRef.current?.api.getSelectedRows() ?? [];
        if (picked.length === 0) {
            toast('출고확정할 주문을 체크하세요.');
            return;
        }
        setConfirmShmt(picked);
    };

    const doConfirm = async (picked) => {
        try {
            const res = await outbShmtApi.confirm(picked.map(r => r.outbOrderId));
            toast.success(`주문 ${res.orderCount}건 · ${num(res.shmtQty)}개를 출고확정했습니다`
                + (res.shotgeQty > 0 ? ` (결품 ${num(res.shotgeQty)})` : '')
                + (res.closedWavNos.length > 0 ? ` — 웨이브 종료: ${res.closedWavNos.join(', ')}` : ''));
            // 종료된 웨이브는 목록에서 빠진다 — 보고 있던 웨이브가 닫혔으면 선택을 비운다
            const waveClosed = res.closedWavNos.includes(wave?.wavNo);
            if (waveClosed) setWave(null);
            await fetchWaves();
            await fetchRows(waveClosed ? null : wave?.wavId ?? null);
        } catch (e) {
            toast.error(e.message || '출고확정에 실패했습니다.');
        }
    };

    const readyRows = rows.filter(r => r.shippable);

    return (
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Send size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">출고확정</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    피킹이 끝난 주문을 확정하면 SHIP-STAGE 재고가 창고 밖으로 나가고, 주문이 전부 닫힌 웨이브는 종료됩니다
                </span>
            </div>

            {/* 검색 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={search}>
                <SearchText name="wavNo" label="웨이브번호" placeholder="WV-20260821-001" />
                <SearchText name="outbNo" label="출고번호" placeholder="OB-20260821-001" />
                <SearchDateRange from="expctDeFrom" to="expctDeTo" label="출고예정일" />
            </SearchBar>

            {/* 좌: 발행된 웨이브(단일 선택) / 우: 주문 그리드(체크 = 확정 대상) */}
            <PanelGroup direction="horizontal" autoSaveId="outb-shipping-split" className="flex-1 min-h-0">
                <Panel defaultSize={40} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">발행된 웨이브</span>
                        <span className="text-xs text-slate-400 truncate">종료된 웨이브는 빠집니다</span>
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

                <PanelResizeHandle className="w-2.5 flex items-center justify-center group cursor-col-resize">
                    <div className="w-1 h-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={60} minSize={40} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">주문</span>
                        <span className="text-xs text-slate-400 truncate">
                            {wave ? `${wave.wavNo} · 확정대상 ${readyRows.length}건` : '왼쪽에서 웨이브를 선택하세요'}
                        </span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">
                            선택 {checkedCount} / {rows.length}건
                        </span>
                        <button onClick={handleConfirmClick} className="btn-primary shrink-0"
                                title="체크한 주문을 출고확정합니다 — SHIP-STAGE 재고가 차감되며 되돌릴 수 없습니다">
                            <Send size={13} /> 출고확정{checkedCount > 0 ? ` ${checkedCount}` : ''}
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={orderGridRef}
                            rowData={rows}
                            columnDefs={ORDER_COLUMN_DEFS}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{
                                mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false,
                                // 확정할 수 있는 상태(피킹완료 · 신규)만 체크된다 — 서버 가드와 같은 판정
                                isRowSelectable: (node) => node.data.shippable,
                            }}
                            onSelectionChanged={(e) => setCheckedCount(e.api.getSelectedRows().length)}
                            // 확정된 행은 흐리게, 작업중 행은 노란 바탕 — 「지금 닫을 것」만 또렷하게 남긴다
                            getRowClass={(p) => (p.data.status === 'SHIPPED' ? 'opacity-45'
                                : p.data.shippable ? '' : 'bg-amber-50/60')}
                        />
                    </div>
                </Panel>
            </PanelGroup>

            {/* 출고확정 확인 — 되돌릴 수 없으므로 무엇이 나가고 무엇이 결품으로 닫히는지 짚는다 */}
            {confirmShmt && (
                <ConfirmModal
                    title="출고확정할까요?"
                    confirmText="출고확정"
                    danger
                    onCancel={() => setConfirmShmt(null)}
                    onConfirm={() => { doConfirm(confirmShmt); setConfirmShmt(null); }}
                >
                    <p className="text-sm text-slate-500">
                        주문 <b>{confirmShmt.length}건</b> · 출하{' '}
                        <b>{num(confirmShmt.reduce((s, r) => s + r.pikngQty, 0))}</b>개를 출고확정합니다 —
                        SHIP-STAGE 재고가 그만큼 빠지고 주문이 닫힙니다.
                    </p>
                    {confirmShmt.some(r => r.shotgeQty > 0) && (
                        <p className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2 leading-relaxed">
                            결품 <b>{num(confirmShmt.reduce((s, r) => s + r.shotgeQty, 0))}</b>개는 부족 출고로 닫힙니다
                            (백오더 없음).
                            {confirmShmt.some(r => r.status === 'CREATED') && (
                                <> 할당이 없는 주문 <b>{confirmShmt.filter(r => r.status === 'CREATED').length}건</b>은
                                재고 처리 없이 <b>전량 미출고</b>로 확정됩니다.</>
                            )}
                        </p>
                    )}
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        되돌릴 수 없습니다 — 출고확정 취소는 지원하지 않습니다.
                        {willCloseWave(confirmShmt)
                            ? <> 이 확정으로 웨이브 <b>{wave?.wavNo}</b>의 주문이 전부 닫혀 <b>웨이브가 종료</b>됩니다.</>
                            : <> 아직 닫히지 않은 주문이 남아 웨이브는 지시발행 상태로 남습니다.</>}
                    </p>
                </ConfirmModal>
            )}
        </div>
    );
}
