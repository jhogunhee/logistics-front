import { useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { History } from 'lucide-react';

import SearchBar, { SearchText, SearchSelect, SearchDateRange } from '@/components/common/SearchBar';
import { invHistApi } from '@/api/invHistApi';
import { TEMP_ZONE_META, TX_TYPE_META } from '@/constants/badgeMeta';
import { TX_TYPE_OPTIONS } from '@/constants/codeOptions';
import { Badge } from '@/components/common/Badge';
import { fmtDt, num } from '@/utils/format';


const REF_DOC_TYPE_LABEL = { INBOUND: '입고', OUTBOUND: '출고' };

const COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    {
            field: 'txTyp', headerName: '유형', width: 80,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={TX_TYPE_META} value={p.value} show="label" />,
    },
    { field: 'prodCd', headerName: '상품 코드', width: 115 },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 180 },
    {
        field: 'locCd', headerName: '로케이션', width: 220,
        headerTooltip: 'MOVE(이동/적치)는 출발지 → 도착지로 표시',
        valueGetter: (p) => (p.data.txTyp === 'MOVE' && p.data.fromLocCd && p.data.toLocCd)
            ? `${p.data.fromLocCd} → ${p.data.toLocCd}`
            : p.data.locCd,
    },
    {
        field: 'tmpZon', headerName: '온도대', width: 100,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
    },
    { field: 'lotNo', headerName: 'Lot번호', width: 140 },
    {
        field: 'qty', headerName: '수량', width: 90,
        cellClass: (p) => `ag-right-aligned-cell font-bold ${p.value < 0 ? 'text-red-500' : 'text-emerald-600'}`,
        valueFormatter: (p) => (p.value > 0 ? `+${num(p.value)}` : num(p.value)),
    },
    {
        headerName: 'Ref No.', width: 200,
        headerTooltip: '이 이력을 발생시킨 문서 (입고번호/출고번호)',
        valueGetter: (p) => p.data.rfnDocNo
            ? `${REF_DOC_TYPE_LABEL[p.data.rfnDocTyp] ?? p.data.rfnDocTyp} ${p.data.rfnDocNo}`
            : '',
    },
    {
        field: 'createdAt', headerName: '생성일시', width: 150,
        valueFormatter: (p) => fmtDt(p.value),
    },
    { field: 'createdBy', headerName: '작성자', width: 90 },
];

export default function InvHistory() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ prodCd: '', prodNm: '', locCd: '', txTyp: '', rfnDocNo: '', dateFrom: '', dateTo: '' });

    const fetchList = async () => {
        const data = await invHistApi.list(cond);
        setRowData(data);
    };

    useEffect(() => {
        invHistApi.list().then(setRowData);
    }, []);

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <History size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">재고 이력</h2>
                <span className="text-xs text-slate-400 mt-0.5">모든 물리적 재고 변동의 append-only 원장 — 최근 발생 순</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="prodCd" label="상품 코드" placeholder="PROD-0001" />
                <SearchText name="prodNm" label="상품명" placeholder="상품명 일부" />
                <SearchText name="locCd" label="로케이션" placeholder="RCV-STAGE" />
                <SearchSelect name="txTyp" label="유형" options={TX_TYPE_OPTIONS} />
                <SearchText name="rfnDocNo" label="Ref No." placeholder="IB-20260717-001" />
                <SearchDateRange from="dateFrom" to="dateTo" label="생성일자" />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-2">
                <span className="text-xs text-slate-500 font-medium">{num(rowData.length)}건</span>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        rowData={rowData}
                        columnDefs={COLUMN_DEFS}
                        rowHeight={34}
                        headerHeight={38}
                    />
                </div>
            </div>
        </div>
    );
}