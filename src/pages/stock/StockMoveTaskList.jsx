import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ArrowRight, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchText, SearchSelect } from '@/components/common/SearchBar';
import { invMovApi } from '@/api/invMovApi';
import { INV_MOV_DVSN_META, INV_MOV_STATUS_META } from '@/constants/badgeMeta';
import { Badge } from '@/components/common/Badge';
import { fmtDt, num } from '@/utils/format';
import ConfirmModal from '@/components/common/ConfirmModal';


const STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(INV_MOV_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];

const DVSN_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(INV_MOV_DVSN_META).map(([value, m]) => ({ value, label: m.label })),
];

// 확정수량 입력 1필드를 행에 붙인다. 기본값을 잔여로 채우지 않는다 —
// 채우면 손대지도 않은 행이 전부 일괄 확정 대상이 된다
const toEditableRow = (r) => ({ ...r, cnfmQty: null });

// 이 화면의 확정·취소 대상은 「재고이동 유형 + 지시 상태」뿐 — 적치·피킹 지시는 각자의 화면에서 처리 (서버도 재검증)
const isActionable = (r) => r.movDvsn === 'INV_MOV' && r.status === 'DIRECTED';

const isEntered = (r) => isActionable(r) && r.cnfmQty != null;

export default function StockMoveTaskList() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ invMovNo: '', movDvsn: '', prodCd: '', fromLocCd: '', toLocCd: '', status: '' });
    const [confirmTargets, setConfirmTargets] = useState(null); // 확정 확인 모달 대상
    const [cancelTarget, setCancelTarget] = useState(null);     // 취소 확인 모달 대상 (행 단위)
    const gridRef = useRef(null);

    const fetchList = async () => {
        const data = await invMovApi.list(cond);
        setRowData(data.map(toEditableRow));
    };

    useEffect(() => {
        invMovApi.list().then(d => setRowData(d.map(toEditableRow)));
    }, []);

    const entered = useMemo(() => rowData.filter(isEntered), [rowData]);
    const totalQty = entered.reduce((s, r) => s + (Number(r.cnfmQty) || 0), 0);

    const columnDefs = useMemo(() => [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        { field: 'invMovNo', headerName: '이동지시번호', width: 150 },
        {
            field: 'movDvsn', headerName: '이동구분', width: 100,
            headerTooltip: '이 화면의 확정·취소는 재고이동 유형만 가능 — 적치·피킹은 각자의 화면에서 처리',
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={INV_MOV_DVSN_META} value={p.value} show="label" />,
        },
        {
            field: 'status', headerName: '상태', width: 90,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={INV_MOV_STATUS_META} value={p.value} show="label" />,
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
        {
            field: 'cnfmQty', headerName: '확정수량', width: 100,
            editable: (p) => isActionable(p.data),
            headerTooltip: '이번에 확정할 수량 — 잔여가 상한, 부분확정 가능. 재고이동 유형의 지시 상태 행만 입력할 수 있다',
            cellClass: (p) => `ag-right-aligned-cell font-bold ${isActionable(p.data) ? 'bg-indigo-50' : ''}`,
            cellRenderer: (p) => {
                if (!isActionable(p.data)) return <span className="text-slate-300 font-normal">—</span>;
                return p.value == null ? <span className="text-slate-300 font-normal">—</span> : num(p.value);
            },
        },
        {
            headerName: '잔량 취소', width: 90,
            headerTooltip: '잔여수량의 예약을 해제한다. 이미 확정한 수량은 되돌리지 않는다',
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => (
                <button
                    onClick={() => setCancelTarget(p.data)}
                    disabled={!isActionable(p.data)}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-800 disabled:text-slate-300 disabled:cursor-not-allowed">
                    잔량 취소
                </button>
            ),
        },
        { field: 'createdAt', headerName: '등록일시', width: 140, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
        { field: 'cmplDt', headerName: '완료일시', width: 140, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
    ], []);

    const onCellValueChanged = (e) => {
        // 기본 텍스트 에디터는 문자열을 남긴다 — 빈 값은 null로, 그 외는 숫자로 맞춰 올린다
        const raw = e.data.cnfmQty;
        const cnfmQty = raw === '' || raw == null ? null : Number(raw);
        setRowData(prev => prev.map(r => (r.invMovTaskId === e.data.invMovTaskId ? { ...r, ...e.data, cnfmQty } : r)));
    };

    const handleSubmit = () => {
        // 편집 중인 셀은 아직 행에 반영되지 않았다 — 열린 에디터를 닫고 나서 그리드에서 직접 걷는다
        gridRef.current?.api.stopEditing();
        const rows = [];
        gridRef.current?.api.forEachNode(n => rows.push(n.data));
        const targets = rows.filter(isEntered);
        if (targets.length === 0) {
            toast('확정수량을 입력한 행이 없습니다.');
            return;
        }
        // 걸린 행을 하나씩 알리면 고칠 때마다 다음 행이 새로 걸린다 — 한 번에 다 보여준다
        const errors = [];
        for (const r of targets) {
            const n = Number(r.cnfmQty);
            if (!(n > 0)) {
                errors.push(`${r.invMovNo}: 확정수량은 1 이상이어야 합니다.`);
            } else if (n > r.remainingQty) {
                errors.push(`${r.invMovNo}: 잔여수량(${num(r.remainingQty)})을 초과했습니다.`);
            }
        }
        if (errors.length > 0) {
            toast.error(errors.join('\n'), { style: { whiteSpace: 'pre-line' } });
            return;
        }
        setConfirmTargets(targets);
    };

    /**
     * 확정 API는 지시 1건당 1호출이라 여러 건은 순차 실행이다 — 한 트랜잭션이 아니다.
     * 그래서 도중에 실패하면 앞선 건은 이미 확정된 채로 남는다. 몇 건까지 됐는지 알리고
     * 무조건 재조회해, 화면이 서버 상태와 어긋나지 않게 한다.
     */
    const doConfirm = async (targets) => {
        let done = 0;
        try {
            for (const t of targets) {
                await invMovApi.confirm(t.invMovTaskId, Number(t.cnfmQty));
                done += 1;
            }
            const qtySum = targets.reduce((s, t) => s + Number(t.cnfmQty), 0);
            toast.success(`${targets.length}건 · ${num(qtySum)}개 이동을 확정했습니다.`);
        } catch (e) {
            toast.error(`${done}건 확정 후 실패: ${e.message || '이동확정에 실패했습니다.'}`);
        }
        fetchList();
    };

    const doCancel = async (target) => {
        try {
            await invMovApi.cancel(target.invMovTaskId);
            toast.success(`${target.invMovNo} — 잔여 ${num(target.remainingQty)}개의 예약을 해제했습니다.`);
            fetchList();
        } catch (e) {
            // 실패하면 재조회하지 않는다 — 서버 값은 그대로인데 다른 행에 입력해 둔 확정수량만 날아간다
            toast.error(e.message || '이동취소에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <ClipboardList size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">재고 이동지시 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">등록된 지시의 확정(실물 이동, 부분 허용)과 잔량 취소 — 실적 조회는 재고 이력 조회에서</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={() => fetchList()}>
                <SearchText name="invMovNo" label="지시번호" placeholder="MV-20260803-001" />
                <SearchText name="prodCd" label="상품 코드" placeholder="PROD-0001" />
                <SearchText name="fromLocCd" label="출발지" placeholder="DRY-A-01-01" />
                <SearchText name="toLocCd" label="도착지" placeholder="DRY-B-01-01" />
                <SearchSelect name="movDvsn" label="이동구분" options={DVSN_OPTIONS} />
                <SearchSelect name="status" label="상태" options={STATUS_OPTIONS} />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-slate-500 font-medium">{rowData.length}건</span>
                    <span className="text-[11px] text-slate-400">확정수량을 행에서 바로 입력한 뒤 확정 · 잔량 취소는 행별 버튼</span>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-bold ${entered.length > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>
                            입력 {num(entered.length)}건 · 총 {num(totalQty)}개
                        </span>
                        <button
                            onClick={handleSubmit}
                            className="flex items-center gap-1 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-colors">
                            <ArrowRight size={14} /> 이동확정
                        </button>
                    </div>
                </div>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        ref={gridRef}
                        rowData={rowData}
                        columnDefs={columnDefs}
                        getRowId={(p) => String(p.data.invMovTaskId)}
                        rowHeight={34}
                        headerHeight={38}
                        stopEditingWhenCellsLoseFocus={true}
                        onCellValueChanged={onCellValueChanged}
                    />
                </div>
            </div>

            {/* 확정 확인 모달 */}
            {confirmTargets && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20"
                     onMouseDown={() => setConfirmTargets(null)}>
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[480px] flex flex-col gap-4"
                         onMouseDown={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-800">이동을 확정하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {confirmTargets.length}건 · 총 <b className="text-emerald-600">{num(confirmTargets.reduce((s, t) => s + Number(t.cnfmQty), 0))}개</b>의 실물 이동이 반영됩니다.
                        </p>
                        <p className="text-xs text-slate-400">
                            지시 1건씩 순차로 처리합니다 — 도중에 실패하면 앞선 건은 확정된 채로 남습니다.
                        </p>
                        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                            {confirmTargets.map(t => (
                                <div key={t.invMovTaskId} className="flex flex-col gap-0.5 text-xs bg-slate-50 rounded-lg p-3">
                                    <div className="flex items-baseline gap-2 min-w-0">
                                        <b className="text-slate-700 truncate">{t.invMovNo}</b>
                                        <span className="text-slate-400 truncate">{t.prodCd} {t.prodNm}</span>
                                    </div>
                                    <span className="text-slate-500">
                                        <span className="font-mono">{t.fromLocCd} → {t.toLocCd}</span>
                                        {' · '}<b className="text-emerald-600">{num(Number(t.cnfmQty))}개</b>
                                    </span>
                                    {Number(t.cnfmQty) < t.remainingQty && (
                                        <span className="text-amber-600">
                                            부분확정 — 잔여 {num(t.remainingQty - Number(t.cnfmQty))}개는 지시 상태로 남습니다.
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConfirmTargets(null)}
                                className="btn-modal-cancel">
                                취소
                            </button>
                            <button
                                onClick={() => { const t = confirmTargets; setConfirmTargets(null); doConfirm(t); }}
                                className="btn-modal-primary">
                                확정
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 취소 확인 모달 */}
            {cancelTarget && (
                <ConfirmModal
                    title="잔량을 취소하시겠습니까?"
                    confirmText="잔량 취소"
                    cancelText="닫기"
                    danger
                    onCancel={() => setCancelTarget(null)}
                    onConfirm={() => { const t = cancelTarget; setCancelTarget(null); doCancel(t); }}
                >
                    <p className="text-sm text-slate-500">
                        {cancelTarget.invMovNo} · 잔여 <b className="text-rose-600">{num(cancelTarget.remainingQty)}개</b>의 예약이 해제됩니다.
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                        {cancelTarget.cmplQty > 0
                            ? `이미 확정한 ${num(cancelTarget.cmplQty)}개는 되돌리지 않습니다 — 지시수량이 완료수량으로 차감되고 완료 처리됩니다.`
                            : '확정 실적이 없으므로 지시가 취소 상태가 됩니다.'}
                    </p>
                </ConfirmModal>
            )}
        </div>
    );
}
