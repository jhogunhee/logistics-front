import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Truck } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchText, SearchSelect, SearchDateRange } from '@/components/common/SearchBar';
import { asnApi } from '@/api/asnApi';
import { ASN_STATUS_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { ASN_STATUS_OPTIONS } from '@/constants/codeOptions';
import { Badge } from '@/components/common/Badge';
import { daysAheadStr, num, todayStr } from '@/utils/format';

// 오늘 날짜 "YYYY-MM-DD" (검색 기본값)


const HEADER_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'ibNo', headerName: '입고번호', width: 170 },
    {
        field: 'status', headerName: '입고진행상태', width: 130,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={ASN_STATUS_META} value={p.value} show="label" />,
    },
    { field: 'vndrNm', headerName: '벤더', flex: 1, minWidth: 110 },
    { field: 'expctDe', headerName: '입고 예정일', width: 120 },
    {
        headerName: '검수 진행', width: 100, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '전량 검수된 라인 / 전체 라인 (부분 검수중인 라인은 제외)',
        valueGetter: (p) => `${num(p.data.cmplLineCount)} / ${num(p.data.lineCount)}`,
    },
    { field: 'totalExpctQty', headerName: '예정수량', width: 100, cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value) },
    // 검수수량 컬럼은 두지 않는다 — 예정 − 잔량이라 셋 중 둘이면 충분하다.
    // (라인 그리드는 셋을 다 둔다. 거기는 실제로 작업하는 단위라 「얼마나 받았나」를 직접
    //  보는 게 자연스럽고, 적치완료와 나란히 놔야 검수↔적치 대조가 된다)
    //
    // 헤더가 드는 두 수량은 「남은 일」 둘이다 — 아직 안 온 것(잔량)과 와서 쌓여만 있는 것(미적치).
    // 「검수 진행」은 완료된 라인만 세므로 한 라인이 99% 찼는지 1% 찼는지 구분하지 못한다.
    // 분할검수·분할적치의 크기는 이 두 컬럼이 맡는다
    {
        headerName: '잔량', width: 90,
        headerTooltip: '예정 − 검수수량 합계 — 아직 도착하지 않은 수량 (음수 = 과입고)',
        valueGetter: (p) => p.data.totalExpctQty - p.data.totalRcvdQty,
        valueFormatter: (p) => num(p.value),
        cellClass: (p) => p.value < 0
            ? 'ag-right-aligned-cell text-red-500 font-bold'
            : 'ag-right-aligned-cell',
    },
    {
        headerName: '미적치', width: 90,
        headerTooltip: '검수 − 적치 합계 — RCV-STAGE에 쌓여 있는 수량',
        valueGetter: (p) => p.data.totalRcvdQty - p.data.totalPtawyQty,
        valueFormatter: (p) => num(p.value),
        // ck_ib_line_qty(ptawy <= rcvd)가 막으므로 음수는 나올 수 없다 — 나오면 그 자체가 신호다
        cellClass: (p) => p.value < 0
            ? 'ag-right-aligned-cell text-red-500 font-bold'
            : 'ag-right-aligned-cell',
    },
];

const LINE_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'prodCd', headerName: '상품 코드', width: 140 },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 200 },
    {
        field: 'tmpZon', headerName: '온도대', width: 120,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
    },
    { field: 'expctQty', headerName: '예정수량', width: 100, cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value) },
    { field: 'rcvdQty', headerName: '검수수량', width: 100, cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value) },
    {
        headerName: '잔량', width: 90,
        headerTooltip: '예정 - 검수수량 (음수 = 과입고)',
        valueGetter: (p) => p.data.expctQty - p.data.rcvdQty,
        valueFormatter: (p) => num(p.value),
        cellClass: (p) => p.value < 0 ? 'ag-right-aligned-cell text-red-500 font-bold' : 'ag-right-aligned-cell',
    },
    { field: 'ptawyQty', headerName: '적치완료', width: 100, cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value) },
];

export default function AsnList() {
    const [rowData, setRowData] = useState([]);
    const [lineRows, setLineRows] = useState([]);
    const [selectedAsn, setSelectedAsn] = useState(null);
    const [cond, setCond] = useState({ ibNo: '', status: '', dateFrom: todayStr(), dateTo: daysAheadStr(7) });
    const gridRef = useRef(null);

    const fetchList = async () => {
        const data = await asnApi.list(cond);
        setRowData(data);
        setSelectedAsn(null);
        setLineRows([]);
    };

    // 최초 1회 조회 (검색조건 기본값 = 오늘)
    useEffect(() => {
        asnApi.list(cond).then(setRowData);
    }, []);

    // 헤더 행 선택 시 라인 조회
    const onSelectionChanged = async (e) => {
        const node = e.api.getSelectedNodes()[0];
        if (!node) {
            setSelectedAsn(null);
            setLineRows([]);
            return;
        }
        setSelectedAsn(node.data);
        setLineRows(await asnApi.lines(node.data.ibOrderId));
    };

    // 등록도 취소도 이 화면엔 없다. 입고예정의 생성/소멸은 입고주문 관리 화면의
    // 주문확정 · 확정취소가 주관한다 — 여기서 예정만 없애면 주문 상태와 어긋나기 때문이다.
    // 이 화면은 조회 전용이고, 실제 작업은 입고검수·적치 화면에서 이어진다.

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Truck size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">입고예정(ASN)</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    조회 · 취소 — 등록은 입고주문 확정으로, 검수는 입고검수 화면에서
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="ibNo" label="입고번호" placeholder="IB-20260717-001" />
                <SearchSelect name="status" label="입고진행상태" options={ASN_STATUS_OPTIONS} />
                <SearchDateRange from="dateFrom" to="dateTo" label="입고예정일" />
            </SearchBar>

            {/* 상하 분할 + 드래그 스플리터 — 경계를 끌어 비율 조절 (비율은 localStorage에 기억됨) */}
            <PanelGroup direction="vertical" autoSaveId="wms-asn-split-v2" className="flex-1 min-h-0">
                <Panel defaultSize={60} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">{num(rowData.length)}건</span>
                        <span className="text-[11px] text-slate-400">
                            입고예정의 생성·취소는 OMS 입고주문 관리에서 합니다
                        </span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={gridRef}
                            rowData={rowData}
                            columnDefs={HEADER_COLUMN_DEFS}
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
                        <span className="text-sm font-bold text-slate-700">입고 라인</span>
                        <span className="text-xs text-slate-400">
                            {selectedAsn ? `${selectedAsn.ibNo} · ${selectedAsn.vndrNm}` : '위에서 입고예정을 선택하세요'}
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
