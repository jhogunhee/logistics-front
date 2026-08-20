import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Layers, PackageOpen, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';

import { putawayApi } from '@/api/putawayApi';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { fmtDe, num } from '@/utils/format';
import SearchBar, { SearchText, SearchProd } from '@/components/common/SearchBar';
import ConfirmModal from '@/components/common/ConfirmModal';
import { Badge } from '@/components/common/Badge';

// 이 화면은 지시 기반 실행이다 — 직접 적치(로케이션 골라 즉시 이동) 경로는 적치지시 도입 때
// 서버와 함께 제거됐다. 한때 병합 충돌이 이 파일만 옛 직접 적치 버전으로 되돌려 실행이
// 존재하지 않는 API를 부르며 죽어 있었다(2026-08-14 복구). 지시 발행은 「적치지시」 화면 몫.

/** 지시 목록을 상품별로 접는다 — 서버는 지시 1건씩 주고, 화면의 작업 단위인 상품은 여기서 만든다 */
const groupByProd = (tasks) => {
    const byProd = new Map();
    for (const t of tasks) {
        const group = byProd.get(t.prodCd) ?? {
            prodCd: t.prodCd, prodNm: t.prodNm, tmpZon: t.tmpZon,
            taskCount: 0, remainingQty: 0, nearestExpiryDt: null, locCds: new Set(), tasks: [],
        };
        group.taskCount += 1;
        group.remainingQty += t.remainingQty;
        group.locCds.add(t.toLocCd);
        // 서버가 유통기한 순으로 주므로 첫 값이 곧 최단이다 (미관리는 null로 뒤에 온다)
        if (group.nearestExpiryDt == null) group.nearestExpiryDt = t.expiryDt;
        group.tasks.push(t);
        byProd.set(t.prodCd, group);
    }
    return [...byProd.values()].map(g => ({ ...g, locCount: g.locCds.size }));
};

// 상단: 상품별 집계 — 작업자가 스테이징에서 집어 드는 단위가 상품이라 이 축으로 묶는다
const PROD_COLUMN_DEFS = [
    { field: 'prodCd', headerName: '상품 코드', width: 115 },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 180 },
    {
        field: 'tmpZon', headerName: '온도대', width: 90,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
    },
    {
        // 지시 건수 컬럼은 두지 않는다 — 같은 로케이션으로 지시가 갈리는 일이 드물어 로케이션 수와
        // 거의 항상 같고, 작업자에게 본질적인 정보는 「몇 군데로 나눠 넣나」 하나다
        field: 'locCount', headerName: '로케이션', width: 100,
        headerTooltip: '이 상품이 들어갈 서로 다른 보관 로케이션 수 — 2 이상이면 한 번 들고 나가 나눠 넣는다',
        cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 1 ? 'text-indigo-600 font-bold' : 'text-slate-500'}`,
    },
    {
        field: 'remainingQty', headerName: '잔여수량', width: 110,
        headerTooltip: '이 상품에 남은 적치 대상 총량',
        cellClass: 'ag-right-aligned-cell tabular-nums font-bold text-amber-600',
        valueFormatter: (p) => num(p.value),
    },
    {
        field: 'nearestExpiryDt', headerName: '최단 유통기한', width: 130,
        headerTooltip: '이 상품 지시 중 가장 임박한 유통기한. 목록은 이 값 순서라 위에서부터 처리하면 FEFO가 지켜진다',
        cellRenderer: (p) => (p.value ? fmtDe(p.value) : <span className="text-slate-400">미관리</span>),
    },
];

// 하단 지시 그리드 컬럼은 실행 버튼이 컴포넌트 상태를 써야 해서 컴포넌트 안에 둔다
// (적치지시 등록의 batchColumnDefs와 같은 이유)

export default function Putaway() {
    const [cond, setCond] = useState({ ibNo: '', prodCd: '' });
    const [tasks, setTasks] = useState([]);
    const [selectedProdCd, setSelectedProdCd] = useState(null);
    const [confirmSave, setConfirmSave] = useState(null); // 적치 저장 확인 모달 대상 (수량 입력된 지시들)
    const [locChange, setLocChange] = useState(null); // 로케이션 변경 팝업 { task, locs, locId } — locs null = 조회 중
    const prodGridRef = useRef(null);
    const pendingProdRef = useRef(null); // 재조회 후 같은 상품을 다시 선택하기 위한 키

    const prodRows = useMemo(() => groupByProd(tasks), [tasks]);
    const selectedProd = prodRows.find(g => g.prodCd === selectedProdCd) ?? null;

    // 하단: 선택 상품의 지시들 — 어디에 얼마씩 넣는지가 한눈에 보여야 한 번 들고 나가 나눠 넣는다.
    // 작업 순서대로 [어디로(로케이션) → 얼마나(지시·완료·잔여) → 이번에 옮길 수량]을 앞에 모으고,
    // 근거(Lot·유통기한·입고번호)는 뒤로 보낸다. 입고번호가 flex로 남는 폭을 흡수해 행이 끝까지 찬다
    const taskColumnDefs = [
        {
            // 이 화면의 핵심 정보 — 작업자는 여기 적힌 로케이션으로만 물건을 넣는다.
            // 자리에 못 넣는 상황(파손·실물 점유)은 연필 버튼으로 지시 자체를 고친 뒤 실행한다
            field: 'toLocCd', headerName: '대상 로케이션', width: 160,
            headerTooltip: '지시된 적치 위치. 다른 곳에 넣으려면 연필 버튼으로 지시를 변경한 뒤 실행한다 — 수량을 줄이면 그만큼만 새 지시로 분할',
            cellRenderer: (p) => (
                <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-indigo-700">{p.value}</span>
                    <button
                        title="대상 로케이션 변경 — 수량을 줄이면 그만큼 새 지시로 분할"
                        onClick={() => openLocChange(p.data)}
                        className="text-slate-300 hover:text-indigo-600"
                    >
                        <Pencil size={13} />
                    </button>
                </div>
            ),
        },
        {
            field: 'drctQty', headerName: '지시수량', width: 100,
            cellClass: 'ag-right-aligned-cell tabular-nums font-medium', valueFormatter: (p) => num(p.value),
        },
        {
            field: 'cmplQty', headerName: '완료수량', width: 100,
            cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 0 ? 'text-emerald-600 font-bold' : 'text-slate-300'}`,
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'remainingQty', headerName: '잔여수량', width: 100,
            headerTooltip: '잔여 = 지시 - 완료. 이번에 실행할 수 있는 상한',
            cellClass: 'ag-right-aligned-cell tabular-nums font-bold text-amber-600',
            valueFormatter: (p) => num(p.value),
        },
        {
            field: '_execQty', headerName: '적치수량', width: 100, editable: true,
            cellDataType: 'number',
            cellEditor: 'agNumberCellEditor', cellEditorParams: { min: 1, precision: 0 },
            valueFormatter: (p) => num(p.value),
            // 잔여 초과 상태인 동안 셀을 붉게 — 토스트는 사라져도 안 고친 행이 계속 눈에 걸린다
            cellClass: (p) => Number(p.value) > p.data.remainingQty
                ? 'ag-right-aligned-cell bg-rose-50 text-rose-600 font-bold'
                : 'ag-right-aligned-cell bg-indigo-50',
            headerTooltip: '이번에 옮길 수량 — 기본값은 잔여 전량, 일부만 옮겼으면 고치고, 안 옮길 행은 지워서 제외',
        },
        { field: 'lotNo', headerName: 'Lot번호', width: 140, cellClass: 'text-slate-500' },
        {
            field: 'expiryDt', headerName: '유통기한', width: 110,
            cellRenderer: (p) => (p.value ? fmtDe(p.value) : <span className="text-slate-400">미관리</span>),
        },
        { field: 'ibNo', headerName: '입고번호', flex: 1, minWidth: 165, cellClass: 'text-slate-500' },
    ];

    const fetchList = async (keepProd = false) => {
        pendingProdRef.current = keepProd ? selectedProdCd : null;
        if (!keepProd) {
            setSelectedProdCd(null);
        }
        try {
            const data = await putawayApi.tasks({ status: 'DIRECTED', ...cond });
            // 적치수량 편집 컬럼의 기본값 = 잔여 전량 — 부분 실행할 때만 고친다
            setTasks(data.map(t => ({ ...t, _execQty: t.remainingQty })));
        } catch (e) {
            toast.error(e.message || '조회에 실패했습니다.');
        }
    };

    useEffect(() => {
        let ignore = false;
        putawayApi.tasks({ status: 'DIRECTED' }).then(data => {
            if (!ignore) setTasks(data.map(t => ({ ...t, _execQty: t.remainingQty })));
        }).catch(() => {});
        return () => { ignore = true; };
    }, []);

    // 상품 목록이 다시 그려진 뒤 이전 선택을 복구한다 (부분 실행 후에도 자리를 지키도록)
    const onProdModelUpdated = (p) => {
        if (pendingProdRef.current == null) return;
        const prodCd = pendingProdRef.current;
        pendingProdRef.current = null;
        p.api.forEachNode(n => { if (n.data.prodCd === prodCd) n.setSelected(true); });
    };

    const onProdSelectionChanged = (e) => {
        const node = e.api.getSelectedNodes()[0];
        setSelectedProdCd(node ? node.data.prodCd : null);
    };

    // 적치수량 초과는 적는 순간(편집 확정 시점) 한 번 알린다 — 값을 잔여로 깎아주지는 않는다.
    // 조용한 자동 수정은 그럴듯한 오답을 깔아주는 것(제조일자 기본값을 뺀 것과 같은 원칙).
    // 셀 붉은 표시가 남아 있고, [적치 저장] 검증과 서버 검증이 뒤를 받친다
    const onTaskCellValueChanged = (e) => {
        if (e.colDef.field !== '_execQty') return;
        if (Number(e.newValue) > e.data.remainingQty) {
            toast.error(`적치수량이 잔여수량(${num(e.data.remainingQty)})을 초과했습니다.`);
        }
    };

    // ── 로케이션 변경·분할 — 지시받은 자리에 못 넣을 때 지시 자체를 고친다 (실행은 여전히 지시대로).
    //    수량을 잔여보다 적게 입력하면 그만큼만 새 지시로 떨어져 나간다 ──
    const openLocChange = async (task) => {
        setLocChange({ task, locs: null, locId: '', qty: String(task.remainingQty) });
        try {
            const locs = await putawayApi.candidateLocs(task.ibLineId);
            setLocChange(prev => (prev?.task === task ? { ...prev, locs } : prev));
        } catch (e) {
            toast.error(e.message || '로케이션 후보 조회에 실패했습니다.');
            setLocChange(null);
        }
    };

    const doChangeLoc = async () => {
        const { task, locs, locId, qty } = locChange;
        const n = Number(qty);
        if (!(n > 0) || !Number.isInteger(n)) {
            toast.error('변경 수량은 1 이상 정수여야 합니다.');
            return;
        }
        if (n > task.remainingQty) {
            toast.error(`변경 수량이 잔여수량(${num(task.remainingQty)})을 초과했습니다.`);
            return;
        }
        if (!locId) {
            toast('변경할 로케이션을 선택하세요.');
            return;
        }
        const loc = locs.find(l => l.locId === locId);
        const isSplit = n < task.remainingQty || task.cmplQty > 0;
        try {
            await putawayApi.changeLoc(task.putawayTaskId, locId, n);
            toast.success(isSplit
                ? `${num(n)}개를 ${loc.locCd}(으)로 분할 지시했습니다.`
                : `대상 로케이션을 ${loc.locCd}(으)로 변경했습니다.`);
            setLocChange(null);
            fetchList(true);
        } catch (e) {
            toast.error(e.message || '로케이션 변경에 실패했습니다.');
        }
    };

    // ── 적치 저장 (일괄 실행) — 그리드에 입력 → 저장 → 확인 모달, 검수·이동확정과 같은 패턴 ──
    // 적치수량 기본값이 잔여 전량이라 아무것도 안 고치고 저장하면 곧 전량 적치다 (별도 전량 버튼을 안 두는 이유).
    // 안 옮길 행은 수량을 지운다 — 빈 값 = 제외 (검수 저장의 「입력한 라인만」 규칙과 동일)
    const handleSaveClick = () => {
        if (!selectedProd) {
            toast('적치할 상품을 선택하세요.');
            return;
        }
        const targets = selectedProd.tasks.filter(t => String(t._execQty ?? '').trim() !== '');
        if (targets.length === 0) {
            toast('적치수량을 입력한 지시가 없습니다.');
            return;
        }
        for (const t of targets) {
            const n = Number(t._execQty);
            if (!(n > 0) || !Number.isInteger(n)) {
                toast.error(`적치수량은 1 이상 정수여야 합니다: ${t.toLocCd}`);
                return;
            }
            if (n > t.remainingQty) {
                toast.error(`적치수량이 잔여수량(${num(t.remainingQty)})을 초과했습니다: ${t.toLocCd}`);
                return;
            }
        }
        setConfirmSave(targets);
    };

    const doSave = async (targets) => {
        const totalQty = targets.reduce((s, t) => s + Number(t._execQty), 0);
        try {
            await putawayApi.executeAll(targets.map(t => ({ taskId: t.putawayTaskId, qty: Number(t._execQty) })));
            toast.success(`${num(totalQty)}개를 ${new Set(targets.map(t => t.toLocCd)).size}개 로케이션에 적치했습니다.`);
            // 잔여가 남으면 같은 상품 선택을 유지해 이어서 처리한다 (전량이면 상품이 목록에서 빠진다)
            const partial = targets.length < selectedProd.tasks.length
                || targets.some(t => Number(t._execQty) < t.remainingQty);
            fetchList(partial);
        } catch (e) {
            toast.error(e.message || '적치 저장에 실패했습니다.');
        }
    };

    return (
        // min-h — 노트북처럼 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <PackageOpen size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">적치</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    발행된 적치지시를 실행 — 지시받은 로케이션으로만 적치(부분 실행 허용)
                </span>
            </div>

            {/* 검색 조건 — 대상 로케이션은 두지 않는다. 이 화면의 축은 상품이고(집어 드는 단위),
                로케이션은 상품을 고르면 아래에 나오는 결과다. 조건으로 걸면 상단 상품 집계가 그
                로케이션 몫만 더해 잔여수량이 실제와 달라진다. 「이 로케이션에 뭐가 걸렸나」는
                지시 단위 목록인 적치지시 관리 화면이 답한다 */}
            <SearchBar label="검색" cond={cond} setCond={setCond} onSearch={() => fetchList()}>
                <SearchProd name="prodCd" />
                <SearchText name="ibNo" label="입고번호" placeholder="IB-20260717-001" />
            </SearchBar>

            <PanelGroup direction="vertical" autoSaveId="wms-putaway-split-v1" className="flex-1 min-h-0">
                {/* 상단: 적치할 상품 */}
                <Panel defaultSize={45} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">적치할 상품</span>
                        <span className="text-xs text-slate-400 truncate">
                            유통기한 임박순 — 상품을 고르면 아래에 어느 로케이션으로 얼마씩 가는지 나옵니다
                        </span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">{prodRows.length}개 상품</span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={prodGridRef}
                            rowData={prodRows}
                            columnDefs={PROD_COLUMN_DEFS}
                            getRowId={(p) => p.data.prodCd}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                            onSelectionChanged={onProdSelectionChanged}
                            onModelUpdated={onProdModelUpdated}
                            overlayNoRowsTemplate={'<span class="text-sm text-slate-400">실행할 적치지시가 없습니다 — 「적치지시」 화면에서 먼저 지시를 발행하세요</span>'}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                {/* 하단: 선택 상품의 지시 + 적치 저장 */}
                <Panel defaultSize={55} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-slate-700 shrink-0">적치 위치</span>
                        <span className="text-xs text-slate-400 truncate">
                            {selectedProd
                                ? `${selectedProd.prodCd} ${selectedProd.prodNm} — ${selectedProd.locCount}개 로케이션 · 잔여 ${num(selectedProd.remainingQty)}개 · 일부만 옮겼으면 적치수량을 고치고, 안 옮길 행은 지우세요`
                                : '위에서 상품을 선택하세요'}
                        </span>
                        <button
                            onClick={handleSaveClick}
                            disabled={!selectedProd}
                            className="btn-primary ml-auto shrink-0 disabled:opacity-40">
                            <Layers size={13} /> 적치 저장
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            rowData={selectedProd?.tasks ?? []}
                            columnDefs={taskColumnDefs}
                            getRowId={(p) => String(p.data.putawayTaskId)}
                            rowHeight={34}
                            headerHeight={38}
                            // 편집 컬럼이 적치수량 하나뿐이라 더블클릭 관례 대신 한 번 클릭으로 연다 —
                            // 이전 UI(행 클릭 → 패널)에 익숙하면 더블클릭을 몰라 부분 실행이 안 되는 것처럼 보인다
                            singleClickEdit={true}
                            stopEditingWhenCellsLoseFocus={true}
                            onCellValueChanged={onTaskCellValueChanged}
                            overlayNoRowsTemplate={'<span class="text-sm text-slate-400">위에서 상품을 선택하세요</span>'}
                        />
                    </div>
                </Panel>
            </PanelGroup>

            {/* 적치 저장 확인 모달 — 행별 (로케이션, 수량)을 나열해 숫자를 보고 누르게 한다 */}
            {confirmSave && (
                <ConfirmModal
                    title="적치를 저장하시겠습니까?"
                    confirmText="적치"
                    onCancel={() => setConfirmSave(null)}
                    onConfirm={() => { doSave(confirmSave); setConfirmSave(null); }}
                >
                    <p className="text-sm text-slate-500">
                        {selectedProd?.prodCd} {selectedProd?.prodNm} · <b className="text-emerald-600">
                        {num(confirmSave.reduce((s, t) => s + Number(t._execQty), 0))}개</b>
                    </p>
                    <div className="flex flex-col gap-1 text-xs font-mono bg-slate-50 rounded-lg px-3 py-2">
                        {confirmSave.map(t => (
                            <div key={t.putawayTaskId} className="flex justify-between gap-3">
                                <span className="text-slate-500">RCV-STAGE → <b className="text-indigo-700">{t.toLocCd}</b></span>
                                <span className="tabular-nums text-slate-700">
                                    {num(t._execQty)}
                                    {Number(t._execQty) < t.remainingQty && (
                                        <span className="text-amber-600"> (잔여 {num(t.remainingQty - t._execQty)} 남음)</span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-slate-400">
                        {confirmSave.length}건이 한 트랜잭션으로 처리됩니다 — 하나라도 실패하면 전부 되돌아갑니다.
                    </p>
                </ConfirmModal>
            )}

            {/* 로케이션 변경·분할 팝업 — 실물을 옮기지 않고 지시만 고친다.
                수량 < 잔여면 그만큼만 새 지시로 분할 (부분 실행된 지시의 잔여분도 이 경로) */}
            {locChange && (() => {
                const moveQty = Number(locChange.qty) > 0 ? Number(locChange.qty) : locChange.task.remainingQty;
                return (
                <ConfirmModal
                    title="대상 로케이션 변경"
                    confirmText="변경"
                    onCancel={() => setLocChange(null)}
                    onConfirm={doChangeLoc}
                >
                    <p className="text-sm text-slate-500">
                        {selectedProd?.prodCd} {selectedProd?.prodNm} · 잔여 <b className="text-slate-700">{num(locChange.task.remainingQty)}</b>개
                        <br />현재 <b className="font-mono text-indigo-700">{locChange.task.toLocCd}</b> → 아래에서 새 위치를 선택하세요
                    </p>
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-slate-600 shrink-0">변경 수량</label>
                        <input
                            type="number"
                            min={1}
                            max={locChange.task.remainingQty}
                            value={locChange.qty}
                            onChange={(e) => setLocChange(prev => ({ ...prev, qty: e.target.value }))}
                            className="w-24 input-base text-right tabular-nums"
                        />
                        <span className="text-xs text-slate-400">
                            {moveQty < locChange.task.remainingQty
                                ? `${num(moveQty)}개만 새 지시로 분할되고 ${num(locChange.task.remainingQty - moveQty)}개는 현재 위치에 남습니다`
                                : '잔여 전량을 새 위치로 보냅니다'}
                        </span>
                    </div>
                    {locChange.locs === null ? (
                        <p className="text-xs text-slate-400">로케이션 후보를 불러오는 중…</p>
                    ) : (
                        <div className="flex flex-col max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                            {locChange.locs.map(l => {
                                const isCurrent = l.locCd === locChange.task.toLocCd;
                                const short = l.availQty != null && l.availQty < moveQty;
                                return (
                                    <button
                                        key={l.locId}
                                        disabled={isCurrent || short}
                                        onClick={() => setLocChange(prev => ({ ...prev, locId: l.locId }))}
                                        className={`flex items-center gap-3 px-3 py-2 text-left text-xs
                                            ${locChange.locId === l.locId ? 'bg-indigo-50' : 'hover:bg-slate-50'}
                                            ${isCurrent || short ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    >
                                        <span className="font-mono font-bold text-slate-700">{l.locCd}</span>
                                        <span className="text-slate-400">{l.zonCd}</span>
                                        <span className="tabular-nums ml-auto text-slate-500">
                                            {isCurrent ? '현재 지시 위치'
                                                : l.availQty == null ? '적재가능 무제한'
                                                : short ? `적재가능 ${num(l.availQty)} — 부족`
                                                : `적재가능 ${num(l.availQty)}`}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    <p className="text-xs text-slate-400">
                        실물은 움직이지 않습니다 — 지시만 바뀌고, 적치는 저장할 때 각 지시의 위치로 실행됩니다.
                    </p>
                </ConfirmModal>
                );
            })()}
        </div>
    );
}
