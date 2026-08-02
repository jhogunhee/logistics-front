import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ArrowRight, Ban, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import { invMovApi, INV_MOV_STATUS_META, INV_MOV_DVSN_META } from '@/api/invMovApi';

const num = (v) => (v == null ? '' : Number(v).toLocaleString());
const fmtDt = (v) => (v ? v.replace('T', ' ').slice(0, 16) : '');

const STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(INV_MOV_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];

const DVSN_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(INV_MOV_DVSN_META).map(([value, m]) => ({ value, label: m.label })),
];

const DvsnBadge = ({ value }) => {
    const meta = INV_MOV_DVSN_META[value];
    if (!meta) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${meta.badge}`}>
            {meta.label}
        </span>
    );
};

const StatusBadge = ({ value }) => {
    const meta = INV_MOV_STATUS_META[value];
    if (!meta) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${meta.badge}`}>
            {meta.label}
        </span>
    );
};

const COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'invMovNo', headerName: '이동지시번호', width: 150 },
    {
        field: 'movDvsn', headerName: '이동구분', width: 100,
        headerTooltip: '이 화면의 확정·취소는 재고이동 유형만 가능 — 적치·피킹은 각자의 화면에서 처리',
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <DvsnBadge value={p.value} />,
    },
    {
        field: 'status', headerName: '상태', width: 90,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <StatusBadge value={p.value} />,
    },
    { field: 'prodCd', headerName: '상품 코드', width: 115 },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 160 },
    { field: 'lotNo', headerName: 'Lot번호', width: 130 },
    {
        headerName: '이동 (FROM → TO)', width: 220,
        cellRenderer: (p) => (
            <span className="font-mono text-xs">
                {p.data.fromLocCd} <span className="text-slate-400">→</span> <b className="text-indigo-700">{p.data.toLocCd}</b>
            </span>
        ),
    },
    {
        field: 'drctQty', headerName: '지시', width: 85, cellClass: 'ag-right-aligned-cell font-medium',
        valueFormatter: (p) => num(p.value),
    },
    {
        field: 'cmplQty', headerName: '완료', width: 85,
        cellClass: (p) => `ag-right-aligned-cell ${p.value > 0 ? 'text-emerald-600 font-bold' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
    {
        field: 'remainingQty', headerName: '잔여', width: 85,
        headerTooltip: '잔여 = 지시 - 완료. DIRECTED의 잔여가 예약으로 잡혀 있는 수량',
        cellClass: (p) => `ag-right-aligned-cell font-bold ${p.value > 0 ? 'text-amber-600' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
    { field: 'createdAt', headerName: '등록일시', width: 140, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
    { field: 'cmplDt', headerName: '완료일시', width: 140, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
];

export default function StockMoveTaskList() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ invMovNo: '', movDvsn: '', prodCd: '', fromLocCd: '', toLocCd: '', status: '' });
    const [selected, setSelected] = useState(null);
    const [qty, setQty] = useState('');
    const [confirmTarget, setConfirmTarget] = useState(null); // 확정 확인 모달 대상
    const [cancelTarget, setCancelTarget] = useState(null);   // 취소 확인 모달 대상
    const gridRef = useRef(null);
    const pendingSelectRef = useRef(null); // 재조회 후 같은 지시를 다시 선택 (부분확정 시 유지)

    const fetchList = async (keepSelection = false) => {
        if (keepSelection) {
            pendingSelectRef.current = selected ? selected.invMovTaskId : null;
        } else {
            setSelected(null);
            setQty('');
        }
        const data = await invMovApi.list(cond);
        setRowData(data);
    };

    const onModelUpdated = (p) => {
        if (pendingSelectRef.current == null) return;
        const taskId = pendingSelectRef.current;
        pendingSelectRef.current = null;
        p.api.forEachNode(n => { if (n.data.invMovTaskId === taskId) n.setSelected(true); });
    };

    useEffect(() => {
        let ignore = false;
        invMovApi.list().then(data => { if (!ignore) setRowData(data); });
        return () => { ignore = true; };
    }, []);

    const onSelectionChanged = (e) => {
        const node = e.api.getSelectedNodes()[0];
        if (!node) {
            setSelected(null);
            setQty('');
            return;
        }
        setSelected(node.data);
        setQty(String(node.data.remainingQty));
    };

    const handleConfirmClick = () => {
        const n = Number(qty);
        if (!(n > 0)) {
            toast.error('확정수량은 1 이상이어야 합니다.');
            return;
        }
        if (n > selected.remainingQty) {
            toast.error(`잔여수량을 초과했습니다 (잔여 ${num(selected.remainingQty)}).`);
            return;
        }
        setConfirmTarget({ ...selected, qty: n });
    };

    const doConfirm = async (target) => {
        try {
            await invMovApi.confirm(target.invMovTaskId, target.qty);
            toast.success(`${target.invMovNo} — ${num(target.qty)}개 이동을 확정했습니다.`);
            fetchList(target.qty < target.remainingQty); // 잔여가 남으면 같은 지시 선택 유지
        } catch (e) {
            toast.error(e.message || '이동확정에 실패했습니다.');
        }
    };

    const doCancel = async (target) => {
        try {
            await invMovApi.cancel(target.invMovTaskId);
            toast.success(`${target.invMovNo} — 잔여 ${num(target.remainingQty)}개의 예약을 해제했습니다.`);
            fetchList();
        } catch (e) {
            toast.error(e.message || '이동취소에 실패했습니다.');
        }
    };

    // 이 화면의 확정·취소 대상은 「재고이동 유형 + 지시 상태」뿐 — 적치·피킹 지시는 각자의 화면에서 처리 (서버도 재검증)
    const isInvMov = selected?.movDvsn === 'INV_MOV';
    const actionable = isInvMov && selected?.status === 'DIRECTED';

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <ClipboardList size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">재고 이동지시 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">등록된 지시의 확정(실물 이동, 부분 허용)과 잔량 취소 — 실적 조회는 재고 이력 조회에서</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" onSearch={() => fetchList()}>
                <SearchItem label="지시번호">
                    <input
                        type="text"
                        value={cond.invMovNo}
                        onChange={(e) => setCond(prev => ({ ...prev, invMovNo: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="MV-20260803-001"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="상품 코드">
                    <input
                        type="text"
                        value={cond.prodCd}
                        onChange={(e) => setCond(prev => ({ ...prev, prodCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="PROD-0001"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="출발지">
                    <input
                        type="text"
                        value={cond.fromLocCd}
                        onChange={(e) => setCond(prev => ({ ...prev, fromLocCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="DRY-A-01-01"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="도착지">
                    <input
                        type="text"
                        value={cond.toLocCd}
                        onChange={(e) => setCond(prev => ({ ...prev, toLocCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="DRY-B-01-01"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="이동구분">
                    <DropdownSelect
                        value={cond.movDvsn}
                        onChange={(v) => setCond(prev => ({ ...prev, movDvsn: v }))}
                        options={DVSN_OPTIONS}
                        placeholder="전체"
                    />
                </SearchItem>
                <SearchItem label="상태">
                    <DropdownSelect
                        value={cond.status}
                        onChange={(v) => setCond(prev => ({ ...prev, status: v }))}
                        options={STATUS_OPTIONS}
                        placeholder="전체"
                    />
                </SearchItem>
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <span className="text-xs text-slate-500 font-medium">{rowData.length}건</span>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        ref={gridRef}
                        rowData={rowData}
                        columnDefs={COLUMN_DEFS}
                        rowHeight={34}
                        headerHeight={38}
                        rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                        onSelectionChanged={onSelectionChanged}
                        onModelUpdated={onModelUpdated}
                    />
                </div>

                {/* 확정/취소 실행 영역 */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col gap-3 shrink-0">
                    {!selected ? (
                        <span className="text-xs text-slate-400">위에서 이동지시를 선택하세요.</span>
                    ) : !actionable ? (
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-bold text-slate-700">{selected.invMovNo}</span>
                            <DvsnBadge value={selected.movDvsn} />
                            <StatusBadge value={selected.status} />
                            <span className="text-xs text-slate-400">
                                {!isInvMov
                                    ? `${INV_MOV_DVSN_META[selected.movDvsn]?.label ?? selected.movDvsn} 유형의 지시는 이 화면에서 확정·취소할 수 없습니다 — 해당 업무 화면에서 처리하세요.`
                                    : `${INV_MOV_STATUS_META[selected.status]?.label} 상태의 지시는 확정·취소할 수 없습니다.`}
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-end gap-3">
                            <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
                                <span className="font-bold text-slate-700 truncate">{selected.invMovNo}</span>
                                <span className="text-xs text-slate-400 shrink-0">
                                    {selected.prodCd} · {selected.lotNo} · <span className="font-mono">{selected.fromLocCd} → {selected.toLocCd}</span> · 잔여 {num(selected.remainingQty)}개
                                </span>
                            </div>
                            <div className="flex flex-col gap-1 w-28 shrink-0">
                                <label className="text-xs font-bold text-slate-500">확정수량</label>
                                <input
                                    type="number"
                                    min="1"
                                    max={selected.remainingQty}
                                    value={qty}
                                    onChange={(e) => setQty(e.target.value)}
                                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                                />
                            </div>
                            <button
                                onClick={handleConfirmClick}
                                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-colors shrink-0">
                                <ArrowRight size={14} /> 이동확정
                            </button>
                            <button
                                onClick={() => setCancelTarget(selected)}
                                className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-bold border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                                title="잔여수량의 예약을 해제합니다. 이미 확정한 수량은 되돌리지 않습니다.">
                                <Ban size={14} /> 잔량 취소
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* 확정 확인 모달 */}
            {confirmTarget && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">이동을 확정하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {confirmTarget.prodCd} {confirmTarget.prodNm} · <b className="text-emerald-600">{num(confirmTarget.qty)}개</b>
                        </p>
                        <p className="text-xs text-slate-400 font-mono">
                            {confirmTarget.fromLocCd} → {confirmTarget.toLocCd}
                        </p>
                        {confirmTarget.qty < confirmTarget.remainingQty && (
                            <p className="text-xs text-amber-600">부분확정 — 잔여 {num(confirmTarget.remainingQty - confirmTarget.qty)}개는 지시 상태로 남습니다.</p>
                        )}
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConfirmTarget(null)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                취소
                            </button>
                            <button
                                onClick={() => { doConfirm(confirmTarget); setConfirmTarget(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                                확정
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 취소 확인 모달 */}
            {cancelTarget && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">잔량을 취소하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {cancelTarget.invMovNo} · 잔여 <b className="text-rose-600">{num(cancelTarget.remainingQty)}개</b>의 예약이 해제됩니다.
                        </p>
                        <p className="text-xs text-slate-400">
                            {cancelTarget.cmplQty > 0
                                ? `이미 확정한 ${num(cancelTarget.cmplQty)}개는 되돌리지 않습니다 — 지시수량이 완료수량으로 차감되고 완료 처리됩니다.`
                                : '확정 실적이 없으므로 지시가 취소 상태가 됩니다.'}
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setCancelTarget(null)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                닫기
                            </button>
                            <button
                                onClick={() => { doCancel(cancelTarget); setCancelTarget(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700">
                                잔량 취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
