import { useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ClipboardCheck, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';

import { invStktkApi } from '@/api/invStktkApi';
import { locApi } from '@/api/locApi';
import { zonApi } from '@/api/zonApi';
import { INV_STKTK_STATUS_META } from '@/constants/badgeMeta';
import { daysAheadStr, fmtDt, num, todayStr } from '@/utils/format';
import SearchBar, { SearchText, SearchSelect, SearchDateRange, SearchProd } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import ProdPickerModal from '@/components/common/ProdPickerModal';
import { Badge } from '@/components/common/Badge';

const STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(INV_STKTK_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];

const COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'stktkNo', headerName: '조사번호', width: 150 },
    {
        field: 'status', headerName: '상태', width: 90,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={INV_STKTK_STATUS_META} value={p.value} show="label" />,
    },
    {
        headerName: '조사 범위', flex: 1, minWidth: 240,
        headerTooltip: '조사 생성에 쓴 조건. 비어 있으면 그 조건 없이 전체를 대상으로 잡은 것',
        cellRenderer: (p) => {
            const parts = [];
            if (p.data.zonCd) parts.push(`존 ${p.data.zonCd}`);
            if (p.data.locCd) parts.push(`로케이션 ${p.data.locCd}`);
            if (p.data.prodCd) parts.push(`상품 ${p.data.prodCd}`);
            return parts.length === 0
                ? <span className="text-slate-400">전 보관 로케이션</span>
                : <span className="text-xs text-slate-600">{parts.join(' · ')}</span>;
        },
    },
    {
        field: 'lnCnt', headerName: '라인', width: 80, cellClass: 'ag-right-aligned-cell font-medium',
        valueFormatter: (p) => num(p.value),
    },
    {
        headerName: '실사 입력', width: 110,
        headerTooltip: '실사수량이 입력된 라인 수 / 전체 라인 수. 「부분입력」 같은 상태는 두지 않고 수량으로 본다',
        cellClass: 'ag-right-aligned-cell',
        cellRenderer: (p) => {
            const done = p.data.cntdCnt ?? 0;
            const all = p.data.lnCnt ?? 0;
            const full = all > 0 && done === all;
            return (
                <span className={full ? 'font-bold text-emerald-600' : done > 0 ? 'font-bold text-amber-600' : 'text-slate-300'}>
                    {num(done)} / {num(all)}
                </span>
            );
        },
    },
    { field: 'createdAt', headerName: '생성일시', width: 140, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
    { field: 'cfmDt', headerName: '확정일시', width: 140, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
];

export default function StockCountList({ onOpen }) {
    const [cond, setCond] = useState({
        stktkNo: '', status: '', zonCd: '', prodCd: '',
        fromDe: daysAheadStr(-7), toDe: todayStr(),
    });
    const [rowData, setRowData] = useState([]);
    const [zonCodes, setZonCodes] = useState([]);
    const [storageLocs, setStorageLocs] = useState([]);
    const [scope, setScope] = useState({ zonCd: '', locId: '', prod: null });
    const [createOpen, setCreateOpen] = useState(false);
    const [prodPickerOpen, setProdPickerOpen] = useState(false);

    const zonOptions = [{ value: '', label: '전체' }, ...zonCodes.map(z => ({ value: z.zonCd, label: z.zonCd }))];
    const scopeZonOptions = [{ value: '', label: '전체 존' }, ...zonCodes.map(z => ({ value: z.zonCd, label: z.zonCd }))];
    const scopeLocOptions = [
        { value: '', label: '전체 로케이션' },
        ...storageLocs
            .filter(l => !scope.zonCd || l.zonCd === scope.zonCd)
            .map(l => ({ value: String(l.locId), label: l.locCd })),
    ];

    const fetchList = async () => {
        const data = await invStktkApi.list(cond);
        setRowData(data);
    };

    useEffect(() => {
        invStktkApi.list(cond).then(setRowData);
        zonApi.list().then(setZonCodes);
        // 조사 대상은 보관 재고뿐이라 범위 로케이션도 보관만 고른다
        locApi.list({ locTyp: 'STORAGE' }).then(setStorageLocs);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openCreate = () => {
        setScope({ zonCd: '', locId: '', prod: null });
        setCreateOpen(true);
    };

    const doCreate = async () => {
        try {
            const { invStktkId, stktkNo } = await invStktkApi.create({
                zonCd: scope.zonCd || null,
                locId: scope.locId ? Number(scope.locId) : null,
                prodId: scope.prod?.prodId ?? null,
            });
            toast.success(`재고조사 ${stktkNo}를 생성했습니다. 실사수량을 입력하세요.`);
            setCreateOpen(false);
            await fetchList();
            onOpen(invStktkId);
        } catch (e) {
            toast.error(e.message || '조사 생성에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <ClipboardCheck size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">재고조사</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    범위를 잡아 조사를 만들고, 실사수량을 입력한 뒤 확정하면 차이가 조정(ADJUST)으로 반영된다 · 재고 수량 정정의 유일한 경로
                </span>
                <button
                    onClick={openCreate}
                    className="ml-auto flex items-center gap-1 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-colors">
                    <Plus size={14} /> 조사 생성
                </button>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="stktkNo" label="조사번호" placeholder="ST-260803-001" />
                <SearchSelect name="status" label="상태" options={STATUS_OPTIONS} />
                <SearchSelect name="zonCd" label="존" options={zonOptions} />
                <SearchProd name="prodCd" />
                <SearchDateRange from="fromDe" to="toDe" label="생성일자" />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <span className="text-xs text-slate-500 font-medium">{num(rowData.length)}건 · 행을 클릭하면 실사 입력 화면으로 이동합니다</span>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        rowData={rowData}
                        columnDefs={COLUMN_DEFS}
                        rowHeight={34}
                        headerHeight={38}
                        rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                        onRowClicked={(e) => onOpen(e.data.invStktkId)}
                    />
                </div>
            </div>

            {/* 조사 생성 모달 — 범위 3조건은 모두 선택이며, 전부 비우면 전 보관 로케이션이 대상 */}
            {createOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20"
                     onMouseDown={() => setCreateOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[460px] flex flex-col gap-4"
                         onMouseDown={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-800">재고조사 생성</h3>
                        <p className="text-xs text-slate-500">
                            범위에 걸리는 <b>보관 재고</b>로 조사 라인이 만들어지고, 각 라인에 지금의 전산수량이 스냅샷됩니다.
                            조건을 비우면 그 조건 없이 전체가 대상입니다 — 재고 하나만 정정하려면 로케이션·상품을 지정해 좁게 잡으세요.
                        </p>

                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <label className="text-xs font-bold text-slate-500 w-20 shrink-0">존</label>
                                <div className="flex-1">
                                    <DropdownSelect
                                        value={scope.zonCd}
                                        onChange={(v) => setScope(prev => ({ ...prev, zonCd: v, locId: '' }))}
                                        options={scopeZonOptions}
                                        placeholder="전체 존"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="text-xs font-bold text-slate-500 w-20 shrink-0">로케이션</label>
                                <div className="flex-1">
                                    <DropdownSelect
                                        value={scope.locId}
                                        onChange={(v) => setScope(prev => ({ ...prev, locId: v }))}
                                        options={scopeLocOptions}
                                        placeholder="전체 로케이션"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="text-xs font-bold text-slate-500 w-20 shrink-0">상품</label>
                                <div className="flex-1 flex items-center gap-2">
                                    <span className="text-sm text-slate-700 truncate flex-1">
                                        {scope.prod
                                            ? <>{scope.prod.prodCd} <span className="text-slate-400">{scope.prod.prodNm}</span></>
                                            : <span className="text-slate-400">전체 상품</span>}
                                    </span>
                                    <button
                                        onClick={() => setProdPickerOpen(true)}
                                        className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">
                                        <Search size={14} />
                                    </button>
                                    {scope.prod && (
                                        <button
                                            onClick={() => setScope(prev => ({ ...prev, prod: null }))}
                                            className="text-xs text-slate-400 hover:text-rose-500">
                                            해제
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setCreateOpen(false)} className="btn-modal-cancel">취소</button>
                            <button onClick={doCreate} className="btn-modal-primary">생성</button>
                        </div>
                    </div>
                </div>
            )}

            <ProdPickerModal
                open={prodPickerOpen}
                onClose={() => setProdPickerOpen(false)}
                onSelect={(prod) => { setScope(prev => ({ ...prev, prod })); setProdPickerOpen(false); }}
            />
        </div>
    );
}
