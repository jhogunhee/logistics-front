import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ArrowRightLeft, Ban, ClipboardList, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import { omsIbOrderApi, OMS_IB_STATUS_META, OMS_IB_STATUS_OPTIONS } from '@/api/omsIbOrderApi';
import { ASN_STATUS_META } from '@/api/asnApi';
import { TEMP_ZONE_META } from '@/api/prodApi';

// 오늘 날짜 "YYYY-MM-DD" (검색 기본값)
const todayStr = () => new Date().toISOString().slice(0, 10);

const Badge = ({ meta }) => {
    if (!meta) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${meta.badge}`}>
            {meta.label}
        </span>
    );
};

const TempZoneBadge = ({ value }) => {
    const meta = TEMP_ZONE_META[value];
    if (!meta) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${meta.badge}`}>
            {meta.label} {value}
        </span>
    );
};

const centered = { display: 'flex', alignItems: 'center', justifyContent: 'center' };

const HEADER_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'omsIbNo', headerName: '주문번호', width: 170 },
    {
        field: 'status', headerName: '주문상태', width: 100,
        cellStyle: centered,
        cellRenderer: (p) => <Badge meta={OMS_IB_STATUS_META[p.value]} />,
    },
    { field: 'vndrNm', headerName: '벤더', flex: 1, minWidth: 110 },
    { field: 'expctDe', headerName: '입고 예정일', width: 120 },
    { field: 'lineCount', headerName: '라인수', width: 80, cellClass: 'ag-right-aligned-cell' },
    { field: 'totalOrderQty', headerName: '발주수량', width: 100, cellClass: 'ag-right-aligned-cell' },
    {
        field: 'ibNo', headerName: '입고번호', width: 170,
        headerTooltip: '확정 시 자동 생성된 입고예정(ASN) 번호',
        cellRenderer: (p) => p.value ?? <span className="text-slate-300">미생성</span>,
    },
    {
        field: 'ibStatus', headerName: '창고 진행', width: 110,
        headerTooltip: 'ASN의 입고 진행 상태',
        cellStyle: centered,
        cellRenderer: (p) => <Badge meta={ASN_STATUS_META[p.value]} />,
    },
];

const LINE_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'prodCd', headerName: '상품 코드', width: 140 },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 200 },
    {
        field: 'tmpZon', headerName: '온도대', width: 120,
        cellStyle: centered,
        cellRenderer: (p) => <TempZoneBadge value={p.value} />,
    },
    { field: 'odrQty', headerName: '발주수량', width: 110, cellClass: 'ag-right-aligned-cell' },
];

export default function InboundOrderList() {
    const [rowData, setRowData] = useState([]);
    const [lineRows, setLineRows] = useState([]);
    const [selected, setSelected] = useState(null);
    const [cond, setCond] = useState({ omsIbNo: '', vndrNm: '', status: '', dateFrom: todayStr(), dateTo: todayStr() });
    const [convertTarget, setConvertTarget] = useState(null);             // 변환 확인 모달 대상
    const [convertCancelTarget, setConvertCancelTarget] = useState(null); // 변환취소 확인 모달 대상
    const [cancelTarget, setCancelTarget] = useState(null);   // 취소 확인 모달 대상
    const gridRef = useRef(null);

    const fetchList = async () => {
        const data = await omsIbOrderApi.list(cond);
        setRowData(data);
        setSelected(null);
        setLineRows([]);
    };

    // 최초 1회 조회 (검색조건 기본값 = 오늘)
    useEffect(() => {
        let ignore = false;
        omsIbOrderApi.list(cond).then(data => { if (!ignore) setRowData(data); });
        return () => { ignore = true; };
    }, []);

    // 헤더 행 선택 시 라인 조회
    const onSelectionChanged = async (e) => {
        const node = e.api.getSelectedNodes()[0];
        if (!node) {
            setSelected(null);
            setLineRows([]);
            return;
        }
        setSelected(node.data);
        setLineRows(await omsIbOrderApi.lines(node.data.omsIbOrderId));
    };

    // ── 변환 (ASN 생성) ──────────────────────────────────────
    // 화면 검증은 버튼을 눌러보기 전에 알려주는 용도일 뿐, 진짜 관문은 서버(엔티티)다.
    // 두 곳의 기준이 갈리지 않게 조건 문구를 서버 메시지와 맞춰둔다.
    const handleConvertClick = () => {
        if (!selected) {
            toast('변환할 주문을 선택하세요.');
            return;
        }
        if (selected.status !== 'CREATED') {
            toast.error('작성 상태의 주문만 변환할 수 있습니다.');
            return;
        }
        setConvertTarget(selected);
    };

    const doConvert = async (order) => {
        try {
            await omsIbOrderApi.convert(order.omsIbOrderId);
            toast.success(`${order.omsIbNo} 변환 완료 — 입고예정(ASN)이 생성됐습니다.`);
            fetchList();
        } catch (e) {
            toast.error(e.message || '변환에 실패했습니다.');
        }
    };

    // ── 변환취소 (ASN 취소 + 주문 원복) ───────────────────────
    const handleConvertCancelClick = () => {
        if (!selected) {
            toast('변환취소할 주문을 선택하세요.');
            return;
        }
        if (selected.status !== 'CONVERTED') {
            toast.error('변환된 주문만 변환취소할 수 있습니다.');
            return;
        }
        if (selected.ibStatus && selected.ibStatus !== 'SCHEDULED') {
            toast.error('검수가 시작된 입고는 되돌릴 수 없습니다.');
            return;
        }
        setConvertCancelTarget(selected);
    };

    const doConvertCancel = async (order) => {
        try {
            await omsIbOrderApi.cancelConvert(order.omsIbOrderId);
            toast.success(`${order.omsIbNo} 변환취소 — 작성 상태로 되돌렸습니다.`);
            fetchList();
        } catch (e) {
            toast.error(e.message || '변환취소에 실패했습니다.');
        }
    };

    // ── 주문취소 ─────────────────────────────────────────────
    const handleCancelClick = () => {
        if (!selected) {
            toast('취소할 주문을 선택하세요.');
            return;
        }
        if (selected.status !== 'CREATED') {
            toast.error('작성 상태의 주문만 취소할 수 있습니다. 변환된 주문은 변환취소가 먼저입니다.');
            return;
        }
        setCancelTarget(selected);
    };

    const doCancel = async (order) => {
        try {
            await omsIbOrderApi.cancel(order.omsIbOrderId);
            toast.success(`${order.omsIbNo} 를 취소했습니다.`);
            fetchList();
        } catch (e) {
            toast.error(e.message || '취소에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <ClipboardList size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">입고주문 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    조회 · 확정 · 취소 — 확정하면 입고예정(ASN)이 생성되고 이후는 입고 메뉴에서 진행합니다
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" onSearch={fetchList}>
                <SearchItem label="주문번호">
                    <input
                        type="text"
                        value={cond.omsIbNo}
                        onChange={(e) => setCond(prev => ({ ...prev, omsIbNo: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="PO-20260723-001"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="벤더">
                    <input
                        type="text"
                        value={cond.vndrNm}
                        onChange={(e) => setCond(prev => ({ ...prev, vndrNm: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="서울식품"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="주문상태">
                    <DropdownSelect
                        value={cond.status}
                        onChange={(v) => setCond(prev => ({ ...prev, status: v }))}
                        options={OMS_IB_STATUS_OPTIONS}
                        placeholder="전체"
                    />
                </SearchItem>
                <SearchItem label="입고예정일" wide>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={cond.dateFrom}
                            onChange={(e) => setCond(prev => ({ ...prev, dateFrom: e.target.value }))}
                            className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                        />
                        <span className="text-slate-400 shrink-0">~</span>
                        <input
                            type="date"
                            value={cond.dateTo}
                            onChange={(e) => setCond(prev => ({ ...prev, dateTo: e.target.value }))}
                            className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                        />
                    </div>
                </SearchItem>
            </SearchBar>

            {/* 상하 분할 + 드래그 스플리터 (비율은 localStorage에 기억됨) */}
            <PanelGroup direction="vertical" autoSaveId="oms-ib-order-split-v1" className="flex-1 min-h-0">
                <Panel defaultSize={60} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">{rowData.length}건</span>
                        <div className="flex gap-2">
                            <button
                                onClick={handleCancelClick}
                                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-red-300 hover:text-red-600 transition-colors">
                                <Ban size={13} /> 주문취소
                            </button>
                            <button
                                onClick={handleConvertCancelClick}
                                title="생성된 입고예정(ASN)을 취소하고 주문을 작성 상태로 되돌립니다"
                                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-amber-300 hover:text-amber-600 transition-colors">
                                <Undo2 size={13} /> 변환취소
                            </button>
                            <button
                                onClick={handleConvertClick}
                                title="입고예정(ASN)을 생성해 창고 작업을 시작합니다"
                                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700 transition-colors">
                                <ArrowRightLeft size={13} /> ASN 변환
                            </button>
                        </div>
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
                        <span className="text-sm font-bold text-slate-700">발주 라인</span>
                        <span className="text-xs text-slate-400">
                            {selected ? `${selected.omsIbNo} · ${selected.vndrNm}` : '위에서 주문을 선택하세요'}
                        </span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact rowData={lineRows} columnDefs={LINE_COLUMN_DEFS} rowHeight={34} />
                    </div>
                </Panel>
            </PanelGroup>

            {/* 변환 확인 모달 */}
            {convertTarget && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[420px] flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">입고예정(ASN)으로 변환할까요?</h3>
                        <p className="text-sm text-slate-500">
                            {convertTarget.omsIbNo} · {convertTarget.vndrNm} · 라인 {convertTarget.lineCount}건 ·
                            {' '}{convertTarget.totalOrderQty.toLocaleString()}개
                        </p>
                        <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                            변환하면 입고예정이 생성되어 창고 작업이 시작됩니다.
                            검수가 시작되기 전이라면 <b>변환취소</b>로 되돌려 다시 변환할 수 있습니다.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConvertTarget(null)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                닫기
                            </button>
                            <button
                                onClick={() => { doConvert(convertTarget); setConvertTarget(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                                변환
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 변환취소 확인 모달 */}
            {convertCancelTarget && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[420px] flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">변환을 취소할까요?</h3>
                        <p className="text-sm text-slate-500">
                            {convertCancelTarget.omsIbNo} · 입고번호 {convertCancelTarget.ibNo}
                        </p>
                        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                            입고예정이 취소되고 주문은 <b>작성</b> 상태로 돌아갑니다.
                            내용을 고쳐 다시 변환할 수 있습니다. 취소된 입고예정은 이력으로 남습니다.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConvertCancelTarget(null)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                닫기
                            </button>
                            <button
                                onClick={() => { doConvertCancel(convertCancelTarget); setConvertCancelTarget(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700">
                                변환취소
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 취소 확인 모달 */}
            {cancelTarget && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">주문을 취소하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {cancelTarget.omsIbNo} · {cancelTarget.vndrNm} · 라인 {cancelTarget.lineCount}건
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setCancelTarget(null)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                닫기
                            </button>
                            <button
                                onClick={() => { doCancel(cancelTarget); setCancelTarget(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-red-600 text-white hover:bg-red-700">
                                주문취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}