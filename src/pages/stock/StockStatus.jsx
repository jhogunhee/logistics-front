import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Box } from 'lucide-react';

import SearchBar, { SearchText, SearchSelect, SearchProd, SearchLoc } from '@/components/common/SearchBar';
import { invApi } from '@/api/invApi';
import { LOC_TYPE_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { Badge } from '@/components/common/Badge';
import { num } from '@/utils/format';


const TEMP_ZONE_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(TEMP_ZONE_META).map(([value, m]) => ({ value, label: m.label })),
];

const LOC_TYPE_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(LOC_TYPE_META).map(([value, m]) => ({ value, label: m.label })),
];


const COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'prodCd', headerName: '상품 코드', width: 115 },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 180 },
    {
        field: 'tmpZon', headerName: '온도대', width: 100,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
    },
    { field: 'locCd', headerName: '로케이션', width: 130 },
    {
        field: 'locTyp', headerName: '구분', width: 90,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={LOC_TYPE_META} value={p.value} show="label" />,
    },
    { field: 'lotNo', headerName: 'Lot번호', width: 140 },
    {
        field: 'expiryDt', headerName: '유통기한', width: 110,
        headerTooltip: 'Lot 유통기한. FEFO 할당 기준값',
        cellRenderer: (p) => p.value ?? <span className="text-slate-400">미관리</span>,
    },
    {
        field: 'onHandQty', headerName: '보유', width: 90, cellClass: 'ag-right-aligned-cell font-medium',
        headerTooltip: '실물 보유 수량',
        valueFormatter: (p) => num(p.value),
    },
    {
        field: 'alocQty', headerName: '할당', width: 90,
        headerTooltip: '예약된 수량 — 출고 할당·이동지시가 선점',
        cellClass: (p) => `ag-right-aligned-cell ${p.value > 0 ? 'text-amber-600 font-bold' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
    {
        field: 'hldQty', headerName: '보류', width: 90,
        headerTooltip: '보류 수량 — 가용재고에서 제외. 내역은 재고 보류 화면에서',
        cellClass: (p) => `ag-right-aligned-cell ${p.value > 0 ? 'text-rose-600 font-bold' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
    {
        field: 'avalQty', headerName: '가용', width: 90,
        headerTooltip: '가용재고 = 보유 - 할당 - 보류. 신규 할당 가능한 수량',
        cellClass: (p) => `ag-right-aligned-cell font-bold ${p.value <= 0 ? 'text-rose-500' : 'text-emerald-600'}`,
        valueFormatter: (p) => num(p.value),
    },
];

const StatTile = ({ label, value, accent }) => (
    <div className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-col gap-0.5">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <span className={`text-xl font-bold tabular-nums ${accent ?? 'text-slate-800'}`}>{value}</span>
    </div>
);

export default function StockStatus() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ prodCd: '', locCd: '', lotNo: '', tmpZon: '', locTyp: '' });

    const fetchList = async () => {
        const data = await invApi.list(cond);
        setRowData(data);
    };

    useEffect(() => {
        invApi.list(cond).then(setRowData);
    }, []);

    // 요약 지표는 조회 결과에서 파생 (별도 API 없이 화면에서 집계)
    const summary = useMemo(() => {
        const prodKinds = new Set(rowData.map(r => r.prodCd)).size;
        const onHand = rowData.reduce((s, r) => s + Number(r.onHandQty), 0);
        const avail = rowData.reduce((s, r) => s + Number(r.avalQty), 0);
        const alloc = rowData.reduce((s, r) => s + Number(r.alocQty), 0);
        const hold = rowData.reduce((s, r) => s + Number(r.hldQty), 0);
        return { prodKinds, onHand, avail, alloc, hold };
    }, [rowData]);

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Box size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">현재고 조회</h2>
                <span className="text-xs text-slate-400 mt-0.5">상품 + 로케이션 + Lot 단위 실시간 재고 · 가용 = 보유 − 할당 − 보류</span>
            </div>

            {/* 요약 지표 */}
            <div className="flex gap-3">
                <StatTile label="재고 건수" value={num(rowData.length)} />
                <StatTile label="상품 종류" value={num(summary.prodKinds)} />
                <StatTile label="총 보유수량" value={num(summary.onHand)} />
                <StatTile label="총 할당수량" value={num(summary.alloc)} accent="text-amber-600" />
                <StatTile label="총 보류수량" value={num(summary.hold)} accent="text-rose-600" />
                <StatTile label="총 가용수량" value={num(summary.avail)} accent="text-emerald-600" />
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchProd name="prodCd" />
                <SearchLoc name="locCd" />
                <SearchText name="lotNo" label="Lot번호" placeholder="LOT-260722-001" />
                <SearchSelect name="tmpZon" label="온도대" options={TEMP_ZONE_OPTIONS} />
                <SearchSelect name="locTyp" label="구분" options={LOC_TYPE_OPTIONS} />
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