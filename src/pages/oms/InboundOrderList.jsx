import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { CheckCircle2, ClipboardList, Search, Trash2, Undo2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import VendorPickerModal from '@/components/common/VendorPickerModal';
import { omsIbOrderApi, OMS_IB_STATUS_META, OMS_IB_STATUS_OPTIONS } from '@/api/omsIbOrderApi';
import { ASN_STATUS_META } from '@/api/asnApi';
import { codeApi } from '@/api/codeApi';
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
    {
        // 주문번호를 눌러 수정 화면으로. 컬럼 정의가 모듈 상수라 navigate를 직접 못 잡아
        // 그리드 context로 콜백을 넘겨 받는다.
        field: 'omsIbNo', headerName: '주문번호', width: 170,
        cellRenderer: (p) => (
            <button
                onClick={() => p.context.openOrder(p.data)}
                title={p.data.status === 'CREATED'
                    ? '주문 수정'
                    : '조회 (작성 상태가 아니라 수정은 잠깁니다)'}
                className="font-medium text-indigo-600 hover:underline">
                {p.value}
            </button>
        ),
    },
    { field: 'expctDe', headerName: '입고 예정일', width: 120 },
    { field: 'vndrNm', headerName: '벤더', flex: 1, minWidth: 110 },
    {
        field: 'status', headerName: '주문상태', width: 100,
        cellStyle: centered,
        cellRenderer: (p) => <Badge meta={OMS_IB_STATUS_META[p.value]} />,
    },
    {
        // 표시명은 공통코드에서 받아 context로 넘긴다 (코드값만으론 화면에서 못 읽는다).
        // 긴급만 색으로 띄운다 — 정상이 대부분이라 전부 뱃지를 달면 오히려 안 보인다.
        field: 'odrDvsn', headerName: '발주구분', width: 100,
        cellStyle: centered,
        cellRenderer: (p) => {
            const nm = p.context.odrDvsnNm(p.value);
            if (!nm) return null;
            return p.value === 'NRML'
                ? <span className="text-[11px] text-slate-500">{nm}</span>
                : <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700">{nm}</span>;
        },
    },
    {
        field: 'picNm', headerName: '담당자', width: 90,
        cellRenderer: (p) => p.value || <span className="text-slate-300">-</span>,
    },
    { field: 'lineCount', headerName: '라인수', width: 80, cellClass: 'ag-right-aligned-cell' },
    {
        // 라인마다 발주단위가 다르면(BOX+PLT 등) 합계 숫자에 의미가 없다 — 등록 화면과 같은 규칙으로
        // 단위가 하나일 때만 수량을 보여주고, 섞이면 「혼재」로 눙치지 않고 밝힌다.
        field: 'totalOrderQty', headerName: '총 발주수량', width: 120, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '발주단위 기준 합계 — 라인 간 단위가 섞이면 합칠 수 없어 「혼재」로 표시합니다',
        cellRenderer: (p) => p.data.odrUomCd
            ? <>{p.value?.toLocaleString()} <span className="text-[11px] font-bold text-slate-400">{p.data.odrUomCd}</span></>
            : <span className="text-[11px] text-slate-400">단위 혼재</span>,
    },
    {
        field: 'totalCnvrQty', headerName: '총 환산수량', width: 130, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '재고 단위로 환산한 합계 — 확정 시 ASN에 반영되는 수량 기준',
        cellRenderer: (p) => p.data.cnvrUomCd
            ? <>{p.value?.toLocaleString()} <span className="text-[11px] font-bold text-slate-400">{p.data.cnvrUomCd}</span></>
            : <span className="text-[11px] text-slate-400">단위 혼재</span>,
    },
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
    {
        field: 'odrQty', headerName: '발주수량', width: 120, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '발주단위(벤더에게 주문한 단위) 기준',
        cellRenderer: (p) => (
            <>
                {p.value?.toLocaleString()}
                {' '}<span className="text-[11px] font-bold text-slate-400">{p.data.inbUomCd}</span>
            </>
        ),
    },
    {
        field: 'cnvrQty', headerName: '환산수량', width: 130, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '재고 단위로 환산한 수량 — 확정 시 ASN에 이 수량으로 반영됩니다',
        cellRenderer: (p) => (
            <>
                {p.value?.toLocaleString()}
                {' '}<span className="text-[11px] font-bold text-slate-400">{p.data.outbUomCd}</span>
            </>
        ),
    },
];

export default function InboundOrderList() {
    const [rowData, setRowData] = useState([]);
    const [lineRows, setLineRows] = useState([]);
    const [selected, setSelected] = useState(null);
    const [cond, setCond] = useState({ omsIbNo: '', vndrNm: '', status: '', dateFrom: todayStr(), dateTo: todayStr() });
    const [confirmTarget, setConfirmTarget] = useState(null);             // 확정 확인 모달 대상
    const [confirmCancelTarget, setConfirmCancelTarget] = useState(null); // 확정취소 확인 모달 대상
    const [deleteTarget, setDeleteTarget] = useState(null);   // 삭제 확인 모달 대상
    const gridRef = useRef(null);
    const navigate = useNavigate();
    const [odrDvsnNmByCd, setOdrDvsnNmByCd] = useState({});
    // 벤더 검색은 자유 입력 대신 등록 화면과 같은 팝업(VendorPickerModal)에서 고른다 —
    // 서버 검색 파라미터가 vndrNm(contains)이라 값은 id가 아니라 이름 그대로 보낸다.
    const [vendorPickerOpen, setVendorPickerOpen] = useState(false);

    useEffect(() => {
        let ignore = false;
        codeApi.list('ODR_DVSN').then(codes => {
            if (!ignore) setOdrDvsnNmByCd(Object.fromEntries(codes.map(c => [c.codeCd, c.codeNm])));
        });
        return () => { ignore = true; };
    }, []);

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

    // ── 주문확정 (ASN 생성) ──────────────────────────────────
    // 사용자가 하는 행위는 "발주를 확정한다"이고 ASN 생성은 그 결과다 — 그래서 버튼은
    // 「주문확정」이고, 무엇이 생기는지는 툴팁·모달이 설명한다. 내부 용어는 convert 그대로다.
    //
    // 화면 검증은 버튼을 눌러보기 전에 알려주는 용도일 뿐, 진짜 관문은 서버(엔티티)다.
    // 두 곳의 기준이 갈리지 않게 조건 문구를 서버 메시지와 맞춰둔다.
    const handleConfirmClick = () => {
        if (!selected) {
            toast('확정할 주문을 선택하세요.');
            return;
        }
        if (selected.status !== 'CREATED') {
            toast.error('작성 상태의 주문만 확정할 수 있습니다.');
            return;
        }
        setConfirmTarget(selected);
    };

    const doConfirm = async (order) => {
        try {
            await omsIbOrderApi.confirm(order.omsIbOrderId);
            toast.success(`${order.omsIbNo} 확정 — 입고예정(ASN)이 생성됐습니다.`);
            fetchList();
        } catch (e) {
            toast.error(e.message || '확정에 실패했습니다.');
        }
    };

    // ── 확정취소 (ASN 취소 + 주문 원복) ───────────────────────
    const handleConfirmCancelClick = () => {
        if (!selected) {
            toast('확정취소할 주문을 선택하세요.');
            return;
        }
        if (selected.status !== 'CONFIRMED') {
            toast.error('확정된 주문만 확정취소할 수 있습니다.');
            return;
        }
        if (selected.ibStatus && selected.ibStatus !== 'SCHEDULED') {
            toast.error('검수가 시작된 입고는 되돌릴 수 없습니다.');
            return;
        }
        setConfirmCancelTarget(selected);
    };

    const doConfirmCancel = async (order) => {
        try {
            await omsIbOrderApi.cancelConfirm(order.omsIbOrderId);
            toast.success(`${order.omsIbNo} 확정취소 — 작성 상태로 되돌렸습니다.`);
            fetchList();
        } catch (e) {
            toast.error(e.message || '확정취소에 실패했습니다.');
        }
    };

    // ── 주문삭제 ─────────────────────────────────────────────
    // 취소 상태를 두지 않으므로 "없앤다"는 조작은 이것 하나뿐이다.
    // 확정된 주문은 확정취소로 작성 상태에 되돌린 뒤에야 지울 수 있다.
    const handleDeleteClick = () => {
        if (!selected) {
            toast('삭제할 주문을 선택하세요.');
            return;
        }
        if (selected.status !== 'CREATED') {
            toast.error('작성 상태의 주문만 삭제할 수 있습니다. 확정된 주문은 확정취소가 먼저입니다.');
            return;
        }
        setDeleteTarget(selected);
    };

    const doDelete = async (order) => {
        try {
            await omsIbOrderApi.remove(order.omsIbOrderId);
            toast.success(`${order.omsIbNo} 를 삭제했습니다.`);
            fetchList();
        } catch (e) {
            toast.error(e.message || '삭제에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <ClipboardList size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">입고주문 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    조회 · 확정 · 삭제 — 확정하면 입고예정(ASN)이 생성되고 이후는 입고 메뉴에서 진행합니다
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
                <SearchItem label="주문상태">
                    <DropdownSelect
                        value={cond.status}
                        onChange={(v) => setCond(prev => ({ ...prev, status: v }))}
                        options={OMS_IB_STATUS_OPTIONS}
                        placeholder="전체"
                    />
                </SearchItem>
            </SearchBar>

            {/* 상하 분할 + 드래그 스플리터 (비율은 localStorage에 기억됨) */}
            <PanelGroup direction="vertical" autoSaveId="oms-ib-order-split-v1" className="flex-1 min-h-0">
                <Panel defaultSize={60} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">{rowData.length}건</span>
                        <div className="flex gap-2">
                            <button
                                onClick={handleDeleteClick}
                                title="작성 상태의 주문을 지웁니다. 확정된 주문은 확정취소가 먼저입니다"
                                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-red-300 hover:text-red-600 transition-colors">
                                <Trash2 size={13} /> 주문삭제
                            </button>
                            <button
                                onClick={handleConfirmCancelClick}
                                title="생성된 입고예정(ASN)을 취소하고 주문을 작성 상태로 되돌립니다"
                                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-amber-300 hover:text-amber-600 transition-colors">
                                <Undo2 size={13} /> 확정취소
                            </button>
                            <button
                                onClick={handleConfirmClick}
                                title="입고예정(ASN)을 생성해 창고 작업을 시작합니다"
                                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700 transition-colors">
                                <CheckCircle2 size={13} /> 주문확정
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={gridRef}
                            rowData={rowData}
                            columnDefs={HEADER_COLUMN_DEFS}
                            context={{
                                openOrder: (o) => navigate(`/oms/inbound-order/${o.omsIbOrderId}`),
                                odrDvsnNm: (cd) => odrDvsnNmByCd[cd],
                            }}
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

            {/* 확정 확인 모달 */}
            {confirmTarget && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[420px] flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">주문을 확정할까요?</h3>
                        <p className="text-sm text-slate-500">
                            {confirmTarget.omsIbNo} · {confirmTarget.vndrNm} · 라인 {confirmTarget.lineCount}건
                            {confirmTarget.cnvrUomCd &&
                                ` · 환산 ${confirmTarget.totalCnvrQty.toLocaleString()} ${confirmTarget.cnvrUomCd}`}
                        </p>
                        <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                            확정하면 입고예정(ASN)이 생성되어 창고 작업이 시작됩니다.
                            검수가 시작되기 전이라면 <b>확정취소</b>로 되돌려 다시 확정할 수 있습니다.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConfirmTarget(null)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                닫기
                            </button>
                            <button
                                onClick={() => { doConfirm(confirmTarget); setConfirmTarget(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                                주문확정
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 확정취소 확인 모달 */}
            {confirmCancelTarget && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[420px] flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">확정을 취소할까요?</h3>
                        <p className="text-sm text-slate-500">
                            {confirmCancelTarget.omsIbNo} · 입고번호 {confirmCancelTarget.ibNo}
                        </p>
                        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                            입고예정이 <b>삭제</b>되고 주문은 <b>작성</b> 상태로 돌아갑니다.
                            내용을 고쳐 다시 확정하면 새 입고번호로 입고예정이 다시 생성됩니다.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConfirmCancelTarget(null)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                닫기
                            </button>
                            <button
                                onClick={() => { doConfirmCancel(confirmCancelTarget); setConfirmCancelTarget(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700">
                                확정취소
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 삭제 확인 모달 — 되돌릴 수 없으므로 라인 건수까지 보여준다 */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">주문을 삭제하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {deleteTarget.omsIbNo} · {deleteTarget.vndrNm} · 라인 {deleteTarget.lineCount}건
                        </p>
                        <p className="text-xs text-slate-400">
                            취소 상태로 남기지 않고 지웁니다 — 되돌릴 수 없습니다.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                닫기
                            </button>
                            <button
                                onClick={() => { doDelete(deleteTarget); setDeleteTarget(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-red-600 text-white hover:bg-red-700">
                                주문삭제
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 벤더 선택 팝업 — 등록 화면과 같은 컴포넌트를 검색 조건에 재사용 */}
            <VendorPickerModal
                open={vendorPickerOpen}
                onClose={() => setVendorPickerOpen(false)}
                onSelect={(v) => setCond(prev => ({ ...prev, vndrNm: v.vndrNm }))}
            />
        </div>
    );
}