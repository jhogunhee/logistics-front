import { useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { History } from 'lucide-react';

import { invHistApi } from '@/api/invHistApi';
import { TEMP_ZONE_META, TX_TYPE_META } from '@/constants/badgeMeta';
import { TX_TYPE_OPTIONS } from '@/constants/codeOptions';
import { usePage } from '@/hooks/usePage';
import { daysAheadStr, fmtDt, num, todayStr } from '@/utils/format';
import SearchBar, { SearchText, SearchSelect, SearchDateRange, SearchProd, SearchLoc } from '@/components/common/SearchBar';
import { Badge } from '@/components/common/Badge';
import Pager from '@/components/common/Pager';

const REF_DOC_TYPE_LABEL = { INBOUND: '입고', OUTBOUND: '출고' };

// 서버 페이징이라 그리드 헤더 정렬을 끈다 — 한 페이지 안에서만 정렬되면 사용자가 속는다. 정렬은 서버의 최근 순 고정
const DEFAULT_COL_DEF = { sortable: false };

const COLUMN_DEFS = [
    // 페이지가 넘어가도 순번이 이어지게 앞 페이지 건수(context.offset)를 더한다
    { headerName: 'No.', width: 60, valueGetter: (p) => p.context.offset + p.node.rowIndex + 1, cellClass: 'text-slate-400' },
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
    const [cond, setCond] = useState({ prodCd: '', locCd: '', lotNo: '', txTyp: '', rfnDocNo: '', dateFrom: daysAheadStr(-6), dateTo: todayStr() });
    const [data, setData] = useState({ rows: [], totCnt: 0 });
    const { page, size, setPage } = usePage(30);

    // 조회 버튼은 1페이지부터, 페이저는 그 페이지로 — 조건이 바뀌었는데 3페이지에 머물면 빈 화면이 된다
    const fetchList = async (nextPage = 1) => {
        setPage(nextPage);
        setData(await invHistApi.list(cond, { page: nextPage, size }));
    };

    useEffect(() => {
        invHistApi.list(cond, { page: 1, size }).then(setData);
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <SearchBar cond={cond} setCond={setCond} onSearch={() => fetchList(1)}>
                <SearchProd name="prodCd" />
                <SearchLoc name="locCd" placeholder="RCV-STAGE" />
                <SearchText name="lotNo" label="Lot번호" placeholder="LOT-260722-001" />
                <SearchSelect name="txTyp" label="유형" options={TX_TYPE_OPTIONS} />
                <SearchText name="rfnDocNo" label="Ref No." placeholder="IB-20260717-001" />
                <SearchDateRange from="dateFrom" to="dateTo" label="생성일자" />
            </SearchBar>

            {/* 페이저는 그리드 아래 — 마지막 행까지 훑고 나서 다음 페이지를 누르는 순서가 된다 */}
            <div className="flex-1 min-h-0 flex flex-col gap-2">
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        rowData={data.rows}
                        columnDefs={COLUMN_DEFS}
                        defaultColDef={DEFAULT_COL_DEF}
                        context={{ offset: (page - 1) * size }}
                        rowHeight={34}
                        headerHeight={38}
                    />
                </div>
                <Pager page={page} size={size} totCnt={data.totCnt} onChange={fetchList} />
            </div>
        </div>
    );
}
