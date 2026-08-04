import { useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import ConfirmModal from '@/components/common/ConfirmModal';
import { TempZoneBadge } from '@/components/common/Badge';
import { putawayApi, PUTAWAY_TASK_STATUS_META } from '@/api/putawayApi';
import { fmtDe, fmtDt, num } from '@/utils/format';


const STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(PUTAWAY_TASK_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];

const StatusBadge = ({ value }) => {
    const meta = PUTAWAY_TASK_STATUS_META[value];
    if (!meta) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${meta.badge}`}>
            {meta.label}
        </span>
    );
};

export default function PutawayTaskList() {
    const [rowData, setRowData] = useState([]);
    // 기본 상태 = 지시 — 이 탭의 유일한 동작(취소)이 가능한 상태다
    const [cond, setCond] = useState({ ibNo: '', prodCd: '', prodNm: '', toLocCd: '', status: 'DIRECTED' });
    const [cancelTarget, setCancelTarget] = useState(null);

    const fetchList = async () => {
        try {
            setRowData(await putawayApi.tasks(cond));
        } catch (e) {
            toast.error(e.message || '조회에 실패했습니다.');
        }
    };

    useEffect(() => {
        let ignore = false;
        putawayApi.tasks(cond).then(data => { if (!ignore) setRowData(data); }).catch(() => {});
        return () => { ignore = true; };
    }, []);

    const doCancel = async (target) => {
        try {
            await putawayApi.cancel(target.putawayTaskId);
            toast.success(`${target.prodCd} ${num(target.remainingQty)}개의 적치지시를 취소했습니다.`);
            fetchList();
        } catch (e) {
            toast.error(e.message || '적치지시 취소에 실패했습니다.');
        }
    };

    // 취소 버튼을 컬럼 안에 두는 탓에 셀 렌더러가 최신 핸들러를 봐야 한다 — 컬럼 정의를 컴포넌트 안에 둔다
    const columnDefs = [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        { field: 'ibNo', headerName: '입고번호', width: 170 },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 180 },
        {
            field: 'tmpZon', headerName: '온도대', width: 100,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <TempZoneBadge value={p.value} />,
        },
        { field: 'lotNo', headerName: 'Lot번호', width: 140 },
        {
            field: 'expiryDt', headerName: '유통기한', width: 110,
            cellRenderer: (p) => (p.value ? fmtDe(p.value) : <span className="text-slate-400">미관리</span>),
        },
        {
            field: 'toLocCd', headerName: '대상 로케이션', width: 150,
            headerTooltip: '이 지시로 물건이 들어갈 보관 로케이션. 실행 화면은 이 로케이션으로만 적치할 수 있다',
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
            headerTooltip: '잔여 = 지시 - 완료. 적치 화면에서 아직 실행되지 않은 수량',
            cellClass: (p) => `ag-right-aligned-cell tabular-nums font-bold ${p.value > 0 ? 'text-amber-600' : 'text-slate-300'}`,
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'status', headerName: '상태', width: 90,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <StatusBadge value={p.value} />,
        },
        { field: 'createdAt', headerName: '등록시간', width: 140, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
        { field: 'cmplDt', headerName: '완료시간', width: 140, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
        {
            headerName: '취소', width: 80, pinned: 'right',
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => {
                // 실행 실적이 한 건이라도 있으면 서버가 거부한다 — 화면에서도 미리 막는다
                const enabled = p.data.status === 'DIRECTED' && p.data.cmplQty === 0;
                return (
                    <button
                        onClick={() => setCancelTarget(p.data)}
                        disabled={!enabled}
                        title={enabled ? '이 지시를 취소합니다' : '지시 상태이고 실행 실적이 없을 때만 취소할 수 있습니다'}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-800 disabled:text-slate-300 disabled:cursor-not-allowed">
                        취소
                    </button>
                );
            },
        },
    ];

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <ClipboardList size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">적치지시 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">발행된 지시의 진행 상황과 취소 — 실행(실물 이동)은 「적치」 화면에서</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" onSearch={() => fetchList()}>
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
                <SearchItem label="상품 코드">
                    <input
                        type="text"
                        value={cond.prodCd}
                        onChange={(e) => setCond(prev => ({ ...prev, prodCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="PROD-0001"
                        className="w-full input-base"
                    />
                </SearchItem>
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
                <SearchItem label="대상 로케이션">
                    <input
                        type="text"
                        value={cond.toLocCd}
                        onChange={(e) => setCond(prev => ({ ...prev, toLocCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="DRY-A-01-01"
                        className="w-full input-base"
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
                        rowData={rowData}
                        columnDefs={columnDefs}
                        rowHeight={34}
                        headerHeight={38}
                    />
                </div>
            </div>

            {/* 취소 확인 모달 */}
            {cancelTarget && (
                <ConfirmModal
                    title="적치지시를 취소할까요?"
                    confirmText="취소 처리"
                    cancelText="닫기"
                    danger
                    onCancel={() => setCancelTarget(null)}
                    onConfirm={() => { doCancel(cancelTarget); setCancelTarget(null); }}
                >
                    <p className="text-sm text-slate-500">
                        {cancelTarget.prodCd} {cancelTarget.prodNm} · 지시 <b className="text-rose-600">{num(cancelTarget.drctQty)}개</b>
                    </p>
                    <p className="text-xs text-slate-400 font-mono">RCV-STAGE → {cancelTarget.toLocCd}</p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        재고는 움직이지 않습니다 — 이 배치의 수량이 다시 「미지시」로 돌아가 새로 지시할 수 있게 됩니다.
                    </p>
                </ConfirmModal>
            )}
        </div>
    );
}
