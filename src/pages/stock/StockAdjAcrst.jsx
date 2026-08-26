import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { History } from 'lucide-react';

import { invAdjApi } from '@/api/invAdjApi';
import { useCodes } from '@/hooks/useCodes';
import { INV_ADJ_RSN_GRP } from '@/constants/rsnCodes';
import { daysAheadStr, fmtDt, num, todayStr } from '@/utils/format';
import SearchBar, { SearchText, SearchSelect, SearchDateRange, SearchProd, SearchLoc } from '@/components/common/SearchBar';

const LINE_TYP_OPTIONS = [
    { value: '', label: '전체' },
    { value: 'true', label: '보류분' },
    { value: 'false', label: '가용분' },
];

/**
 * 재고조정 실적 (append-only 로그). 취소 경로가 없어 되돌린 것도 새 행으로 쌓인다.
 * 재고 변동의 원장은 재고 이력 조회의 ADJUST 1행(참조번호 = 재고조정 번호)이고,
 * 이 탭은 「무엇을 얼마나, 왜 처분했나」를 조작 단위로 보여주는 자기완결 기록이다.
 *
 * 조정후수량 컬럼은 저장하지 않고 여기서 만든다 — 조정전 + 조정수량으로 언제나 파생된다.
 */
export default function StockAdjAcrst() {
    const rsn = useCodes(INV_ADJ_RSN_GRP);
    const [cond, setCond] = useState({
        adjNo: '', prodCd: '', locCd: '', lotNo: '', rsnCd: '', hldOnly: '',
        dateFrom: daysAheadStr(-6), dateTo: todayStr(),
    });
    const [rowData, setRowData] = useState([]);

    const columnDefs = useMemo(() => [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        { field: 'createdAt', headerName: '실행일시', width: 150, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
        { field: 'adjNo', headerName: '조정 번호', width: 145, cellClass: 'font-medium' },
        {
            field: 'hldNo', headerName: '구분', width: 85,
            headerTooltip: '보류분 = 보류 건을 지목해 폐기(해제 실적이 함께 남는다) / 가용분 = 가용재고 증감',
            cellStyle: { display: 'flex', alignItems: 'center' },
            cellRenderer: (p) => (p.value
                ? <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">보류분</span>
                : <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">가용분</span>),
        },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 140 },
        { field: 'locCd', headerName: '로케이션', width: 115 },
        { field: 'lotNo', headerName: 'Lot번호', width: 140 },
        {
            field: 'adjBfrQty', headerName: '조정전', width: 90,
            headerTooltip: '실행 시점에 서버가 재고 행 락을 걸고 다시 읽은 보유수량 (화면 입력값이 아니다)',
            cellClass: 'ag-right-aligned-cell text-slate-500', valueFormatter: (p) => num(p.value),
        },
        {
            field: 'adjQty', headerName: '조정수량', width: 100,
            cellClass: 'ag-right-aligned-cell font-bold',
            cellRenderer: (p) => (
                <span className={p.value < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                    {p.value > 0 ? `+${num(p.value)}` : num(p.value)}
                </span>
            ),
        },
        {
            headerName: '조정후', width: 90,
            headerTooltip: '조정전 + 조정수량으로 파생된다 — 저장하지 않는 값이다',
            cellClass: 'ag-right-aligned-cell font-bold text-slate-700',
            valueGetter: (p) => p.data.adjBfrQty + p.data.adjQty,
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'hldNo', colId: 'hldNoText', headerName: '보류 번호', width: 145, cellClass: 'text-slate-500',
            headerTooltip: '소진한 보류 건 — 같은 번호의 해제 실적(사유: 재고조정)이 재고 보류 화면에 남는다',
            cellRenderer: (p) => (p.value || <span className="text-slate-300">—</span>),
        },
        {
            field: 'rsnCd', headerName: '조정사유', width: 165,
            cellRenderer: (p) => (
                <span className="text-xs">
                    <b>{rsn.nm(p.value)}</b>
                    {p.data.rsnDscr && <span className="text-slate-400"> — {p.data.rsnDscr}</span>}
                </span>
            ),
        },
        { field: 'createdBy', headerName: '실행자', width: 90, cellClass: 'text-slate-500' },
    ], [rsn]);

    const fetchList = async () => setRowData(await invAdjApi.list(cond));

    useEffect(() => {
        invAdjApi.list(cond).then(setRowData);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const downQty = rowData.reduce((s, r) => s + Math.min(r.adjQty, 0), 0);
    const upQty = rowData.reduce((s, r) => s + Math.max(r.adjQty, 0), 0);

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <History size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">조정 실적</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    재고 변동은 재고 이력 조회의 조정 1행(참조번호 = 조정 번호) — 이 탭은 조작 단위의 기록
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="adjNo" label="조정 번호" placeholder="AJ-20260826-001" />
                <SearchProd name="prodCd" />
                <SearchLoc name="locCd" />
                <SearchText name="lotNo" label="Lot번호" placeholder="LOT-260722-001" />
                <SearchSelect name="rsnCd" label="조정사유" options={rsn.searchOptions} />
                <SearchSelect name="hldOnly" label="구분" options={LINE_TYP_OPTIONS} />
                <SearchDateRange from="dateFrom" to="dateTo" label="실행일자" />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 font-medium">조정 실적 {num(rowData.length)}건</span>
                    <span className="text-xs font-bold">
                        <span className="text-rose-600">{num(downQty)}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="text-emerald-600">+{num(upQty)}</span>
                    </span>
                </div>
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
