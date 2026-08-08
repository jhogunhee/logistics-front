import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { History } from 'lucide-react';

import SearchBar, { SearchText, SearchSelect } from '@/components/common/SearchBar';
import { invHldApi } from '@/api/invHldApi';
import { useCodes } from '@/hooks/useCodes';
import { fmtDt, num } from '@/utils/format';


/** 실적 종류. 보류/해제 실적은 별개 테이블이지만 화면 형태가 같아 토글로 오간다 */
const KINDS = [
    { key: 'hold', label: '보류 실적', qtyHeader: '보류수량', rsnGrp: 'HLD_RSN', qtyClass: 'text-rose-600' },
    { key: 'release', label: '해제 실적', qtyHeader: '해제수량', rsnGrp: 'HLD_RLZ_RSN', qtyClass: 'text-emerald-600' },
];

const INIT_COND = { hldNo: '', prodCd: '', locCd: '', rsnCd: '' };

/**
 * 보류/해제 실적 조회 (append-only 로그). 물리 이동이 아니라 재고 이력 조회(inv_hist)에는
 * 나오지 않는 유일한 처리라, 전용 실적 테이블을 여기서 조회한다. 부분 해제 N번이면 해제 실적 N행.
 */
export default function StockHoldAcrst() {
    const [kind, setKind] = useState('hold');
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState(INIT_COND);

    const meta = KINDS.find(k => k.key === kind);
    const rsn = useCodes(meta.rsnGrp); // 종류마다 사유 그룹이 다르다 (등록 사유 ≠ 해제 사유)

    const fetchList = async (kindKey = kind, condOverride = cond) => {
        const api = kindKey === 'hold' ? invHldApi.listAcrst : invHldApi.listRlzAcrst;
        setRowData(await api(condOverride));
    };

    // 마운트 조회는 fetchList를 부르지 않고 API를 직접 호출한다 — 이펙트가 컴포넌트 함수를
    // 의존성으로 잡게 되어 react-hooks 규칙에 걸린다 (Lot 속성 정정 화면과 같은 형태)
    useEffect(() => {
        invHldApi.listAcrst(INIT_COND).then(setRowData);
    }, []);

    // 종류 전환은 이펙트가 아니라 여기서 처리한다. kind를 바꾸는 곳이 토글 버튼 하나뿐이라
    // 「kind가 바뀌면」을 이펙트로 뒤쫓을 이유가 없다 — 이펙트에 두면 렌더 중 setCond가 돌아
    // 연쇄 렌더가 된다. 사유 그룹이 갈리므로(등록 사유 ≠ 해제 사유) 필터를 초기화하고 다시 조회한다.
    const switchKind = (key) => {
        if (key === kind) return;
        setKind(key);
        setCond(INIT_COND);
        fetchList(key, INIT_COND);
    };

    const columnDefs = useMemo(() => [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        { field: 'hldNo', headerName: '보류번호', width: 145 },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 160 },
        { field: 'locCd', headerName: '로케이션', width: 125 },
        { field: 'lotNo', headerName: 'Lot번호', width: 130 },
        {
            field: 'qty', headerName: meta.qtyHeader, width: 100,
            cellClass: `ag-right-aligned-cell font-bold ${meta.qtyClass}`,
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'rsnCd', headerName: '사유', width: 160,
            cellRenderer: (p) => (
                <span className="text-xs">
                    <b>{rsn.nm(p.value)}</b>
                    {p.data.rsnDscr && <span className="text-slate-400"> — {p.data.rsnDscr}</span>}
                </span>
            ),
        },
        { field: 'createdAt', headerName: '실적일시', width: 150, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
    ], [meta, rsn]);

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 + 실적 종류 토글 */}
            <div className="flex items-center gap-2">
                <History size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">보류/해제 실적 조회</h2>
                <span className="text-xs text-slate-400 mt-0.5">등록·해제의 append-only 로그 — 물리 이동이 아니라 재고 이력 조회에는 나오지 않는다</span>
                <div className="ml-auto flex gap-1 bg-slate-100 p-1 rounded-lg">
                    {KINDS.map(k => (
                        <button
                            key={k.key}
                            onClick={() => switchKind(k.key)}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-colors
                                ${kind === k.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            {k.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={() => fetchList()}>
                <SearchText name="hldNo" label="보류번호" placeholder="HD-20260803-001" />
                <SearchText name="prodCd" label="상품 코드" placeholder="PROD-0001" />
                <SearchText name="locCd" label="로케이션" placeholder="DRY-A-01-01" />
                <SearchSelect name="rsnCd" label="사유" options={rsn.searchOptions} />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <span className="text-xs text-slate-500 font-medium">{meta.label} {rowData.length}건</span>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        rowData={rowData}
                        columnDefs={columnDefs}
                        rowHeight={34}
                        headerHeight={38}
                    />
                </div>
            </div>
        </div>
    );
}
