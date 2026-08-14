import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { CheckCircle2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem, SearchText, SearchSelect, SearchDateRange } from '@/components/common/SearchBar';
import { asnApi } from '@/api/asnApi';
import { ASN_PRGR_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { ASN_PRGR_OPTIONS } from '@/constants/codeOptions';
import { Badge } from '@/components/common/Badge';
import { eaQtyPerInbUomOf } from '@/api/prodApi';
import { daysAheadStr, fmtDt, fmtInbQty, num, todayStr } from '@/utils/format';
import ConfirmModal from '@/components/common/ConfirmModal';
import VendorPickerModal from '@/components/common/VendorPickerModal';

/**
 * 입고확정 — 입고 흐름의 마지막 단계. 온 것은 전부 적치 완료된 입고건을 사람이 검토하고
 * 확정 버튼으로 닫는다. 이 순간 결품(예정 − 검수)이 못박히고, 이후 검수·검수취소·적치지시가 막힌다.
 * 자동 전이는 없다 — 전량 입고돼 결품이 0이어도 이 화면에서 눌러야 끝난다.
 *
 * 여러 건을 체크해 한 번에 확정할 수 있다. 단 결품을 안 보고 누르는 일이 없도록
 * 확인 모달이 건별 결품 수량을 전부 나열한다 — 일괄이어도 "숫자를 눈앞에 두고 누른다"는 원칙 유지.
 */

/** 라인 수량 셀 — 저장값은 낱개(EA)이고 표시는 「입고단위 (낱개)」다 (ASN 관리 화면과 동일) */
const inbQtyFmt = (p) => fmtInbQty(p.value, eaQtyPerInbUomOf(p.data), p.data?.inbUomCd);

/** 확정 가능 = 검수가 시작됐고(RECEIVING) 온 것은 전부 적치됨(적치완료). 서버(IbOrder.confirm)와 같은 판정 */
const confirmable = (a) => a.status === 'RECEIVING' && a.prgr === 'PTAWY_CMPL';

const HEADER_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'ibNo', headerName: '입고번호', width: 170 },
    {
        field: 'prgr', headerName: '진행단계', width: 130,
        headerTooltip: '적치완료 = 확정 대기. 확정은 적치완료 건에서만 열린다',
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={ASN_PRGR_META} value={p.value} show="label" />,
    },
    { field: 'vndrNm', headerName: '벤더', flex: 1, minWidth: 110 },
    { field: 'expctDe', headerName: '입고 예정일', width: 120 },
    {
        headerName: '결품(EA)', width: 100,
        headerTooltip: '예정 − 검수 합계. 확정하는 순간 이 수량이 결품으로 못박힌다',
        valueGetter: (p) => p.data.totalExpctQty - p.data.totalRcvdQty,
        cellClass: (p) => p.value > 0 ? 'ag-right-aligned-cell text-rose-600 font-bold' : 'ag-right-aligned-cell text-slate-400',
        valueFormatter: (p) => num(p.value),
    },
    {
        headerName: '미적치(EA)', width: 100,
        headerTooltip: '검수 − 적치 합계. 0이어야 확정할 수 있다 — 남았으면 적치 화면에서 먼저 옮긴다',
        valueGetter: (p) => p.data.totalRcvdQty - p.data.totalPtawyQty,
        cellClass: (p) => p.value > 0 ? 'ag-right-aligned-cell text-amber-600 font-bold' : 'ag-right-aligned-cell text-slate-400',
        valueFormatter: (p) => num(p.value),
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
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 180 },
    {
        field: 'tmpZon', headerName: '온도대', width: 100,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
    },
    {
        field: 'status', headerName: '진행단계', width: 120,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={ASN_PRGR_META} value={p.value} show="label" />,
    },
    { field: 'expctQty', headerName: '예정수량', width: 130, cellClass: 'ag-right-aligned-cell', valueFormatter: inbQtyFmt },
    { field: 'rcvdQty', headerName: '검수수량', width: 130, cellClass: 'ag-right-aligned-cell', valueFormatter: inbQtyFmt },
    { field: 'ptawyQty', headerName: '적치완료', width: 130, cellClass: 'ag-right-aligned-cell', valueFormatter: inbQtyFmt },
    {
        headerName: '결품', width: 130,
        headerTooltip: '예정 − 검수. 확정하면 이 수량은 더 안 오는 것으로 못박힌다',
        valueGetter: (p) => p.data.expctQty - p.data.rcvdQty,
        valueFormatter: inbQtyFmt,
        cellClass: (p) => p.value > 0 ? 'ag-right-aligned-cell text-rose-600 font-bold' : 'ag-right-aligned-cell text-slate-400',
    },
    {
        headerName: '미적치', width: 130,
        headerTooltip: '검수 − 적치. 남아 있으면 이 입고는 아직 확정할 수 없다',
        valueGetter: (p) => p.data.rcvdQty - p.data.ptawyQty,
        valueFormatter: inbQtyFmt,
        cellClass: (p) => p.value > 0 ? 'ag-right-aligned-cell text-amber-600 font-bold' : 'ag-right-aligned-cell text-slate-400',
    },
];

export default function InboundConfirm() {
    const [rowData, setRowData] = useState([]);
    const [lineRows, setLineRows] = useState([]);
    const [selectedAsns, setSelectedAsns] = useState([]); // 체크된 입고건들 (일괄 확정 대상)
    const [previewAsn, setPreviewAsn] = useState(null);   // 아래 라인 검토가 보여주는 한 건
    // 기본 진행단계 = 적치완료 — 이 화면의 유일한 동작(확정)이 가능한 단계다 (적치지시 관리의 기본 상태=지시와 같은 패턴).
    // 기본 기간 = ±7일 — 대상은 이미 도착한 건이라 과거가 주력이지만, 예정일보다 일찍 와서 적치까지
    // 끝난 건(예정일이 미래)도 확정 대상이다. 진행단계가 적치완료로 좁혀져 있어 미래를 포함해도 노이즈가 없다
    const [cond, setCond] = useState({ ibNo: '', vndrNm: '', prgr: 'PTAWY_CMPL', dateFrom: daysAheadStr(-7), dateTo: daysAheadStr(7) });
    const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
    const [confirmTargets, setConfirmTargets] = useState(null); // 확정 확인 모달 대상 (배열)
    const gridRef = useRef(null);

    const fetchList = async () => {
        const data = await asnApi.list(cond);
        setRowData(data);
        // 선택 해제는 그리드에도 직접 건다 — getRowId로 행 정체성이 유지되면 ag-grid가 재조회 후에도
        // 체크 표시를 되살려, 상태(selectedAsns)는 비었는데 화면엔 체크가 남는 어긋남이 생긴다
        gridRef.current?.api?.deselectAll();
        setSelectedAsns([]);
        setPreviewAsn(null);
        setLineRows([]);
    };

    useEffect(() => {
        asnApi.list(cond).then(setRowData);
    }, []);

    // 체크 목록과 라인 미리보기를 함께 관리한다 — 마지막으로 체크한 건의 라인을 아래에 보여준다.
    // 여러 건을 고르는 화면이라 "지금 아래 라인이 어느 건인지"를 라벨로 반드시 밝힌다
    const onSelectionChanged = async (e) => {
        const rows = e.api.getSelectedNodes().map(n => n.data);
        setSelectedAsns(rows);
        const preview = rows.length > 0 ? rows[rows.length - 1] : null;
        setPreviewAsn(preview);
        setLineRows(preview ? await asnApi.lines(preview.ibOrderId) : []);
    };

    const confirmables = selectedAsns.filter(confirmable);
    const skippedCount = selectedAsns.length - confirmables.length;

    // 버튼이 잠긴 이유를 말해준다 — 잠긴 버튼만 있으면 무엇을 먼저 해야 하는지 알 수 없다
    const blockReason = selectedAsns.length === 0 ? '위 목록에서 입고건을 체크하세요'
        : confirmables.length === 0 ? '체크한 건 중 확정 가능한 건이 없습니다 — 진행단계가 「적치완료」여야 합니다'
        : null;

    const shortageOf = (a) => a.totalExpctQty - a.totalRcvdQty;

    const doConfirm = async (targets) => {
        // 한 건씩 순서대로 보낸다 — 서버 API가 건 단위이고, 실패한 건이 성공한 건을 되돌리지 않는다.
        // 몇 건이 되고 몇 건이 왜 안 됐는지를 끝에 정리해 알린다
        const failed = [];
        for (const a of targets) {
            try {
                await asnApi.confirm(a.ibOrderId);
            } catch (e) {
                failed.push(`${a.ibNo}: ${e.message || '실패'}`);
            }
        }
        const okCount = targets.length - failed.length;
        if (okCount > 0) toast.success(`${okCount}건 입고를 확정했습니다.`);
        failed.forEach(msg => toast.error(msg));
        await fetchList();
    };

    return (
        // min-h — 노트북처럼 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">입고확정</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    적치까지 끝난 입고건을 닫습니다 — 안 온 수량은 결품으로 확정되고 이후 검수·취소가 막힙니다
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="ibNo" label="입고번호" placeholder="IB-20260717-001" />
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
                <SearchSelect name="prgr" label="진행단계" options={ASN_PRGR_OPTIONS} />
                <SearchDateRange from="dateFrom" to="dateTo" label="입고예정일" />
            </SearchBar>

            {/* 상하 분할 — 위 입고건 체크 목록 / 아래 라인 검토 + 확정 버튼 */}
            <PanelGroup direction="vertical" autoSaveId="wms-ib-confirm-split-v1" className="flex-1 min-h-0">
                <Panel defaultSize={50} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">
                            {num(rowData.length)}건
                            {selectedAsns.length > 0 && (
                                <span className="text-indigo-600"> · {num(selectedAsns.length)}건 선택 (확정 가능 {num(confirmables.length)}건)</span>
                            )}
                        </span>
                        <span className="text-[11px] text-slate-400">
                            여러 건을 체크해 한 번에 확정할 수 있습니다 — 진행단계 「적치완료」만 확정됩니다
                        </span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={gridRef}
                            rowData={rowData}
                            columnDefs={HEADER_COLUMN_DEFS}
                            rowHeight={34}
                            headerHeight={38}
                            getRowId={(p) => p.data.ibNo}
                            rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: true }}
                            onSelectionChanged={onSelectionChanged}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={50} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-bold text-slate-700">라인 검토</span>
                            <span className="text-xs text-slate-400 truncate">
                                {previewAsn
                                    ? `${previewAsn.ibNo} · ${previewAsn.vndrNm} — 마지막으로 체크한 건의 라인입니다`
                                    : '입고건을 체크하면 라인이 표시됩니다'}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                            {blockReason && (
                                <span className="text-[11px] text-slate-400">{blockReason}</span>
                            )}
                            <button
                                onClick={() => setConfirmTargets(confirmables)}
                                disabled={confirmables.length === 0}
                                className={confirmables.length > 0
                                    ? 'btn-primary'
                                    : 'flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed'}>
                                <CheckCircle2 size={13} /> 입고확정{confirmables.length > 1 ? ` (${num(confirmables.length)}건)` : ''}
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact rowData={lineRows} columnDefs={LINE_COLUMN_DEFS} rowHeight={34} />
                    </div>
                </Panel>
            </PanelGroup>

            {/* 확정 확인 모달 — 일괄이어도 건별 결품을 전부 나열해 숫자를 보고 누르게 한다 */}
            {confirmTargets && (
                <ConfirmModal
                    title={`입고 ${num(confirmTargets.length)}건을 확정하시겠습니까?`}
                    confirmText="입고확정"
                    danger={confirmTargets.some(a => shortageOf(a) > 0)}
                    onCancel={() => setConfirmTargets(null)}
                    onConfirm={() => { doConfirm(confirmTargets); setConfirmTargets(null); }}
                >
                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                        {confirmTargets.map(a => (
                            <div key={a.ibOrderId} className="flex items-center justify-between gap-3 text-sm">
                                <span className="truncate">{a.ibNo} · {a.vndrNm}</span>
                                {shortageOf(a) > 0
                                    ? <b className="text-rose-600 shrink-0">결품 {num(shortageOf(a))} EA</b>
                                    : <span className="text-emerald-600 shrink-0">전량 입고</span>}
                            </div>
                        ))}
                    </div>
                    {skippedCount > 0 && (
                        <p className="text-xs text-amber-600 mt-2">
                            체크한 건 중 {num(skippedCount)}건은 적치완료 전이라 이번 확정에서 빠집니다.
                        </p>
                    )}
                    <p className="text-xs text-slate-400 mt-2">확정 후에는 검수·검수취소·적치지시를 할 수 없습니다.</p>
                </ConfirmModal>
            )}

            {/* 벤더 선택 팝업 — 자유 입력 대신 팝업에서 고른다 (검수·ASN 관리와 같은 방식, vndrNm contains 검색) */}
            <VendorPickerModal
                open={vendorPickerOpen}
                onClose={() => setVendorPickerOpen(false)}
                onSelect={(v) => setCond(prev => ({ ...prev, vndrNm: v.vndrNm }))}
            />
        </div>
    );
}
