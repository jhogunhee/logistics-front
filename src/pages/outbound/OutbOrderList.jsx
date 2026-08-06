import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { PackageCheck } from 'lucide-react';

import SearchBar, { SearchText, SearchSelect, SearchDateRange } from '@/components/common/SearchBar';
import { Badge } from '@/components/common/Badge';
import { outbOrderApi } from '@/api/outbOrderApi';
import { codeApi, toSearchOptions } from '@/api/codeApi';
import { OUTB_STATUS_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { OUTB_STATUS_OPTIONS } from '@/constants/codeOptions';
import { daysAheadStr, num, todayStr } from '@/utils/format';

const centered = { display: 'flex', alignItems: 'center', justifyContent: 'center' };

const HEADER_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'outbNo', headerName: '출고번호', width: 160, cellClass: 'font-bold text-slate-700' },
    {
        field: 'status', headerName: '출고진행상태', width: 120, cellStyle: centered,
        cellRenderer: (p) => <Badge meta={OUTB_STATUS_META} value={p.value} show="label" />,
    },
    // 점포명은 긴 것이 많아 이 폭에서는 잘린다 — 전체 이름은 툴팁과 하단 라인 패널 머리글에서 본다
    { field: 'storeNm', headerName: '점포', flex: 1, minWidth: 100, tooltipField: 'storeNm' },
    {
        field: 'outbTyp', headerName: '출고유형', width: 100,
        headerTooltip: '웨이브 전략의 편성 조건 기준값',
        valueFormatter: (p) => p.context.outbTypNm(p.value) ?? p.value,
    },
    {
        field: 'vhclFltno', headerName: '차량편수', width: 90,
        headerTooltip: '웨이브 전략의 편성 조건 기준값. 비어 있으면 배차 미정',
        cellRenderer: (p) => (p.value
            ? (p.context.vhclFltnoNm(p.value) ?? p.value)
            : <span className="text-slate-400">배차미정</span>),
    },
    { field: 'expctDe', headerName: '출고 예정일', width: 105 },
    {
        // 입고예정에는 없는 컬럼이다 — 출고는 예정과 작업(피킹지시) 사이에 웨이브라는 단계가 하나 더 있고,
        // 「이 주문이 언제 나가는 묶음에 들어갔나」가 이 화면에서 가장 먼저 확인할 값이다.
        //
        // 편입 출처(전략/수동) 뱃지는 일부러 빼뒀다. 한 셀에 번호와 함께 넣으면 좁은 폭에서 뱃지가
        // 먼저 잘리고, 별도 컬럼으로 빼면 이 그리드가 가로 스크롤에 걸린다. 출처는 「전략 조건과 맞지
        // 않는 주문이 웨이브에 들어 있나」를 보는 값이라 웨이브 편성 화면의 관심사이고, 거기서는
        // 이미 독립 컬럼으로 보여준다. 이 화면의 질문은 「어느 웨이브에 들어갔나」다.
        field: 'wavNo', headerName: '웨이브', width: 155,
        headerTooltip: '편성된 웨이브. 비어 있으면 아직 미편성 — 웨이브 편성 화면의 후보로 잡힌다',
        cellRenderer: (p) => (p.value
            ? <span className="text-slate-600">{p.value}</span>
            : <span className="text-slate-400">미편성</span>),
    },
    {
        headerName: '할당 진행', width: 90, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '할당이 붙은 라인 / 전체 라인',
        valueGetter: (p) => `${p.data.alocLineCount} / ${p.data.lineCount}`,
    },
    {
        field: 'totalOrderQty', headerName: '주문수량', width: 95,
        cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value),
    },
    {
        field: 'totalAlocQty', headerName: '할당수량', width: 95,
        cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value),
    },
];

const LINE_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'prodCd', headerName: '상품 코드', width: 140 },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 200 },
    {
        field: 'tmpZon', headerName: '온도대', width: 120, cellStyle: centered,
        cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
    },
    { field: 'odrQty', headerName: '주문수량', width: 100, cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value) },
    { field: 'alocQty', headerName: '할당수량', width: 100, cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value) },
    {
        headerName: '잔량', width: 90,
        headerTooltip: '주문 - 할당수량. 남아 있으면 아직 채우지 못한 부분할당이다',
        valueGetter: (p) => p.data.odrQty - p.data.alocQty,
        // 입고의 잔량은 음수(과입고)가 날 수 있지만 여기는 나지 않는다 — 과할당은 ck_inv_qty가 막는다.
        // 그래서 붉은색은 「초과」가 아니라 「아직 남았다」에 쓴다.
        cellClass: (p) => (p.value > 0
            ? 'ag-right-aligned-cell text-amber-600 font-bold'
            : 'ag-right-aligned-cell text-slate-400'),
        valueFormatter: (p) => num(p.value),
    },
];

/**
 * 출고예정 (조회 전용). 입고예정(ASN) 화면과 같은 자리다 — <b>OMS 출고주문 확정이 만든 창고 문서</b>를
 * 헤더–라인 2단으로 보여준다.
 *
 * <p>등록도 취소도 여기 없다. 출고주문의 생성·소멸은 OMS 출고주문 관리의 주문확정/확정취소가
 * 주관한다 — 창고가 예정을 스스로 만들거나 없애면 주문 상태와 어긋난다. 서버에도 그 두
 * 엔드포인트가 없다(<code>OutbOrderController</code>).
 *
 * <p>이후 작업은 웨이브 편성 → 할당 화면으로 이어지고, 둘 다 이 화면과 같은 <code>outb_order</code>를 본다.
 */
export default function OutbOrderList() {
    const [rowData, setRowData] = useState([]);
    const [lineRows, setLineRows] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [cond, setCond] = useState({
        outbNo: '', status: '', outbTyp: '', vhclFltno: '',
        dateFrom: todayStr(), dateTo: daysAheadStr(7),
    });
    const gridRef = useRef(null);

    // 공통코드 (출고유형 · 차량편수) — 값 목록의 주인은 코드관리라 화면에 하드코딩하지 않는다
    const [outbTyps, setOutbTyps] = useState([]);
    const [vhclFltnos, setVhclFltnos] = useState([]);

    const codeNm = (list, cd) => list.find(c => c.codeCd === cd)?.codeNm;
    const gridContext = useMemo(() => ({
        outbTypNm: (cd) => codeNm(outbTyps, cd),
        vhclFltnoNm: (cd) => codeNm(vhclFltnos, cd),
    }), [outbTyps, vhclFltnos]);

    const fetchList = async () => {
        const data = await outbOrderApi.list(cond);
        setRowData(data);
        setSelectedOrder(null);
        setLineRows([]);
    };

    // 최초 1회 조회 (검색조건 기본값 = 오늘 ~ +7일)
    useEffect(() => {
        outbOrderApi.list(cond).then(setRowData).catch(() => {});
        codeApi.list('OUTB_TYP').then(setOutbTyps).catch(() => {});
        codeApi.list('VHCL_FLTNO').then(setVhclFltnos).catch(() => {});
    }, []);

    // 헤더 행 선택 시 라인 조회
    const onSelectionChanged = async (e) => {
        const node = e.api.getSelectedNodes()[0];
        if (!node) {
            setSelectedOrder(null);
            setLineRows([]);
            return;
        }
        setSelectedOrder(node.data);
        setLineRows(await outbOrderApi.lines(node.data.outbOrderId));
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <PackageCheck size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">출고예정</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    조회 — 등록은 출고주문 확정으로, 편성·할당은 웨이브 편성·할당 화면에서
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="outbNo" label="출고번호" placeholder="OB-20260803-001" />
                <SearchSelect name="status" label="출고진행상태" options={OUTB_STATUS_OPTIONS} />
                <SearchSelect name="outbTyp" label="출고유형" options={toSearchOptions(outbTyps)} />
                <SearchSelect name="vhclFltno" label="차량편수" options={toSearchOptions(vhclFltnos)} />
                {/* 기간은 출고예정일이다 — 주문일이 아니다. 웨이브도 같은 기준으로 대상을 좁힌다 */}
                <SearchDateRange from="dateFrom" to="dateTo" label="출고예정일" />
            </SearchBar>

            {/* 상하 분할 + 드래그 스플리터 — 경계를 끌어 비율 조절 (비율은 localStorage에 기억됨) */}
            <PanelGroup direction="vertical" autoSaveId="outb-order-split-v1" className="flex-1 min-h-0">
                <Panel defaultSize={60} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">{rowData.length}건</span>
                        <span className="text-[11px] text-slate-400">
                            출고예정의 생성·취소는 OMS 출고주문 관리에서 합니다
                        </span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={gridRef}
                            rowData={rowData}
                            columnDefs={HEADER_COLUMN_DEFS}
                            context={gridContext}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                            onSelectionChanged={onSelectionChanged}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={40} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700">출고 라인</span>
                        <span className="text-xs text-slate-400">
                            {selectedOrder ? `${selectedOrder.outbNo} · ${selectedOrder.storeNm}` : '위에서 출고예정을 선택하세요'}
                        </span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact rowData={lineRows} columnDefs={LINE_COLUMN_DEFS} rowHeight={34} />
                    </div>
                </Panel>
            </PanelGroup>
        </div>
    );
}
