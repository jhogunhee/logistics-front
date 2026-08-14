import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { History } from 'lucide-react';

import SearchBar, { SearchText, SearchSelect, SearchDateRange, SearchProd } from '@/components/common/SearchBar';
import { lotAttrChngApi } from '@/api/lotAttrChngApi';
import { useCodes } from '@/hooks/useCodes';
import { LOT_ATTR_RSN_GRP } from '@/constants/rsnCodes';
import { fmtDt, num } from '@/utils/format';

/** 전 → 후 셀. 값이 그대로면 흐리게, 바뀌었으면 강조 — 한 행에서 무엇이 움직였는지 바로 보이게 */
const DiffCell = ({ before, after }) => {
    const changed = before !== after;
    return (
        <span className="text-xs">
            <span className="text-slate-400">{before ?? '-'}</span>
            <span className="text-slate-300 mx-1">→</span>
            <b className={changed ? 'text-amber-600' : 'text-slate-400'}>{after ?? '-'}</b>
        </span>
    );
};

/**
 * Lot 속성 정정 이력 (append-only 로그). 재고 수량이 변하지 않는 처리라
 * 재고 이력 조회(inv_hist)에는 아무것도 남지 않는다 — 이 탭이 정정의 유일한 원장이다.
 * 취소 경로가 없어 되돌리는 정정도 새 행으로 쌓이므로, 왕복이 그대로 보인다.
 */
export default function StockAttrChngHist() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ prodCd: '', lotNo: '', rsnCd: '', chngFrom: '', chngTo: '' });
    const rsn = useCodes(LOT_ATTR_RSN_GRP);

    const fetchList = async () => setRowData(await lotAttrChngApi.listChngs(cond));

    useEffect(() => {
        lotAttrChngApi.listChngs({}).then(setRowData);
    }, []);

    const columnDefs = useMemo(() => [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        { field: 'createdAt', headerName: '정정일시', width: 150, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 150 },
        { field: 'lotNo', headerName: 'Lot번호', width: 140 },
        {
            headerName: '제조일자 (전 → 후)', width: 200,
            cellRenderer: (p) => <DiffCell before={p.data.bfrMfgDt} after={p.data.aftMfgDt} />,
        },
        {
            headerName: '유통기한 (전 → 후)', width: 200,
            cellRenderer: (p) => <DiffCell before={p.data.bfrExpiryDt} after={p.data.aftExpiryDt} />,
        },
        {
            field: 'rsnCd', headerName: '사유', width: 170,
            cellRenderer: (p) => (
                <span className="text-xs">
                    <b>{rsn.nm(p.value)}</b>
                    {p.data.rsnDscr && <span className="text-slate-400"> — {p.data.rsnDscr}</span>}
                </span>
            ),
        },
        { field: 'createdBy', headerName: '정정자', width: 100, cellClass: 'text-slate-500' },
    ], [rsn]);

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <History size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">Lot 속성 변경 이력</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    수량 변동이 없어 재고 이력 조회에는 나오지 않는다 — 정정의 유일한 원장
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchProd name="prodCd" label="상품 코드" placeholder="PROD-0001" />
                <SearchText name="lotNo" label="Lot번호" placeholder="LOT-260722-001" />
                <SearchDateRange from="chngFrom" to="chngTo" label="정정일" />
                <SearchSelect name="rsnCd" label="사유" options={rsn.searchOptions} />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <span className="text-xs text-slate-500 font-medium">정정 이력 {num(rowData.length)}건</span>
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
