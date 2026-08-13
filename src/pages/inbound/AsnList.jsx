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
import { eaQtyPerInbUomOf } from '@/api/prodApi';
import { daysAheadStr, fmtDt, fmtInbQty, num, todayStr } from '@/utils/format';

/** 라인 수량 셀 — 저장값은 낱개(EA)이고 표시는 「입고단위 (낱개)」다 */
const inbQtyFmt = (p) => fmtInbQty(p.value, eaQtyPerInbUomOf(p.data), p.data?.inbUomCd);

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
        field: 'totalExpctQty', headerName: '예정수량(EA)', width: 110,
        // 단위를 못 붙인 게 아니라 EA로 통일한 것이다 — 한 입고건에 BOX 상품과 EA 상품이
        // 섞이면 합계에 붙일 단위가 낱개밖에 없다. 라벨에 박아둬야 사용자가 박스로 오해하지 않는다.
        // 상품이 하나로 확정되는 라인 그리드에는 이 제약이 없다
        headerTooltip: '라인 예정수량의 합계. 상품마다 입고단위가 달라 낱개(EA)로 통일해 더한다',
        cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value),
    },
    // 헤더가 드는 수량은 예정수량 하나뿐이다. 진행은 수량이 아니라 「언제」로 표현한다 —
    // 상태 뱃지가 단계를, 아래 두 일시가 시작과 끝을 말한다.
    //
    // 수량 진행(검수/적치 누계·잔량)을 헤더에 두지 않는 이유: 여러 상품이 섞인 합계는 단위가
    // 낱개(EA)밖에 될 수 없어(입고단위는 상품 속성이라 헤더에 붙일 라벨이 없다) 진행 파악에
    // 도움이 안 된다. 「얼마나 왔나」는 단위가 확정되는 라인 그리드가 맡는다 —
    // 입고검수 화면이 같은 이유로 헤더 합계를 두지 않은 것과 같은 판단이다
    {
        field: 'inspDt', headerName: '검수일시', width: 150,
        headerTooltip: '최종 검수일시 — 라인들의 검수일시 중 가장 늦은 것. 마지막으로 검수가 움직인 때',
        cellRenderer: (p) => (p.value ? fmtDt(p.value) : <span className="text-slate-300">—</span>),
    },
    {
        field: 'cfmDt', headerName: '확정일시', width: 150,
        headerTooltip: '입고가 확정(마감)된 시각. 비어 있으면 아직 진행 중이다',
        cellRenderer: (p) => (p.value ? fmtDt(p.value) : <span className="text-slate-300">—</span>),
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
    {
        // 라인에도 진행상태를 둔다 — 수량 셋을 눈으로 비교해야 알던 것을 뱃지 하나로 읽는다.
        // 서버가 수량에서 파생시켜 내려주는 값이고(IbLine#progressStatus) 저장된 컬럼이 아니다.
        // 헤더와 같은 IbStatus라 뱃지 메타를 그대로 쓴다 — 헤더 상태가 왜 그 값인지 여기서 보인다.
        field: 'status', headerName: '입고진행상태', width: 130,
        headerTooltip: '예정·검수·적치 수량에서 파생. 검수 축을 먼저 본다 — 덜 왔으면(검수 < 예정) 온 것을 다 적치했어도 검수중이다',
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={ASN_STATUS_META} value={p.value} show="label" />,
    },
    // 잔량(예정−검수) 컬럼은 두지 않는다 — 이 그리드는 입고·적치 두 축이 함께 나오는 유일한
    // 자리라 「잔량」이 어느 쪽에서 빼는 값인지 위치로 오해된다. 예정과 검수가 나란히 있으니
    // 차이는 그 자리에서 읽힌다. 잔량을 이름 그대로 쓰는 곳은 축이 하나뿐인 화면들이다
    // (Receiving = 예정−검수, Allocation = 주문−할당, Putaway = 미적치)
    // 세 수량은 「입고단위 (낱개)」로 보여준다 — 라인은 상품이 하나라 입고단위가 확정된다.
    // 헤더 합계가 EA인 것과 어긋나 보이지 않게 괄호에 낱개를 늘 같이 적는다 (utils/format의 fmtInbQty)
    { field: 'expctQty', headerName: '예정수량', width: 140, cellClass: 'ag-right-aligned-cell', valueFormatter: inbQtyFmt },
    { field: 'rcvdQty', headerName: '검수수량', width: 140, cellClass: 'ag-right-aligned-cell', valueFormatter: inbQtyFmt },
    { field: 'ptawyQty', headerName: '적치완료', width: 140, cellClass: 'ag-right-aligned-cell', valueFormatter: inbQtyFmt },
    // 라인 검수일시 컬럼은 두지 않는다 — 「언제」는 헤더 몫이고 여기는 「무엇이 얼마나」를 맡는다.
    // 한 입고건은 보통 한 자리에서 한 번에 검수하므로 라인마다 헤더와 거의 같은 시각이 반복될 뿐이고,
    // 값이 실제로 갈리는 분할입고에서는 오히려 칸 하나로 부족하다 (마지막 시각만 남아 몇 번에
    // 나눠 왔는지가 사라진다). 그건 검수 이력이 답할 일이다 — asnApi.receipts()
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
                            // 행 식별자가 없으면 목록이 다시 올 때 선택이 풀린다 (입고검수 화면과 같은 이유)
                            getRowId={(p) => p.data.ibNo}
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
