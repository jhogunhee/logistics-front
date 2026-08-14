import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { ArrowRight, Layers, PackageOpen } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchText, SearchProd } from '@/components/common/SearchBar';
import ConfirmModal from '@/components/common/ConfirmModal';
import { Badge } from '@/components/common/Badge';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { putawayApi } from '@/api/putawayApi';
import { fmtDe, num } from '@/utils/format';

// 이 화면은 지시 기반 실행이다 — 직접 적치(로케이션 골라 즉시 이동) 경로는 적치지시 도입 때
// 서버와 함께 제거됐다. 한때 병합 충돌이 이 파일만 옛 직접 적치 버전으로 되돌려 실행이
// 존재하지 않는 API를 부르며 죽어 있었다(2026-08-14 복구). 지시 발행은 「적치지시」 화면 몫.

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
        field: 'taskCount', headerName: '지시 건수', width: 100,
        headerTooltip: '이 상품에 걸린 미완료 지시 수. 2건 이상이면 로케이션이 나뉘어 있다는 뜻',
        cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 1 ? 'text-indigo-600 font-bold' : 'text-slate-500'}`,
    },
    {
        field: 'locCount', headerName: '로케이션', width: 100,
        headerTooltip: '이 상품이 들어갈 서로 다른 보관 로케이션 수',
        cellClass: 'ag-right-aligned-cell tabular-nums text-slate-500',
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

// 하단: 선택 상품의 지시들 — 어디에 얼마씩 넣는지가 한눈에 보여야 한 번 들고 나가 나눠 넣는다
const TASK_COLUMN_DEFS = [
    { field: 'ibNo', headerName: '입고번호', width: 165 },
    { field: 'lotNo', headerName: 'Lot번호', width: 140 },
    {
        field: 'expiryDt', headerName: '유통기한', width: 110,
        cellRenderer: (p) => (p.value ? fmtDe(p.value) : <span className="text-slate-400">미관리</span>),
    },
    {
        // 이 화면의 핵심 정보 — 작업자는 여기 적힌 로케이션으로만 물건을 넣는다
        field: 'toLocCd', headerName: '대상 로케이션', width: 160,
        headerTooltip: '지시된 적치 위치. 다른 곳에 넣으려면 적치지시 화면에서 취소 후 재지시해야 한다',
        cellClass: 'font-mono font-bold text-indigo-700',
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
];

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

export default function Putaway() {
    const [tasks, setTasks] = useState([]);
    const [cond, setCond] = useState({ ibNo: '', prodCd: '', toLocCd: '' });
    const [selectedProdCd, setSelectedProdCd] = useState(null);
    const [selectedTask, setSelectedTask] = useState(null);
    const [qty, setQty] = useState('');
    const [confirmOne, setConfirmOne] = useState(null);  // 건별 실행 확인 대상
    const [confirmAll, setConfirmAll] = useState(null);  // 상품 전량 실행 확인 대상 (그룹)
    const prodGridRef = useRef(null);
    const pendingProdRef = useRef(null); // 재조회 후 같은 상품을 다시 선택하기 위한 키

    const prodRows = useMemo(() => groupByProd(tasks), [tasks]);
    const selectedProd = prodRows.find(g => g.prodCd === selectedProdCd) ?? null;

    const fetchList = async (keepProd = false) => {
        pendingProdRef.current = keepProd ? selectedProdCd : null;
        if (!keepProd) {
            setSelectedProdCd(null);
        }
        setSelectedTask(null);
        setQty('');
        try {
            setTasks(await putawayApi.tasks({ status: 'DIRECTED', ...cond }));
        } catch (e) {
            toast.error(e.message || '조회에 실패했습니다.');
        }
    };

    // 상품 목록이 다시 그려진 뒤 이전 선택을 복구한다 (부분 실행 후에도 자리를 지키도록)
    const onProdModelUpdated = (p) => {
        if (pendingProdRef.current == null) return;
        const prodCd = pendingProdRef.current;
        pendingProdRef.current = null;
        p.api.forEachNode(n => { if (n.data.prodCd === prodCd) n.setSelected(true); });
    };

    useEffect(() => {
        let ignore = false;
        putawayApi.tasks({ status: 'DIRECTED' }).then(data => { if (!ignore) setTasks(data); }).catch(() => {});
        return () => { ignore = true; };
    }, []);

    const onProdSelectionChanged = (e) => {
        const node = e.api.getSelectedNodes()[0];
        setSelectedProdCd(node ? node.data.prodCd : null);
        setSelectedTask(null);
        setQty('');
    };

    const onTaskSelectionChanged = (e) => {
        const node = e.api.getSelectedNodes()[0];
        if (!node) {
            setSelectedTask(null);
            setQty('');
            return;
        }
        setSelectedTask(node.data);
        setQty(String(node.data.remainingQty));
    };

    // ── 건별 실행 (부분 가능) ────────────────────────────────
    const handleExecuteClick = () => {
        const n = Number(qty);
        if (!(n > 0) || !Number.isInteger(n)) {
            toast.error('적치수량은 1 이상 정수여야 합니다.');
            return;
        }
        if (n > selectedTask.remainingQty) {
            toast.error(`잔여수량을 초과했습니다 (잔여 ${num(selectedTask.remainingQty)}).`);
            return;
        }
        setConfirmOne({ ...selectedTask, qty: n });
    };

    const doExecuteOne = async (target) => {
        try {
            await putawayApi.execute(target.putawayTaskId, target.qty);
            toast.success(`${target.prodCd} ${num(target.qty)}개를 ${target.toLocCd}에 적치했습니다.`);
            fetchList(true);
        } catch (e) {
            toast.error(e.message || '적치에 실패했습니다.');
        }
    };

    // ── 상품 전량 실행 ───────────────────────────────────────
    // 지시대로 다 옮기는 것이 대부분이라 이쪽이 주 동선이다. 부분 실행만 아래 건별 패널이 맡는다
    const doExecuteAll = async (group) => {
        try {
            await putawayApi.executeAll(group.tasks.map(t => ({ taskId: t.putawayTaskId, qty: t.remainingQty })));
            toast.success(`${group.prodCd} ${num(group.remainingQty)}개를 ${group.locCount}개 로케이션에 적치했습니다.`);
            fetchList(false); // 전량 실행이면 그 상품이 목록에서 빠진다
        } catch (e) {
            toast.error(e.message || '일괄 적치에 실패했습니다.');
        }
    };

    return (
        // min-h — 노트북처럼 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[42rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <PackageOpen size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">적치</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    발행된 적치지시를 실행 — 지시받은 로케이션으로만 적치(부분 실행 허용)
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" cond={cond} setCond={setCond} onSearch={() => fetchList()}>
                <SearchProd name="prodCd" />
                <SearchText name="ibNo" label="입고번호" placeholder="IB-20260717-001" />
                <SearchText name="toLocCd" label="대상 로케이션" placeholder="DRY-A-01-01" />
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
                        <button
                            onClick={() => selectedProd ? setConfirmAll(selectedProd) : toast('적치할 상품을 선택하세요.')}
                            disabled={!selectedProd}
                            className="btn-primary shrink-0 disabled:opacity-40"
                            title="이 상품의 지시를 잔여 전량으로 한 번에 실행합니다">
                            <Layers size={13} /> 전량 적치
                        </button>
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

                {/* 하단: 선택 상품의 지시 + 건별 실행 */}
                <Panel defaultSize={55} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-slate-700 shrink-0">적치 위치</span>
                        <span className="text-xs text-slate-400 truncate">
                            {selectedProd
                                ? `${selectedProd.prodCd} ${selectedProd.prodNm} — ${selectedProd.locCount}개 로케이션 · 잔여 ${num(selectedProd.remainingQty)}개`
                                : '위에서 상품을 선택하세요'}
                        </span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            rowData={selectedProd?.tasks ?? []}
                            columnDefs={TASK_COLUMN_DEFS}
                            getRowId={(p) => String(p.data.putawayTaskId)}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                            onSelectionChanged={onTaskSelectionChanged}
                            overlayNoRowsTemplate={'<span class="text-sm text-slate-400">위에서 상품을 선택하세요</span>'}
                        />
                    </div>

                    {/* 건별(부분) 실행 — 지시대로 다 못 옮기는 경우에만 쓴다 */}
                    <div className="border border-slate-200 rounded-xl p-3 bg-white flex flex-col gap-2 shrink-0">
                        {!selectedTask ? (
                            <span className="text-xs text-slate-400">
                                일부만 옮겼다면 위에서 해당 로케이션 행을 골라 수량을 입력하세요 (전량이면 위쪽 「전량 적치」).
                            </span>
                        ) : (
                            <div className="flex items-end gap-3">
                                <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
                                    <span className="text-xs text-slate-400 shrink-0">{selectedTask.lotNo}</span>
                                    <span className="text-sm font-mono shrink-0">
                                        RCV-STAGE <span className="text-slate-400">→</span> <b className="text-indigo-700">{selectedTask.toLocCd}</b>
                                    </span>
                                    <span className="text-xs text-slate-400 shrink-0">잔여 {num(selectedTask.remainingQty)}개</span>
                                </div>
                                <div className="flex flex-col gap-1 w-28 shrink-0">
                                    <label className="text-xs font-bold text-slate-500">적치수량</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max={selectedTask.remainingQty}
                                        value={qty}
                                        onChange={(e) => setQty(e.target.value)}
                                        className="input-num"
                                    />
                                </div>
                                <button
                                    onClick={handleExecuteClick}
                                    className="flex items-center gap-1 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-colors shrink-0">
                                    <ArrowRight size={14} /> 이 건만 적치
                                </button>
                            </div>
                        )}
                    </div>
                </Panel>
            </PanelGroup>

            {/* 전량 적치 확인 모달 */}
            {confirmAll && (
                <ConfirmModal
                    title="이 상품을 전량 적치할까요?"
                    confirmText="적치"
                    onCancel={() => setConfirmAll(null)}
                    onConfirm={() => { doExecuteAll(confirmAll); setConfirmAll(null); }}
                >
                    <p className="text-sm text-slate-500">
                        {confirmAll.prodCd} {confirmAll.prodNm} · <b className="text-emerald-600">{num(confirmAll.remainingQty)}개</b>
                    </p>
                    <div className="flex flex-col gap-1 text-xs font-mono bg-slate-50 rounded-lg px-3 py-2">
                        {confirmAll.tasks.map(t => (
                            <div key={t.putawayTaskId} className="flex justify-between gap-3">
                                <span className="text-slate-500">RCV-STAGE → <b className="text-indigo-700">{t.toLocCd}</b></span>
                                <span className="tabular-nums text-slate-700">{num(t.remainingQty)}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-slate-400">
                        {confirmAll.taskCount}건이 한 트랜잭션으로 처리됩니다 — 하나라도 실패하면 전부 되돌아갑니다.
                    </p>
                </ConfirmModal>
            )}

            {/* 건별 실행 확인 모달 */}
            {confirmOne && (
                <ConfirmModal
                    title="적치하시겠습니까?"
                    confirmText="적치"
                    onCancel={() => setConfirmOne(null)}
                    onConfirm={() => { doExecuteOne(confirmOne); setConfirmOne(null); }}
                >
                    <p className="text-sm text-slate-500">
                        {confirmOne.prodCd} {confirmOne.prodNm} · <b className="text-emerald-600">{num(confirmOne.qty)}개</b>
                    </p>
                    <p className="text-xs text-slate-400 font-mono">RCV-STAGE → {confirmOne.toLocCd}</p>
                    {confirmOne.qty < confirmOne.remainingQty && (
                        <p className="text-xs text-amber-600">
                            부분 실행 — 잔여 {num(confirmOne.remainingQty - confirmOne.qty)}개는 지시 상태로 남습니다.
                        </p>
                    )}
                </ConfirmModal>
            )}
        </div>
    );
}
