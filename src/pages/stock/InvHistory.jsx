import { useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { History } from 'lucide-react';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import { invHistApi, TX_TYPE_META, TX_TYPE_OPTIONS } from '@/api/invHistApi';
import { TempZoneBadge } from '@/components/common/Badge';
import { fmtDt } from '@/utils/format';


const TxTypeBadge = ({ value }) => {
    const meta = TX_TYPE_META[value];
    if (!meta) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${meta.badge}`}>
            {meta.label}
        </span>
    );
};


const REF_DOC_TYPE_LABEL = { INBOUND: '입고', OUTBOUND: '출고' };

const COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    {
            field: 'txTyp', headerName: '유형', width: 80,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <TxTypeBadge value={p.value} />,
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
        cellRenderer: (p) => <TempZoneBadge value={p.value} />,
    },
    { field: 'lotNo', headerName: 'Lot번호', width: 130 },
    {
        field: 'qty', headerName: '수량', width: 90,
        cellClass: (p) => `ag-right-aligned-cell font-bold ${p.value < 0 ? 'text-red-500' : 'text-emerald-600'}`,
        valueFormatter: (p) => (p.value > 0 ? `+${p.value}` : `${p.value}`),
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
        let ignore = false;
        invHistApi.list().then(data => { if (!ignore) setRowData(data); });
        return () => { ignore = true; };
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
            <SearchBar label="검색" onSearch={fetchList}>
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
                <SearchItem label="로케이션">
                    <input
                        type="text"
                        value={cond.locCd}
                        onChange={(e) => setCond(prev => ({ ...prev, locCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="RCV-STAGE"
                        className="w-full input-base"
                    />
                </SearchItem>
                <SearchItem label="유형">
                    <DropdownSelect
                        value={cond.txTyp}
                        onChange={(v) => setCond(prev => ({ ...prev, txTyp: v }))}
                        options={TX_TYPE_OPTIONS}
                        placeholder="전체"
                    />
                </SearchItem>
                <SearchItem label="Ref No.">
                    <input
                        type="text"
                        value={cond.rfnDocNo}
                        onChange={(e) => setCond(prev => ({ ...prev, rfnDocNo: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="IB-20260717-001"
                        className="w-full input-base"
                    />
                </SearchItem>
                <SearchItem label="생성일자" wide>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={cond.dateFrom}
                            onChange={(e) => setCond(prev => ({ ...prev, dateFrom: e.target.value }))}
                            className="flex-1 min-w-0 input-base"
                        />
                        <span className="text-slate-400 shrink-0">~</span>
                        <input
                            type="date"
                            value={cond.dateTo}
                            onChange={(e) => setCond(prev => ({ ...prev, dateTo: e.target.value }))}
                            className="flex-1 min-w-0 input-base"
                        />
                    </div>
                </SearchItem>
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-2">
                <span className="text-xs text-slate-500 font-medium">{rowData.length}건</span>
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