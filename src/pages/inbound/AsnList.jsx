import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Search, Truck, X } from 'lucide-react';

import SearchBar, { SearchItem, SearchText, SearchSelect, SearchDateRange } from '@/components/common/SearchBar';
import { asnApi } from '@/api/asnApi';
import { ASN_PRGR_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { ASN_PRGR_OPTIONS } from '@/constants/codeOptions';
import VendorPickerModal from '@/components/common/VendorPickerModal';
import { Badge } from '@/components/common/Badge';
import { eaQtyPerInbUomOf } from '@/api/prodApi';
import { daysAheadStr, fmtDt, fmtInbQty, num, todayStr } from '@/utils/format';

/** 라인 수량 셀 — 저장값은 낱개(EA)이고 표시는 「입고단위 (낱개)」다 */
const inbQtyFmt = (p) => fmtInbQty(p.value, eaQtyPerInbUomOf(p.data), p.data?.inbUomCd);

const HEADER_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'ibNo', headerName: '입고번호', width: 170 },
    {
        // 저장 상태(3값)가 아니라 서버가 수량·적치지시에서 파생시킨 5단계 — 3값으론 「어디까지 왔나」가 성기다
        field: 'prgr', headerName: '진행단계', width: 130,
        headerTooltip: '수량·적치지시에서 계산한 진행 단계. 적치완료는 확정 대기라는 뜻이다 — 입고확정 화면에서 닫는다',
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={ASN_PRGR_META} value={p.value} show="label" />,
    },
    { field: 'vndrNm', headerName: '벤더', flex: 1, minWidth: 110 },
    { field: 'expctDe', headerName: '입고 예정일', width: 120 },
    {
        field: 'totalExpctQty', headerName: '예정수량(EA)', width: 110,
        headerTooltip: '라인 예정수량의 합계. 상품마다 입고단위가 달라 낱개(EA)로 통일해 더한다',
        cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value),
    },
    // 헤더는 수량 대신 「언제」를 든다 — 상품이 섞인 합계는 EA밖에 안 돼 진행 파악에 안 쓰인다
    {
        field: 'inspDt', headerName: '검수일시', width: 150,
        headerTooltip: '최종 검수일시 — 라인들의 검수일시 중 가장 늦은 것. 마지막으로 검수가 움직인 때',
        cellRenderer: (p) => (p.value ? fmtDt(p.value) : <span className="text-slate-300">—</span>),
    },
    {
        field: 'cfmDt', headerName: '확정일시', width: 150,
        headerTooltip: '입고확정 버튼을 누른 시각. 비어 있으면 아직 진행 중이다',
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
        // 서버가 수량에서 파생시킨 값(IbLine#progressStatus) — 헤더와 같은 IbPrgr라 헤더가 왜 그 단계인지 여기서 보인다
        field: 'status', headerName: '진행단계', width: 130,
        headerTooltip: '예정·검수·적치 수량에서 계산. 검수 축을 먼저 본다 — 덜 왔으면(검수 < 예정) 온 것을 다 적치했어도 검수다',
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={ASN_PRGR_META} value={p.value} show="label" />,
    },
    // 잔량 컬럼은 두지 않는다 — 입고·적치 두 축이 함께 나오는 자리라 어느 쪽에서 뺀 값인지 오해된다
    // 세 수량은 「입고단위 (낱개)」 표기 — 라인은 상품이 하나라 단위가 확정된다 (fmtInbQty)
    { field: 'expctQty', headerName: '예정수량', width: 140, cellClass: 'ag-right-aligned-cell', valueFormatter: inbQtyFmt },
    { field: 'rcvdQty', headerName: '검수수량', width: 140, cellClass: 'ag-right-aligned-cell', valueFormatter: inbQtyFmt },
    { field: 'ptawyQty', headerName: '적치완료', width: 140, cellClass: 'ag-right-aligned-cell', valueFormatter: inbQtyFmt },
    // 라인 검수일시는 두지 않는다 — 분할입고면 마지막 시각만 남아 칸 하나로 부족하다 (검수 이력이 답할 일)
];

export default function AsnList() {
    const [rowData, setRowData] = useState([]);
    const [lineRows, setLineRows] = useState([]);
    const [selectedAsn, setSelectedAsn] = useState(null);
    const [cond, setCond] = useState({ ibNo: '', vndrNm: '', prgr: '', dateFrom: todayStr(), dateTo: daysAheadStr(7) });
    const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
    const gridRef = useRef(null);

    const fetchList = async () => {
        const data = await asnApi.list(cond);
        setRowData(data);
        setSelectedAsn(null);
        setLineRows([]);
    };

    // 최초 1회 조회 (기본 기간 = 오늘 ~ +7일)
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

    // 등록도 취소도 없는 조회 전용 화면 — 예정만 없애면 주문 상태와 어긋나 OMS 입고주문이 주관한다

    return (
        // min-h — 노트북처럼 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Truck size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">입고예정(ASN)</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    조회 전용 — 등록·취소는 입고주문 확정에서, 검수는 입고검수 화면에서
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="ibNo" label="입고번호" placeholder="IB-20260717-001" />
                {/* 필터는 저장 상태(3값)가 아니라 그리드 뱃지와 같은 진행단계(5단계 파생)다 — 서버가 파생 후 거른다 */}
                <SearchSelect name="prgr" label="진행단계" options={ASN_PRGR_OPTIONS} />
                <SearchItem label="벤더">
                    <button
                        type="button"
                        onClick={() => setVendorPickerOpen(true)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-left flex items-center justify-between gap-2 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400">
                        <span className={`truncate ${cond.vndrNm ? 'text-slate-700' : 'text-slate-400'}`}>
                            {cond.vndrNm || '전체'}
                        </span>
                        {cond.vndrNm
                            ? <X
                                size={13}
                                title="벤더 조건 지우기"
                                className="shrink-0 text-slate-400 hover:text-slate-600"
                                onClick={(e) => { e.stopPropagation(); setCond(prev => ({ ...prev, vndrNm: '' })); }}
                              />
                            : <Search size={13} className="shrink-0 text-slate-400" />}
                    </button>
                </SearchItem>
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

            {/* 벤더 선택 팝업 — 자유 입력 대신 팝업에서 고른다 (입고검수·OMS 주문목록과 같은 방식, vndrNm contains 검색) */}
            <VendorPickerModal
                open={vendorPickerOpen}
                onClose={() => setVendorPickerOpen(false)}
                onSelect={(v) => setCond(prev => ({ ...prev, vndrNm: v.vndrNm }))}
            />
        </div>
    );
}
