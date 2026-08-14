import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Hand, PackagePlus, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem, SearchProd } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import ConfirmModal from '@/components/common/ConfirmModal';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { Badge } from '@/components/common/Badge';
import { putawayApi } from '@/api/putawayApi';
import { daysAheadStr, fmtDe, num, todayStr } from '@/utils/format';


// 상단: 입고건 — 물건이 트럭 단위로 들어와 한 자리에 내려지므로 지시도 이 단위로 건다
const ORDER_COLUMN_DEFS = [
    { field: 'ibNo', headerName: '입고번호', width: 170 },
    { field: 'vndrNm', headerName: '벤더', flex: 1, minWidth: 140 },
    {
        field: 'batchCount', headerName: 'Lot 수', width: 80,
        headerTooltip: '이 입고건의 (라인, Lot) 수 — 검수가 나뉘면 한 상품도 여러 Lot이 된다',
        cellClass: 'ag-right-aligned-cell tabular-nums text-slate-500',
    },
    {
        field: 'pendingQty', headerName: '미적치', width: 110,
        headerTooltip: 'RCV-STAGE에 남아있는, 아직 보관 로케이션으로 옮기지 않은 수량',
        cellClass: 'ag-right-aligned-cell tabular-nums text-slate-600',
        valueFormatter: (p) => num(p.value),
    },
    {
        field: 'drctRemainQty', headerName: '지시중', width: 110,
        headerTooltip: '이미 발행된 미완료 지시의 잔량. 적치 화면에서 처리를 기다리는 수량',
        cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 0 ? 'text-indigo-600 font-bold' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
    {
        field: 'unDrctQty', headerName: '미지시', width: 110,
        headerTooltip: '미적치 − 지시중. 이번에 지시를 발행할 수 있는 수량 (0이면 더 발행할 것이 없다)',
        cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 0 ? 'text-amber-600 font-bold' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
    {
        field: 'nearestExpiryDt', headerName: '최단 유통기한', width: 130,
        headerTooltip: '이 입고건에서 가장 임박한 유통기한',
        cellRenderer: (p) => (p.value ? fmtDe(p.value) : <span className="text-slate-400">미관리</span>),
    },
];

/** 배치 목록을 입고건으로 접는다 — 서버는 배치 단위로 주고, 화면의 작업 단위인 입고건은 여기서 만든다 */
const groupByOrder = (batches) => {
    const byOrder = new Map();
    for (const b of batches) {
        const group = byOrder.get(b.ibNo) ?? {
            ibNo: b.ibNo, ibOrderId: b.ibOrderId, vndrNm: b.vndrNm,
            batchCount: 0, pendingQty: 0, drctRemainQty: 0, unDrctQty: 0,
            nearestExpiryDt: null, batches: [],
        };
        group.batchCount += 1;
        group.pendingQty += b.pendingQty;
        group.drctRemainQty += b.drctRemainQty;
        group.unDrctQty += b.unDrctQty;
        // 서버가 유통기한 순으로 주므로 첫 값이 곧 최단이다 (미관리는 null로 뒤에 온다)
        if (group.nearestExpiryDt == null) group.nearestExpiryDt = b.expiryDt;
        group.batches.push(b);
        byOrder.set(b.ibNo, group);
    }
    return [...byOrder.values()];
};

export default function PutawayOrderRegister() {
    const [batches, setBatches] = useState([]);
    // 기본 기간 = 과거 7일 ~ 오늘. 이미 검수된 물건을 적치하는 화면이라 미래 날짜에는 대상이 없다
    const [cond, setCond] = useState({ ibNo: '', dateFrom: daysAheadStr(-7), dateTo: todayStr(), prodCd: '', prodNm: '' });
    const [selectedIbNo, setSelectedIbNo] = useState(null);
    const [preview, setPreview] = useState(null);             // 전략 추천 결과 items
    const [confirmCreate, setConfirmCreate] = useState(null); // 지시 생성 확인 대상 (배정이 있는 item들)
    const [manual, setManual] = useState(null);               // 수동 지시 대상 배치
    const [manualLocs, setManualLocs] = useState([]);
    const [manualLocId, setManualLocId] = useState('');
    const [manualQty, setManualQty] = useState('');
    const [confirmManual, setConfirmManual] = useState(null);
    const orderGridRef = useRef(null);
    const pendingOrderRef = useRef(null); // 재조회 후 같은 입고건을 다시 선택하기 위한 키

    const orderRows = useMemo(() => groupByOrder(batches), [batches]);
    const selectedOrder = orderRows.find(o => o.ibNo === selectedIbNo) ?? null;

    const clearManual = () => {
        setManual(null);
        setManualLocs([]);
        setManualLocId('');
        setManualQty('');
    };

    const fetchList = async (keepOrder = false) => {
        pendingOrderRef.current = keepOrder ? selectedIbNo : null;
        if (!keepOrder) setSelectedIbNo(null);
        clearManual();
        setPreview(null);
        try {
            setBatches(await putawayApi.lines(cond));
        } catch (e) {
            toast.error(e.message || '조회에 실패했습니다.');
        }
    };

    const onOrderModelUpdated = (p) => {
        if (pendingOrderRef.current == null) return;
        const ibNo = pendingOrderRef.current;
        pendingOrderRef.current = null;
        p.api.forEachNode(n => { if (n.data.ibNo === ibNo) n.setSelected(true); });
    };

    useEffect(() => {
        let ignore = false;
        putawayApi.lines(cond).then(data => { if (!ignore) setBatches(data); }).catch(() => {});
        return () => { ignore = true; };
    }, []);

    const onOrderSelectionChanged = (e) => {
        const node = e.api.getSelectedNodes()[0];
        setSelectedIbNo(node ? node.data.ibNo : null);
        setPreview(null);
        clearManual();
    };

    // ── 전략 추천 ────────────────────────────────────────────
    // 대상은 선택한 입고건의 미지시 배치 전부. 목록 순서(유통기한 임박순) 그대로 보내야
    // 서버가 그 순서로 로케이션 용량을 채운다
    const handlePreviewClick = async () => {
        if (!selectedOrder) {
            toast('지시를 발행할 입고건을 선택하세요.');
            return;
        }
        const targets = selectedOrder.batches.filter(b => b.unDrctQty > 0);
        if (targets.length === 0) {
            toast('이 입고건은 이미 전량 지시됐습니다.');
            return;
        }
        try {
            const res = await putawayApi.previewTasks(
                targets.map(b => ({ ibLineId: b.ibLineId, lotId: b.lotId, qty: b.unDrctQty })));
            setPreview(res.items);
            const noStrategy = res.items.filter(i => !i.strategySelected).length;
            const short = res.items.filter(i => i.remainQty > 0).length;
            if (noStrategy > 0) toast(`${noStrategy}건은 맞는 적치 전략이 없습니다 — 수동 지시로 발행하세요.`);
            else if (short > 0) toast(`${short}건은 로케이션 용량이 모자라 일부만 배정됐습니다.`);
            else toast.success(`${res.items.length}건의 배정안을 만들었습니다.`);
        } catch (e) {
            toast.error(e.message || '적치 추천에 실패했습니다.');
        }
    };

    const assignable = preview?.filter(i => i.assignments.length > 0) ?? [];
    // 추천 응답에는 Lot번호가 없다 (키는 lotId) — 화면에 띄울 Lot번호는 배치 목록에서 되찾는다
    const lotNoOf = (it) => batches.find(b => b.ibLineId === it.ibLineId && b.lotId === it.lotId)?.lotNo ?? '';

    const handleCreateClick = () => {
        if (assignable.length === 0) {
            toast.error('발행할 배정 결과가 없습니다 — 수동 지시로 처리하세요.');
            return;
        }
        setConfirmCreate(assignable);
    };

    const doCreate = async (items) => {
        try {
            const ids = await putawayApi.createTasks(items.map(i => ({
                ibLineId: i.ibLineId,
                lotId: i.lotId,
                assignments: i.assignments.map(a => ({ locId: a.locId, qty: a.qty })),
            })));
            toast.success(`적치지시 ${ids.length}건을 발행했습니다.`);
            fetchList(true);
        } catch (e) {
            toast.error(e.message || '적치지시 발행에 실패했습니다.');
        }
    };

    // ── 수동 지시 ────────────────────────────────────────────
    // 전략이 없거나 용량이 모자라 남은 잔량을 배치 하나씩 직접 지정해 발행한다
    const onBatchCellClicked = async (e) => {
        const row = e.data;
        if (row.unDrctQty <= 0) {
            clearManual();
            return;
        }
        setManual(row);
        setManualQty(String(row.unDrctQty));
        setManualLocs([]);
        setManualLocId('');
        try {
            const locs = await putawayApi.candidateLocs(row.ibLineId);
            setManualLocs(locs);
            setManualLocId(locs.length > 0 ? locs[0].locId : '');
        } catch (err) {
            toast.error(err.message || '로케이션 후보 조회에 실패했습니다.');
        }
    };

    const handleManualClick = () => {
        const n = Number(manualQty);
        if (!(n > 0) || !Number.isInteger(n)) {
            toast.error('지시수량은 1 이상 정수여야 합니다.');
            return;
        }
        if (n > manual.unDrctQty) {
            toast.error(`미지시 수량을 초과했습니다 (미지시 ${num(manual.unDrctQty)}).`);
            return;
        }
        if (!manualLocId) {
            toast.error('대상 로케이션을 선택하세요.');
            return;
        }
        setConfirmManual({ ...manual, qty: n, locId: Number(manualLocId) });
    };

    const doManual = async (target) => {
        try {
            await putawayApi.createTasks([{
                ibLineId: target.ibLineId,
                lotId: target.lotId,
                assignments: [{ locId: target.locId, qty: target.qty }],
            }]);
            toast.success(`${target.prodCd} ${num(target.qty)}개의 적치지시를 발행했습니다.`);
            fetchList(true);
        } catch (e) {
            toast.error(e.message || '적치지시 발행에 실패했습니다.');
        }
    };

    const locOptions = manualLocs.map(l => ({
        value: l.locId,
        label: `${l.locCd} (${l.zonCd}) · 적재가능 ${l.availQty == null ? '무제한' : num(l.availQty)}`,
    }));
    const locLabel = (locId) => manualLocs.find(l => l.locId === Number(locId))?.locCd ?? '';

    // 하단 배치 그리드 — 수동 지시 대상 강조를 위해 컴포넌트 안에 둔다
    const batchColumnDefs = [
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 160 },
        {
            field: 'tmpZon', headerName: '온도대', width: 90,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
        },
        { field: 'lotNo', headerName: 'Lot번호', width: 140 },
        { field: 'receiptDt', headerName: '입고일자', width: 110, valueFormatter: (p) => fmtDe(p.value) },
        {
            field: 'expiryDt', headerName: '유통기한', width: 110,
            headerTooltip: '목록이 이 값 오름차순(FEFO)이고, 그 순서가 추천 시 로케이션 용량 선점 순서가 된다',
            cellRenderer: (p) => (p.value ? fmtDe(p.value) : <span className="text-slate-400">미관리</span>),
        },
        {
            field: 'pendingQty', headerName: '미적치', width: 100,
            cellClass: 'ag-right-aligned-cell tabular-nums text-slate-600',
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'drctRemainQty', headerName: '지시중', width: 100,
            cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 0 ? 'text-indigo-600 font-bold' : 'text-slate-300'}`,
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'unDrctQty', headerName: '미지시', width: 100,
            headerTooltip: '0이 아니면 행을 클릭해 수동 지시할 수 있다',
            cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 0 ? 'text-amber-600 font-bold' : 'text-slate-300'}`,
            valueFormatter: (p) => num(p.value),
        },
    ];

    return (
        // min-h — 노트북처럼 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[42rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <PackagePlus size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">적치지시 등록</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    입고건 단위로 보관 로케이션을 배정해 지시를 발행합니다 — 실물은 움직이지 않습니다
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" cond={cond} setCond={setCond} onSearch={() => fetchList()}>
                <SearchItem label="입고번호">
                    <input
                        type="text"
                        value={cond.ibNo}
                        onChange={(e) => setCond(prev => ({ ...prev, ibNo: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="IB-20260717-001"
                        className="w-full input-base"
                    />
                </SearchItem>
                <SearchItem label="입고일자" wide>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={cond.dateFrom}
                            onChange={(e) => setCond(prev => ({ ...prev, dateFrom: e.target.value }))}
                            className="flex-1 min-w-0 input-base"
                        />
                        <span className="text-slate-400 shrink-0">~</span>
                        <input
                            type="date"
                            value={cond.dateTo}
                            onChange={(e) => setCond(prev => ({ ...prev, dateTo: e.target.value }))}
                            className="flex-1 min-w-0 input-base"
                        />
                    </div>
                </SearchItem>
                <SearchProd name="prodCd" label="상품 코드" placeholder="PROD-0001" />
                <SearchItem label="상품명">
                    <input
                        type="text"
                        value={cond.prodNm}
                        onChange={(e) => setCond(prev => ({ ...prev, prodNm: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="상품명 일부"
                        className="w-full input-base"
                    />
                </SearchItem>
            </SearchBar>

            <PanelGroup direction="vertical" autoSaveId="wms-putaway-order-split-v1" className="flex-1 min-h-0">
                {/* 상단: 입고건 */}
                <Panel defaultSize={38} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">지시 대상 입고건</span>
                        <span className="text-xs text-slate-400 truncate">
                            검수가 끝나 스테이징에 올라온 입고건 — 한 건을 골라 전체 지시를 겁니다
                        </span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">{orderRows.length}건</span>
                        <button
                            onClick={handlePreviewClick}
                            disabled={!selectedOrder}
                            className="btn-primary shrink-0 disabled:opacity-40"
                            title="이 입고건의 미지시 수량을 적치 전략으로 배정해 봅니다 (아직 발행되지 않습니다)">
                            <Wand2 size={13} /> 이 입고 전체 지시
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={orderGridRef}
                            rowData={orderRows}
                            columnDefs={ORDER_COLUMN_DEFS}
                            getRowId={(p) => p.data.ibNo}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                            onSelectionChanged={onOrderSelectionChanged}
                            onModelUpdated={onOrderModelUpdated}
                            overlayNoRowsTemplate={'<span class="text-sm text-slate-400">적치 대기 중인 입고건이 없습니다 — 「입고 검수」를 먼저 진행하세요</span>'}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                {/* 하단: 선택 입고건의 배치 + 추천 결과 + 수동 지시 */}
                <Panel defaultSize={62} minSize={30} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-slate-700 shrink-0">적치 대상 Lot</span>
                        <span className="text-xs text-slate-400 truncate">
                            {selectedOrder
                                ? `${selectedOrder.ibNo} · ${selectedOrder.vndrNm} — 미지시 ${num(selectedOrder.unDrctQty)}개 · 행을 클릭하면 수동 지시`
                                : '위에서 입고건을 선택하세요'}
                        </span>
                    </div>
                    {/* 추천이 열리면 Lot 그리드 자리를 통째로 차지한다 — 같은 Lot이 추천 결과에 다 나오므로
                        둘을 세로로 같이 두면 노트북 높이에서 그리드만 짜부라진다. 닫기를 누르면 그리드로 복귀 */}
                    <div className="flex-1 min-h-0">
                        {!preview ? (
                            <AgGridReact
                                rowData={selectedOrder?.batches ?? []}
                                columnDefs={batchColumnDefs}
                                getRowId={(p) => `${p.data.ibLineId}:${p.data.lotId}`}
                                rowHeight={34}
                                headerHeight={38}
                                rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                                onCellClicked={onBatchCellClicked}
                                overlayNoRowsTemplate={'<span class="text-sm text-slate-400">위에서 입고건을 선택하세요</span>'}
                            />
                        ) : (
                            /* 추천 결과 — 발행 전 시뮬레이션이라 여기서 확인하고 [지시 생성]을 눌러야 저장된다 */
                            <div className="h-full border border-slate-200 rounded-xl bg-white px-4 py-3 flex flex-col gap-2 overflow-y-auto">
                                <div className="flex items-center gap-3 flex-wrap text-xs sticky top-0 bg-white">
                                    <div className="flex items-center gap-1.5">
                                        <Wand2 size={14} className="text-indigo-600" />
                                        <span className="text-sm font-bold text-slate-700">추천 결과</span>
                                    </div>
                                    <span className="text-slate-400">
                                        Lot {preview.length}건 · 배정 가능 <b className="text-emerald-600">{assignable.length}</b>건
                                    </span>
                                    <button onClick={handleCreateClick} className="btn-primary">
                                        <PackagePlus size={13} /> 지시 생성
                                    </button>
                                    <button onClick={() => setPreview(null)} className="ml-auto btn-ghost">닫기</button>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    {preview.map((it, i) => (
                                        <div key={i} className="text-xs leading-relaxed border-b border-slate-50 last:border-0 pb-1.5 last:pb-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-slate-700">{it.prodCd} {it.prodNm}</span>
                                                <span className="text-slate-400 font-mono">{lotNoOf(it)}</span>
                                                <span className="text-slate-400 tabular-nums">
                                                    요청 {num(it.reqQty)} · 배정 <b className="text-emerald-600">{num(it.asgnQty)}</b>
                                                </span>
                                                {!it.strategySelected && (
                                                    <span className="text-[11px] font-bold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
                                                        적치 전략 없음 — 닫은 뒤 Lot 행을 클릭해 수동 지시로 발행하세요
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                {it.assignments.map((a, j) => (
                                                    <span key={j} className="px-2 py-0.5 bg-white border border-indigo-200 rounded-lg text-[11px]">
                                                        <span className="font-mono text-slate-600">{a.locCd}</span>
                                                        <b className="text-indigo-700 ml-1.5 tabular-nums">{num(a.qty)}</b>
                                                    </span>
                                                ))}
                                                {it.remainQty > 0 && (
                                                    <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200">
                                                        미배정 {num(it.remainQty)} — 로케이션 용량 부족 · 수동 지시 필요
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 수동 지시 — 전략이 없거나 용량이 모자라 남은 수량을 로케이션 하나로 직접 지시한다.
                        Lot 행을 클릭해야 나타난다 — 안 쓸 때도 상주시키면 노트북 높이에서 그리드만 준다
                        (행 클릭 안내는 위 설명 줄의 「행을 클릭하면 수동 지시」가 맡는다) */}
                    {manual && (
                        <div className="border border-slate-200 rounded-xl p-3 bg-white flex flex-col gap-2 shrink-0">
                            <div className="flex items-end gap-3">
                                <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
                                    <span className="font-bold text-slate-700 truncate">{manual.prodCd} {manual.prodNm}</span>
                                    <Badge meta={TEMP_ZONE_META} value={manual.tmpZon} />
                                    <span className="text-xs text-slate-400 shrink-0">
                                        {manual.lotNo} · 미지시 {num(manual.unDrctQty)}개
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1 w-28 shrink-0">
                                    <label className="text-xs font-bold text-slate-500">지시수량</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max={manual.unDrctQty}
                                        value={manualQty}
                                        onChange={(e) => setManualQty(e.target.value)}
                                        className="input-num"
                                    />
                                </div>
                                <div className="flex flex-col gap-1 w-80 shrink-0">
                                    <label className="text-xs font-bold text-slate-500">
                                        대상 로케이션 <span className="text-slate-400 font-normal">(온도대 일치 보관존)</span>
                                    </label>
                                    <DropdownSelect
                                        value={manualLocId}
                                        onChange={setManualLocId}
                                        options={locOptions}
                                        placeholder="로케이션 선택"
                                    />
                                </div>
                                <button
                                    onClick={handleManualClick}
                                    className="flex items-center gap-1 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-colors shrink-0">
                                    <Hand size={14} /> 수동 지시
                                </button>
                            </div>
                        </div>
                    )}
                </Panel>
            </PanelGroup>

            {/* 지시 생성 확인 모달 */}
            {confirmCreate && (
                <ConfirmModal
                    title="추천대로 적치지시를 발행할까요?"
                    confirmText="발행"
                    onCancel={() => setConfirmCreate(null)}
                    onConfirm={() => { doCreate(confirmCreate); setConfirmCreate(null); }}
                >
                    <p className="text-sm text-slate-500">
                        <b>{selectedOrder?.ibNo}</b> · Lot <b>{confirmCreate.length}건</b> · 총 <b className="text-emerald-600">
                        {num(confirmCreate.reduce((s, i) => s + i.asgnQty, 0))}개</b>를
                        {' '}{num(confirmCreate.reduce((s, i) => s + i.assignments.length, 0))}개 로케이션으로 지시합니다.
                    </p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        발행만 하고 재고는 움직이지 않습니다 — 실물 이동은 「적치」 화면에서 실행합니다.
                        전체가 <b>한 트랜잭션</b>이라 한 건이라도 실패하면 이번 발행 전체가 되돌아갑니다.
                    </p>
                </ConfirmModal>
            )}

            {/* 수동 지시 확인 모달 */}
            {confirmManual && (
                <ConfirmModal
                    title="수동으로 적치지시를 발행할까요?"
                    confirmText="발행"
                    onCancel={() => setConfirmManual(null)}
                    onConfirm={() => { doManual(confirmManual); setConfirmManual(null); }}
                >
                    <p className="text-sm text-slate-500">
                        {confirmManual.prodCd} {confirmManual.prodNm} · <b className="text-emerald-600">{num(confirmManual.qty)}개</b>
                    </p>
                    <p className="text-xs text-slate-400 font-mono">
                        RCV-STAGE → {locLabel(confirmManual.locId)}
                    </p>
                    {confirmManual.qty < confirmManual.unDrctQty && (
                        <p className="text-xs text-amber-600">
                            미지시 {num(confirmManual.unDrctQty - confirmManual.qty)}개는 남습니다 — 다시 지시할 수 있습니다.
                        </p>
                    )}
                </ConfirmModal>
            )}
        </div>
    );
}
