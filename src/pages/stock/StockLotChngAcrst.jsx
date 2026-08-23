import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { History } from 'lucide-react';

import { invLotChngApi } from '@/api/invLotChngApi';
import { useCodes } from '@/hooks/useCodes';
import { LOT_ATTR_RSN_GRP } from '@/constants/rsnCodes';
import { daysAheadStr, fmtDt, num, todayStr } from '@/utils/format';
import SearchBar, { SearchText, SearchSelect, SearchDateRange, SearchProd, SearchLoc } from '@/components/common/SearchBar';

/** 전 → 후 셀 — 원 Lot과 목적지 Lot의 값을 나란히 (실행 시점 스냅샷이라 이후 정정과 무관하다) */
const DiffCell = ({ before, after }) => (
    <span className="text-xs">
        <span className="text-slate-400">{before ?? '-'}</span>
        <span className="text-slate-300 mx-1">→</span>
        <b className={before !== after ? 'text-amber-600' : 'text-slate-400'}>{after ?? '-'}</b>
    </span>
);

/**
 * 재고 로트변경 실적 (append-only 로그). 취소 경로가 없어 되돌린 것도 새 행으로 쌓인다.
 * 재고 변동의 원장은 재고 이력 조회의 ADJUST 2행(참조번호 = 로트변경 번호)이고,
 * 이 탭은 「어느 Lot에서 어느 Lot으로, 왜」를 조작 단위로 보여주는 자기완결 기록이다.
 */
export default function StockLotChngAcrst() {
    const rsn = useCodes(LOT_ATTR_RSN_GRP);
    const [cond, setCond] = useState({
        lotChngNo: '', prodCd: '', locCd: '', lotNo: '', rsnCd: '',
        dateFrom: daysAheadStr(-6), dateTo: todayStr(),
    });
    const [rowData, setRowData] = useState([]);

    const columnDefs = useMemo(() => [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        { field: 'createdAt', headerName: '실행일시', width: 150, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
        { field: 'lotChngNo', headerName: '로트변경 번호', width: 145, cellClass: 'font-medium' },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 140 },
        { field: 'locCd', headerName: '로케이션', width: 115 },
        {
            headerName: 'Lot번호 (원 → 새)', width: 250,
            cellRenderer: (p) => <DiffCell before={p.data.fromLotNo} after={p.data.toLotNo} />,
        },
        {
            field: 'toLotNewYn', headerName: '구분', width: 80,
            headerTooltip: '분할 = 목적지 Lot을 새로 채번 / 병합 = 같은 배치의 기존 Lot으로 합류',
            cellStyle: { display: 'flex', alignItems: 'center' },
            cellRenderer: (p) => (p.value
                ? <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">분할</span>
                : <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">병합</span>),
        },
        {
            headerName: '제조일자 (전 → 후)', width: 195,
            cellRenderer: (p) => <DiffCell before={p.data.fromMfgDt} after={p.data.toMfgDt} />,
        },
        {
            headerName: '유통기한 (전 → 후)', width: 195,
            cellRenderer: (p) => <DiffCell before={p.data.fromExpiryDt} after={p.data.toExpiryDt} />,
        },
        {
            field: 'chngQty', headerName: '수량', width: 85,
            cellClass: 'ag-right-aligned-cell font-bold text-indigo-700',
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
        { field: 'createdBy', headerName: '실행자', width: 90, cellClass: 'text-slate-500' },
    ], [rsn]);

    const fetchList = async () => setRowData(await invLotChngApi.list(cond));

    useEffect(() => {
        invLotChngApi.list(cond).then(setRowData);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <History size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">로트변경 실적</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    재고 변동은 재고 이력 조회의 조정 2행(참조번호 = 로트변경 번호) — 이 탭은 조작 단위의 기록
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="lotChngNo" label="로트변경 번호" placeholder="LC-20260813-001" />
                <SearchProd name="prodCd" />
                <SearchLoc name="locCd" />
                <SearchText name="lotNo" label="Lot번호" placeholder="원·새 어느 쪽이든" />
                <SearchSelect name="rsnCd" label="사유" options={rsn.searchOptions} />
                <SearchDateRange from="dateFrom" to="dateTo" label="실행일자" />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <span className="text-xs text-slate-500 font-medium">로트변경 실적 {num(rowData.length)}건</span>
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
