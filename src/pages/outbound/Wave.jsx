import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Layers, ListPlus, Minus, Plus, ScrollText, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbWaveApi } from '@/api/outbWaveApi';
import { outbOrderApi } from '@/api/outbOrderApi';
import { strategyApi } from '@/api/strategyApi';
import { useCodes } from '@/hooks/useCodes';
import { WAVE_STATUS_META, WAV_REG_TYP_META, OUTB_STATUS_META } from '@/constants/badgeMeta';
import { fmtDt, num, todayStr } from '@/utils/format';
import { WAVE_STATUS_OPTIONS } from '@/constants/codeOptions';
import SearchBar, { SearchText, SearchSelect, SearchDateRange, SearchStore } from '@/components/common/SearchBar';
import ConfirmModal from '@/components/common/ConfirmModal';
import { Badge } from '@/components/common/Badge';
import ExecutionHistory from '@/components/strategy/ExecutionHistory';
import WaveOrderPickerModal from '@/components/outbound/WaveOrderPickerModal';
import WaveStrategyRunner from '@/components/outbound/WaveStrategyRunner';

const centered = { display: 'flex', alignItems: 'center', justifyContent: 'center' };

const WAVE_COLUMN_DEFS = [
    { field: 'wavNo', headerName: '웨이브번호', width: 168, cellClass: 'font-bold text-slate-700' },
    {
        field: 'status', headerName: '상태', width: 74, cellStyle: centered,
        headerTooltip: '편성중 = 주문을 담고 뺄 수 있음 / 지시발행 = 피킹지시가 나가 편성이 잠김',
        cellRenderer: (p) => <Badge meta={WAVE_STATUS_META} value={p.value} show="label" />,
    },
    {
        field: 'expctDe', headerName: '출고예정일', width: 105,
        headerTooltip: '소속 주문의 출고예정일 — 같은 날짜의 주문만 담을 수 있다. 빈 웨이브는 첫 주문이 날짜를 정한다',
        cellRenderer: (p) => (p.value ?? <span className="text-slate-400">빈 웨이브</span>),
    },
    {
        field: 'orderCount', headerName: '주문', width: 96, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '편성된 주문 수. 「할당 N」은 할당이 시작된 주문 수 — 그 주문은 뺄 수 없고 웨이브도 삭제할 수 없다',
        // 웨이브 상태는 할당을 기록하지 않으므로(편성중/지시발행 둘뿐) 편성 변경 가능 여부는 이 파생값으로 보여준다
        cellRenderer: (p) => (
            <>
                {num(p.value)}
                {p.data.alocStartedCount > 0 && (
                    <span className="text-amber-600 font-bold" title={`할당이 시작된 주문 ${p.data.alocStartedCount}건`}>
                        {' '}· 할당 {num(p.data.alocStartedCount)}
                    </span>
                )}
            </>
        ),
    },
    {
        field: 'wavStgyId', headerName: '생성 전략', flex: 1, minWidth: 140,
        headerTooltip: '이 웨이브를 만든 웨이브 전략. 비어 있으면 화면에서 수동 생성한 웨이브',
        // 전략은 삭제될 수 있고 웨이브의 전략 참조는 느슨한 참조라, 이름을 못 찾아도 id로 남겨 추적을 끊지 않는다
        cellRenderer: (p) => (p.value == null
            ? <span className="text-slate-400">수동 생성</span>
            : <span className="text-slate-600">{p.context.stgyNm(p.value) ?? `전략 #${p.value} (삭제됨)`}</span>),
    },
    { field: 'createdAt', headerName: '생성일시', width: 130, valueFormatter: (p) => fmtDt(p.value) },
    {
        field: 'issuedDt', headerName: '지시발행', width: 130,
        headerTooltip: '피킹지시가 발행된 시각. 발행 이후에는 편성을 바꿀 수 없다',
        valueFormatter: (p) => fmtDt(p.value),
    },
    {
        field: 'closDt', headerName: '종료', width: 130,
        headerTooltip: '소속 주문이 전부 출고확정돼 웨이브가 종료된 시각',
        valueFormatter: (p) => fmtDt(p.value),
    },
];

/** 미편성 후보(주문 담기 팝업)·웨이브 소속 주문 그리드의 공통 컬럼. 편입 출처는 웨이브 소속 목록에만 의미가 있어 따로 붙인다 */
const orderColumns = () => [
    { headerName: 'No.', width: 56, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'outbNo', headerName: '출고번호', width: 168, cellClass: 'font-bold text-slate-700' },
    { field: 'storeNm', headerName: '점포', flex: 1, minWidth: 150, tooltipField: 'storeNm' },
    {
        field: 'outbTyp', headerName: '출고유형', width: 100,
        headerTooltip: '웨이브 전략의 편성 조건 기준값',
        valueFormatter: (p) => p.context.outbTypNm(p.value) ?? p.value,
    },
    {
        field: 'vhclFltno', headerName: '차량편수', width: 90,
        headerTooltip: '웨이브 전략의 편성 조건 기준값. 비어 있으면 배차 미정',
        cellRenderer: (p) => (p.value
            ? (p.context.vhclFltnoNm(p.value) ?? p.value)
            : <span className="text-slate-400">배차미정</span>),
    },
    { field: 'expctDe', headerName: '출고예정일', width: 105 },
    { field: 'lineCount', headerName: '라인', width: 70, cellClass: 'ag-right-aligned-cell text-slate-500', valueFormatter: (p) => num(p.value) },
    {
        field: 'totalOrderQty', headerName: '주문수량', width: 100,
        cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value),
    },
];

const UNASSIGNED_COLUMN_DEFS = orderColumns();

const WAVE_ORDER_COLUMN_DEFS = [
    ...orderColumns(),
    {
        field: 'status', headerName: '상태', width: 74, cellStyle: centered,
        headerTooltip: '할당이 시작된(신규가 아닌) 주문은 웨이브에서 뺄 수 없어 체크가 막힌다',
        cellRenderer: (p) => <Badge meta={OUTB_STATUS_META} value={p.value} show="label" />,
    },
    {
        field: 'wavRegTyp', headerName: '편입', width: 80, cellStyle: centered,
        headerTooltip: '전략 실행으로 편입됐는지, 화면에서 수동으로 담았는지. 수동 편입분은 전략 조건과 맞지 않을 수 있다',
        cellRenderer: (p) => <Badge meta={WAV_REG_TYP_META} value={p.value} show="label" />,
    },
];

/**
 * 웨이브 편성 (SC — 출고). 출고주문을 <b>피킹지시 발행 단위</b>인 웨이브로 묶는다.
 *
 * 편성 경로는 셋이다 — 수동(담기, {@link WaveOrderPickerModal}) · 전략 선택실행 · 전략 자동실행
 * ({@link WaveStrategyRunner}).
 */
export default function Wave() {
    const outbTyps = useCodes('OUTB_TYP');
    const vhclFltnos = useCodes('VHCL_FLTNO');

    // ── 검색 조건 — 웨이브 목록에만 걸린다.
    const [cond, setCond] = useState({ wavNo: '', status: [], storeId: '', storeNm: '',
        expctDeFrom: todayStr(), expctDeTo: todayStr() });

    // ── 웨이브 목록 ──────────────────────────────────────────
    const [waves, setWaves] = useState([]);
    const [selectedWave, setSelectedWave] = useState(null);
    const waveGridRef = useRef(null);
    const pendingWaveRef = useRef(null); // 재조회 후 같은 웨이브를 다시 선택하기 위한 wavId

    // ── 주문 목록 — 선택 웨이브 소속. 미편성 목록은 담기 팝업에서 본다 ──
    const [waveOrders, setWaveOrders] = useState([]);
    const waveOrderGridRef = useRef(null);
    const [pickerWave, setPickerWave] = useState(null); // 주문 담기 팝업 대상 웨이브 (null이면 닫힘)

    // ── 전략 실행 — 카드는 WaveStrategyRunner, 여기는 전략 목록(생성 전략 이름 표시용)과 실행 이력만 ──
    const [strategies, setStrategies] = useState([]);
    const [execHistory, setExecHistory] = useState(null); // null=닫힘 · 'browse'=이력 열람 · 'latest'=방금 실행 결과

    // ── 확인 모달 ────────────────────────────────────────────
    const [confirmRemove, setConfirmRemove] = useState(null);
    const [confirmUnassign, setConfirmUnassign] = useState(null);

    const gridContext = useMemo(() => ({
        outbTypNm: (cd) => outbTyps.nmByCd[cd],
        vhclFltnoNm: (cd) => vhclFltnos.nmByCd[cd],
        stgyNm: (id) => strategies.find(s => s.wavStgyId === id)?.stgyNm,
    }), [outbTyps, vhclFltnos, strategies]);
    const canEditWave = selectedWave?.status === 'PLANNED';

    // ── 조회 ─────────────────────────────────────────────────
    const fetchWaves = async (keepSelection = true) => {
        pendingWaveRef.current = keepSelection ? selectedWave?.wavId ?? null : null;
        if (!keepSelection) {
            setSelectedWave(null);
            setWaveOrders([]);
        }
        setWaves(await outbWaveApi.list(cond));
    };

    const fetchWaveOrders = async (wavId) => {
        setWaveOrders(wavId == null ? [] : await outbOrderApi.list({ wavId }));
    };

    /**
     * 조회 버튼 — 웨이브 목록을 다시 읽는다 (선택은 유지)
     */
    const search = async () => {
        await fetchWaves();
    };

    useEffect(() => {
        outbWaveApi.list(cond).then(setWaves).catch(() => {});
        strategyApi.waveStrategies.list().then(setStrategies).catch(() => {});
    }, []);

    // 재조회 뒤 같은 웨이브를 다시 선택 — 담기/빼기 후에도 작업하던 웨이브가 풀리지 않게
    const onWaveModelUpdated = (p) => {
        if (pendingWaveRef.current == null) return;
        const wavId = pendingWaveRef.current;
        pendingWaveRef.current = null;
        p.api.forEachNode(n => { if (n.data.wavId === wavId) n.setSelected(true); });
    };

    const onWaveSelectionChanged = (e) => {
        const node = e.api.getSelectedNodes()[0];
        setSelectedWave(node?.data ?? null);
        fetchWaveOrders(node?.data?.wavId ?? null);
    };

    const checkedRows = (ref) => ref.current?.api.getSelectedRows() ?? [];

    // ── 편성 조작 ────────────────────────────────────────────
    const createWave = async () => {
        try {
            const wavId = await outbWaveApi.create([]);
            toast.success('빈 웨이브를 만들었습니다 — 주문을 담아 편성하세요.');
            pendingWaveRef.current = wavId;
            setWaves(await outbWaveApi.list(cond));
        } catch (e) {
            toast.error(e.message || '웨이브 생성에 실패했습니다.');
        }
    };

    // 담기 자체는 팝업이 처리하고, 여기선 담긴 뒤 두 목록을 다시 읽는다
    const onOrdersAdded = async () => {
        await Promise.all([fetchWaves(), fetchWaveOrders(selectedWave.wavId)]);
    };

    const handleUnassignClick = () => {
        if (!selectedWave) return;
        const rows = checkedRows(waveOrderGridRef);
        if (rows.length === 0) {
            toast('편성 해제할 주문을 체크하세요.');
            return;
        }
        setConfirmUnassign(rows);
    };

    const doUnassign = async (rows) => {
        try {
            await outbWaveApi.unassignOrders(selectedWave.wavId, rows.map(r => r.outbOrderId));
            toast.success(`주문 ${rows.length}건을 편성 해제했습니다.`);
            await Promise.all([fetchWaves(), fetchWaveOrders(selectedWave.wavId)]);
        } catch (e) {
            toast.error(e.message || '편성 해제에 실패했습니다.');
        }
    };

    // 전략 실행 뒤 — 웨이브 목록이 바뀌고 보고 있던 웨이브의 소속도 달라질 수 있다.
    // 결과는 따로 그리지 않고 실행 이력을 방금 건이 펼쳐진 채로 연다 (로그에 같은 내용이 남는다)
    const onStgyExecuted = async () => {
        await fetchWaves();
        if (selectedWave) fetchWaveOrders(selectedWave.wavId);
        setExecHistory('latest');
    };

    const doRemoveWave = async (wave) => {
        try {
            await outbWaveApi.remove(wave.wavId);
            toast.success(`${wave.wavNo}를 삭제했습니다 — 소속 주문은 미편성으로 돌아갑니다.`);
            await fetchWaves(false);
        } catch (e) {
            toast.error(e.message || '삭제에 실패했습니다.');
        }
    };

    return (
        // min-h — 노트북처럼 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Layers size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">웨이브 편성</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    출고주문을 피킹지시 발행 단위로 묶습니다 — 주문 1건은 웨이브 1개에만 속합니다
                </span>
                <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => setExecHistory('browse')} className="btn-ghost">
                        <ScrollText size={13} /> 실행 이력
                    </button>
                    <button onClick={createWave} className="btn-primary">
                        <Plus size={13} /> 새 웨이브
                    </button>
                </div>
            </div>

            {/* 검색 조건 — 웨이브 목록에만 걸린다. 주문 조건은 주문 담기 팝업 안에 있다 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={search}>
                <SearchText name="wavNo" label="웨이브번호" placeholder="WV-20260803-001" />
                <SearchSelect name="status" label="웨이브상태" options={WAVE_STATUS_OPTIONS} multiple />
                {/* 점포는 이미 편성의 기준이다 — 웨이브 전략이 납품처그룹·유형으로 주문을 고른다 */}
                <SearchStore />
                <SearchDateRange from="expctDeFrom" to="expctDeTo" label="출고예정일" />
            </SearchBar>

            <WaveStrategyRunner strategies={strategies} onExecuted={onStgyExecuted} />

            <PanelGroup direction="horizontal" autoSaveId="outb-wave-split-v2" className="flex-1 min-h-0">
                <Panel defaultSize={33} minSize={16} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700">웨이브</span>
                        <button
                            onClick={() => setConfirmRemove(selectedWave)}
                            disabled={!canEditWave || selectedWave.alocStartedCount > 0}
                            title={selectedWave?.alocStartedCount > 0
                                ? `할당이 시작된 주문이 ${selectedWave.alocStartedCount}건 있어 삭제할 수 없습니다 — 할당을 먼저 해제하세요`
                                : '선택한 웨이브를 지우고 소속 주문을 전부 미편성으로 되돌립니다'}
                            className="ml-auto btn-danger disabled:text-slate-300 disabled:border-slate-200 disabled:hover:bg-white">
                            <Trash2 size={13} /> 삭제
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={waveGridRef}
                            rowData={waves}
                            columnDefs={WAVE_COLUMN_DEFS}
                            context={gridContext}
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

                <Panel defaultSize={67} minSize={40} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">웨이브 소속 주문</span>
                        <span className="text-xs text-slate-400 truncate">
                            {selectedWave
                                ? (canEditWave
                                    ? selectedWave.wavNo
                                    : `${selectedWave.wavNo} — 피킹지시가 발행돼 편성을 바꿀 수 없습니다`)
                                : '왼쪽에서 작업할 웨이브를 선택하세요'}
                        </span>
                        <button onClick={() => setPickerWave(selectedWave)}
                                disabled={!canEditWave || selectedWave.alocStartedCount > 0}
                                title={selectedWave?.alocStartedCount > 0
                                    ? `할당이 시작된 주문이 ${selectedWave.alocStartedCount}건 있어 주문을 추가할 수 없습니다 — 할당을 먼저 해제하세요`
                                    : '미편성 주문 중에서 골라 이 웨이브에 담습니다 (편입 출처: 수동)'}
                                className="btn-primary ml-auto shrink-0 disabled:bg-slate-200 disabled:text-slate-400">
                            <ListPlus size={13} /> 주문 담기
                        </button>
                        <button onClick={handleUnassignClick} disabled={!canEditWave}
                                title="체크한 주문을 이 웨이브에서 빼 미편성으로 되돌립니다"
                                className="btn-ghost shrink-0 disabled:text-slate-300 disabled:border-slate-200 disabled:hover:bg-white">
                            <Minus size={13} /> 빼기
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={waveOrderGridRef}
                            rowData={waveOrders}
                            columnDefs={WAVE_ORDER_COLUMN_DEFS}
                            context={gridContext}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{
                                mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false,
                                // 할당이 시작된 주문은 체크를 못하게 막는다
                                isRowSelectable: (node) => node.data.status === 'CREATED',
                            }}
                        />
                    </div>
                </Panel>
            </PanelGroup>

            {/* 주문 담기 팝업 — 열려 있는 동안만 마운트해 열 때마다 조건·후보가 새로 시작된다 */}
            {pickerWave && (
                <WaveOrderPickerModal
                    wave={pickerWave}
                    columnDefs={UNASSIGNED_COLUMN_DEFS}
                    context={gridContext}
                    outbTyps={outbTyps}
                    vhclFltnos={vhclFltnos}
                    onClose={() => setPickerWave(null)}
                    onAdded={onOrdersAdded}
                />
            )}

            {/* 편성 해제 확인 */}
            {confirmUnassign && (
                <ConfirmModal
                    title={`주문 ${confirmUnassign.length}건을 편성 해제할까요?`}
                    confirmText="편성 해제"
                    onCancel={() => setConfirmUnassign(null)}
                    onConfirm={() => { doUnassign(confirmUnassign); setConfirmUnassign(null); }}
                >
                    <p className="text-sm text-slate-500">
                        {selectedWave?.wavNo} · {confirmUnassign.slice(0, 3).map(o => o.outbNo).join(', ')}
                        {confirmUnassign.length > 3 && ` 외 ${confirmUnassign.length - 3}건`}
                    </p>
                    <p className="text-xs text-slate-400">주문은 지워지지 않고 미편성으로 돌아갑니다.</p>
                </ConfirmModal>
            )}

            {/* 웨이브 삭제 확인 */}
            {confirmRemove && (
                <ConfirmModal
                    title="웨이브를 삭제할까요?"
                    confirmText="삭제"
                    danger
                    onCancel={() => setConfirmRemove(null)}
                    onConfirm={() => { doRemoveWave(confirmRemove); setConfirmRemove(null); }}
                >
                    <p className="text-sm text-slate-500">
                        <b>{confirmRemove.wavNo}</b> · 소속 주문 {num(confirmRemove.orderCount)}건
                    </p>
                    <p className="text-xs text-slate-400">
                        웨이브 행이 삭제되고 소속 주문은 전부 미편성으로 돌아갑니다. 주문 자체는 지워지지 않습니다.
                    </p>
                </ConfirmModal>
            )}

            <ExecutionHistory
                open={execHistory != null}
                onClose={() => setExecHistory(null)}
                stgyTyp="WAV"
                stgyNmOf={gridContext.stgyNm}
                openLatest={execHistory === 'latest'}
            />
        </div>
    );
}
