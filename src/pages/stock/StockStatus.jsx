import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { Box, Map, Scale, Table2 } from 'lucide-react';

import { invApi } from '@/api/invApi';
import { zonApi } from '@/api/zonApi';
import { LOC_TYPE_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { num } from '@/utils/format';
import SearchBar, { SearchText, SearchSelect, SearchProd, SearchLoc } from '@/components/common/SearchBar';
import { Badge } from '@/components/common/Badge';
import { StatTile } from '@/components/common/StatTile';
import { ProdThumb } from '@/components/common/ProdThumb';
import { THUMB_CELL_STYLE } from '@/constants/agGrid';
import AlocRecModal from '@/components/stock/AlocRecModal';
import StockLocMap from '@/components/stock/StockLocMap';

const TEMP_ZONE_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(TEMP_ZONE_META).map(([value, m]) => ({ value, label: m.label })),
];

const LOC_TYPE_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(LOC_TYPE_META).map(([value, m]) => ({ value, label: m.label })),
];

/**
 * 로케이션 셀이 맵 탭으로 건너뛰는 링크라 콜백이 필요하다 — 그래서 상수가 아니라 팩토리다.
 * 나머지 컬럼은 순수 상수이므로 화면에서 useMemo로 한 번만 만든다.
 */
const columnDefsOf = (onGoMap) => [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    {
        field: 'prodImgUrl', headerName: '', width: 50, sortable: false, resizable: false,
        cellStyle: THUMB_CELL_STYLE,
        cellRenderer: (p) => <ProdThumb src={p.value} alt={p.data.prodNm} tmpZon={p.data.tmpZon} size={34} />,
    },
    { field: 'prodCd', headerName: '상품 코드', width: 115 },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 180 },
    {
        field: 'tmpZon', headerName: '온도대', width: 100,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
    },
    {
        field: 'locCd', headerName: '로케이션', width: 130,
        headerTooltip: '클릭하면 맵 탭에서 그 자리를 엽니다',
        cellRenderer: (p) => (
            <button onClick={() => onGoMap(p.value)}
                    className="text-indigo-600 hover:underline">{p.value}</button>
        ),
    },
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

const EMPTY_COND = { prodCd: '', locCd: '', zonCd: '', lotNo: '', tmpZon: '', locTyp: '' };

/**
 * 쿼리스트링에서 검색조건만 추린다. 키 이름을 InvSearchCond 필드명과 같게 쓰기로 해서 파싱이 없다.
 * 탭(`view`)은 조건이 아니므로 여기서 걸러진다 — 안 거르면 탭만 바꿔도 서버에 view=map이 실려 간다.
 */
const condFromQuery = (query) => {
    const params = new URLSearchParams(query);
    const cond = { ...EMPTY_COND };
    for (const key of Object.keys(EMPTY_COND)) {
        if (params.get(key) != null) cond[key] = params.get(key);
    }
    return cond;
};

export default function StockStatus() {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.toString();   // 객체는 매 렌더 새로 오므로 dep은 문자열로 잡는다

    const view = searchParams.get('view') === 'map' ? 'map' : 'table';
    const [cond, setCond] = useState(() => condFromQuery(query));
    const [zonCodes, setZonCodes] = useState([]);

    const zonOptions = [{ value: '', label: '전체' }, ...zonCodes.map(z => ({ value: z.zonCd, label: z.zonCd }))];
    const [rowData, setRowData] = useState([]);

    /** 표 → 맵. 조건이 아니라 「그 자리를 열어라」라서 검색조건은 건드리지 않는다 */
    const goMap = (locCd) => setSearchParams({ view: 'map', locCd }, { replace: false });

    /** 맵 → 표. 넘겨받은 locCd가 표의 검색조건이 된다(부분일치라 베이 prefix면 레벨 전부가 걸린다) */
    const goTable = (locCd) => {
        const next = { ...EMPTY_COND, locCd: locCd ?? '' };
        setCond(next);
        setSearchParams(locCd ? { locCd } : {}, { replace: false });
    };

    const columnDefs = useMemo(() => columnDefsOf(goMap), []); // eslint-disable-line react-hooks/exhaustive-deps

    // 요약 지표는 조회 결과에서 파생 (별도 API 없이 화면에서 집계)
    const summary = useMemo(() => {
        const prodKinds = new Set(rowData.map(r => r.prodCd)).size;
        const onHand = rowData.reduce((s, r) => s + Number(r.onHandQty), 0);
        const avail = rowData.reduce((s, r) => s + Number(r.avalQty), 0);
        const alloc = rowData.reduce((s, r) => s + Number(r.alocQty), 0);
        const hold = rowData.reduce((s, r) => s + Number(r.hldQty), 0);
        return { prodKinds, onHand, avail, alloc, hold };
    }, [rowData]);

    const fetchList = async () => {
        const data = await invApi.list(cond);
        setRowData(data);
    };

    // 조회는 URL의 검색조건을 원본으로 삼는다. dep을 query가 아니라 condKey로 잡아
    // 탭만 오갈 때는 재조회하지 않는다(조건이 그대로면 결과도 그대로다).
    const condKey = useMemo(() => JSON.stringify(condFromQuery(query)), [query]);
    useEffect(() => {
        invApi.list(JSON.parse(condKey)).then(setRowData);
    }, [condKey]);

    // 존 콤보 목록은 한 번만 — 검색조건과 무관하다
    useEffect(() => {
        zonApi.list().then(setZonCodes);
    }, []);

    const [recOpen, setRecOpen] = useState(false);

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 — 탭 버튼과 제목은 두 뷰가 공유한다 */}
            <div className="flex items-center gap-2">
                <Box size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">현재고 조회</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    {view === 'map'
                        ? '보관 로케이션 전건 · 셀 색은 점유율 · 클릭하면 그 자리의 재고 상세'
                        : '상품 + 로케이션 + Lot 단위 실시간 재고 · 가용 = 보유 − 할당 − 보류'}
                </span>

                {/* 표/맵 전환 — 모집단·검색조건·요약지표가 서로 달라 한 번에 하나만 보여준다 */}
                <div className="ml-auto shrink-0 flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                    <button onClick={() => goTable(cond.locCd)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 ${view === 'table'
                                ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                        <Table2 size={13} /> 표
                    </button>
                    <button onClick={() => goMap(cond.locCd)}
                            title="보관 로케이션 점유 맵 — 셀 색은 점유율, 클릭하면 그 자리의 재고 상세"
                            className={`flex items-center gap-1 px-2.5 py-1.5 border-l border-slate-200 ${view === 'map'
                                ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                        <Map size={13} /> 맵
                    </button>
                </div>
                <button onClick={() => setRecOpen(true)} className="btn-ghost shrink-0"
                        title="장부 예약(aloc)을 원천별 미소진 합(할당 · 이동지시 · 스테이징 피킹분)과 대사합니다 — 예약은 이력에 남지 않아 이 비교가 유일한 검증입니다">
                    <Scale size={13} /> 예약 대사
                </button>
            </div>

            {view === 'map' ? (
                <StockLocMap focusLocCd={searchParams.get('locCd') || ''} onGoTable={goTable} />
            ) : (
            <>
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
                <SearchSelect name="zonCd" label="존" options={zonOptions} />
                <SearchText name="lotNo" label="Lot번호" placeholder="LOT-260722-001" />
                <SearchSelect name="tmpZon" label="온도대" options={TEMP_ZONE_OPTIONS} />
                <SearchSelect name="locTyp" label="구분" options={LOC_TYPE_OPTIONS} />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-2">
                <span className="text-xs text-slate-500 font-medium">{num(rowData.length)}건</span>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        rowData={rowData}
                        columnDefs={columnDefs}
                        rowHeight={40}
                        headerHeight={38}
                    />
                </div>
            </div>
            </>
            )}
            {recOpen && <AlocRecModal onClose={() => setRecOpen(false)} />}
        </div>
    );
}
