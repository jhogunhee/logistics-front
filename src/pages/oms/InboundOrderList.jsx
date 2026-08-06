import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { CheckCircle2, ClipboardList, Search, Trash2, Undo2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import VendorPickerModal from '@/components/common/VendorPickerModal';
import { omsIbOrderApi } from '@/api/omsIbOrderApi';
import { codeApi } from '@/api/codeApi';
import { ASN_STATUS_META, OMS_IB_STATUS_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { OMS_IB_STATUS_OPTIONS } from '@/constants/codeOptions';
import { Badge } from '@/components/common/Badge';
import { daysAheadStr, todayStr } from '@/utils/format';

// 오늘 날짜 "YYYY-MM-DD" (검색 기본값)


const centered = { display: 'flex', alignItems: 'center', justifyContent: 'center' };

const HEADER_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    {
        // 주문번호를 눌러 수정 화면으로. 컬럼 정의가 모듈 상수라 navigate를 직접 못 잡아
        // 그리드 context로 콜백을 넘겨 받는다.
        field: 'omsIbNo', headerName: '주문번호', width: 150,
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
        field: 'status', headerName: '주문상태', width: 90,
        cellStyle: centered,
        cellRenderer: (p) => <Badge meta={OMS_IB_STATUS_META} value={p.value} show="label" />,
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
        field: 'totalOrderQty', headerName: '총 발주수량', width: 120, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '라인 발주수량(발주단위 기준)의 합',
        valueFormatter: (p) => p.value?.toLocaleString(),
    },
    {
        field: 'totalCnvrQty', headerName: '총 환산수량', width: 130, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '발주 수량을 낱개(EA)로 환산한 합계',
        valueFormatter: (p) => p.value?.toLocaleString(),
    },
    {
        field: 'ibNo', headerName: '입고번호', width: 140,
        headerTooltip: '확정 시 자동 생성된 입고예정(ASN) 번호',
        cellRenderer: (p) => p.value ?? <span className="text-slate-300">미생성</span>,
    },
    {
        field: 'ibStatus', headerName: '창고 진행', width: 95,
        headerTooltip: 'ASN의 입고 진행 상태',
        cellStyle: centered,
        cellRenderer: (p) => <Badge meta={ASN_STATUS_META} value={p.value} show="label" />,
    },
];

const LINE_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'prodCd', headerName: '상품 코드', width: 140 },
    { field: 'prodNm', headerName: '상품명', minWidth: 300 },
    {
        field: 'tmpZon', headerName: '온도대', width: 120,
        cellStyle: centered,
        cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
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
        field: 'inbEaQty', headerName: '입수량', width: 90, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '발주단위 1개당 입수량(낱개 기준) — 단위 관리의 낱개수량과 같은 값',
        valueFormatter: (p) => p.value?.toLocaleString(),
    },
    {
        field: 'cnvrQty', headerName: '환산수량', width: 130, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '발주 수량을 낱개(EA)로 환산한 수량',
        cellRenderer: (p) => (
            <>
                {p.value?.toLocaleString()}
                {' '}<span className="text-[11px] font-bold text-slate-400">EA</span>
            </>
        ),
    },
];

export default function InboundOrderList() {
    const [rowData, setRowData] = useState([]);
    const [lineRows, setLineRows] = useState([]);
    const [selected, setSelected] = useState(null);
    const [cond, setCond] = useState({ omsIbNo: '', vndrNm: '', status: '', dateFrom: todayStr(), dateTo: daysAheadStr(7) });
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
        codeApi.list('ODR_DVSN').then(codes => {
            setOdrDvsnNmByCd(Object.fromEntries(codes.map(c => [c.codeCd, c.codeNm])));
        });
    }, []);

    const fetchList = async () => {
        const data = await omsIbOrderApi.list(cond);
        setRowData(data);
        setSelected(null);
        setLineRows([]);
    };

    // 최초 1회 조회 (검색조건 기본값 = 오늘)
    useEffect(() => {
        omsIbOrderApi.list(cond).then(setRowData);
    }, []);

    // 행 클릭 시 라인 조회 — 체크박스(일괄 처리 대상)와 역할을 분리한다.
    // 클릭은 "들여다본다", 체크는 "처리한다".
    const onRowClicked = async (e) => {
        setSelected(e.data);
        setLineRows(await omsIbOrderApi.lines(e.data.omsIbOrderId));
    };

    // 버튼들이 처리할 대상 = 체크된 행들
    const checkedRows = () => gridRef.current?.api?.getSelectedRows() ?? [];

    // 일괄 실행 — 한 건 실패가 나머지를 막지 않도록 순차 처리 후 결과를 요약한다.
    // 화면 검증을 통과해도 서버(엔티티)가 거부할 수 있으므로 실패는 건별로 모은다.
    const runBatch = async (orders, call, verb) => {
        let ok = 0;
        const fails = [];
        for (const o of orders) {
            try {
                await call(o);
                ok += 1;
            } catch (e) {
                fails.push(`${o.omsIbNo}: ${e.message || '실패'}`);
            }
        }
        if (ok > 0) toast.success(`${ok}건 ${verb} 완료`);
        if (fails.length > 0) {
            toast.error(`${fails.length}건 실패 — ${fails[0]}${fails.length > 1 ? ` 외 ${fails.length - 1}건` : ''}`);
        }
        fetchList();
    };

    // 모달 요약용 — "PO-... 외 2건"
    const summarize = (orders) => orders.length === 1
        ? orders[0].omsIbNo
        : `${orders[0].omsIbNo} 외 ${orders.length - 1}건`;

    // ── 주문확정 (ASN 생성) ──────────────────────────────────
    // 사용자가 하는 행위는 "발주를 확정한다"이고 ASN 생성은 그 결과다 — 그래서 버튼은
    // 「주문확정」이고, 무엇이 생기는지는 툴팁·모달이 설명한다. 내부 용어는 convert 그대로다.
    //
    // 화면 검증은 버튼을 눌러보기 전에 알려주는 용도일 뿐, 진짜 관문은 서버(엔티티)다.
    // 두 곳의 기준이 갈리지 않게 조건 문구를 서버 메시지와 맞춰둔다.
    // 체크된 것 중 조건에 맞는 행만 대상으로 담고, 빠지는 건수는 모달이 알려준다.
    const handleConfirmClick = () => {
        const checked = checkedRows();
        if (checked.length === 0) {
            toast('확정할 주문을 체크하세요.');
            return;
        }
        const targets = checked.filter(o => o.status === 'CREATED');
        if (targets.length === 0) {
            toast.error('작성 상태의 주문만 확정할 수 있습니다.');
            return;
        }
        setConfirmTarget({ targets, excluded: checked.length - targets.length });
    };

    const doConfirm = (orders) =>
        runBatch(orders, o => omsIbOrderApi.confirm(o.omsIbOrderId), '확정');

    // ── 확정취소 (ASN 삭제 + 주문 원복) ───────────────────────
    const handleConfirmCancelClick = () => {
        const checked = checkedRows();
        if (checked.length === 0) {
            toast('확정취소할 주문을 체크하세요.');
            return;
        }
        const targets = checked.filter(o =>
            o.status === 'CONFIRMED' && (!o.ibStatus || o.ibStatus === 'SCHEDULED'));
        if (targets.length === 0) {
            toast.error('확정 상태이면서 검수 전인 주문만 확정취소할 수 있습니다.');
            return;
        }
        setConfirmCancelTarget({ targets, excluded: checked.length - targets.length });
    };

    const doConfirmCancel = (orders) =>
        runBatch(orders, o => omsIbOrderApi.cancelConfirm(o.omsIbOrderId), '확정취소');

    // ── 주문삭제 ─────────────────────────────────────────────
    // 취소 상태를 두지 않으므로 "없앤다"는 조작은 이것 하나뿐이다.
    // 확정된 주문은 확정취소로 작성 상태에 되돌린 뒤에야 지울 수 있다.
    const handleDeleteClick = () => {
        const checked = checkedRows();
        if (checked.length === 0) {
            toast('삭제할 주문을 체크하세요.');
            return;
        }
        const targets = checked.filter(o => o.status === 'CREATED');
        if (targets.length === 0) {
            toast.error('작성 상태의 주문만 삭제할 수 있습니다. 확정된 주문은 확정취소가 먼저입니다.');
            return;
        }
        setDeleteTarget({ targets, excluded: checked.length - targets.length });
    };

    const doDelete = (orders) =>
        runBatch(orders, o => omsIbOrderApi.remove(o.omsIbOrderId), '삭제');

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
                        className="w-full input-base"
                    />
                </SearchItem>
                <SearchItem label="입고예정일" wide>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={cond.dateFrom}
                            onChange={(e) => setCond(prev => ({ ...prev, dateFrom: e.target.value }))}
                            className="flex-1 min-w-0 input-base"
                        />
                        <span className="text-slate-400 shrink-0">~</span>
                        <input
                            type="date"
                            value={cond.dateTo}
                            onChange={(e) => setCond(prev => ({ ...prev, dateTo: e.target.value }))}
                            className="flex-1 min-w-0 input-base"
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
                                title="체크한 주문을 일괄 삭제합니다 (작성 상태만). 확정된 주문은 확정취소가 먼저입니다"
                                className="btn-danger">
                                <Trash2 size={13} /> 주문삭제
                            </button>
                            <button
                                onClick={handleConfirmCancelClick}
                                title="체크한 주문의 입고예정(ASN)을 삭제하고 작성 상태로 일괄 원복합니다"
                                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-amber-300 hover:text-amber-600 transition-colors">
                                <Undo2 size={13} /> 확정취소
                            </button>
                            <button
                                onClick={handleConfirmClick}
                                title="체크한 주문을 일괄 확정해 입고예정(ASN)을 생성합니다"
                                className="btn-primary">
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
                            rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false }}
                            onRowClicked={onRowClicked}
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
                            {selected ? `${selected.omsIbNo} · ${selected.vndrNm}` : '위에서 주문 행을 클릭하세요 (체크는 확정·삭제 대상 선택)'}
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
                        <h3 className="text-lg font-bold text-slate-800">
                            주문 {confirmTarget.targets.length}건을 확정할까요?
                        </h3>
                        <p className="text-sm text-slate-500">
                            {summarize(confirmTarget.targets)} ·
                            {' '}라인 {confirmTarget.targets.reduce((s, o) => s + o.lineCount, 0)}건 ·
                            {' '}환산 {confirmTarget.targets.reduce((s, o) => s + o.totalCnvrQty, 0).toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                            확정하면 입고예정(ASN)이 생성되어 창고 작업이 시작됩니다.
                            검수가 시작되기 전이라면 <b>확정취소</b>로 되돌려 다시 확정할 수 있습니다.
                        </p>
                        {confirmTarget.excluded > 0 && (
                            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                                작성 상태가 아닌 {confirmTarget.excluded}건은 제외됩니다.
                            </p>
                        )}
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConfirmTarget(null)}
                                className="btn-modal-cancel">
                                닫기
                            </button>
                            <button
                                onClick={() => { doConfirm(confirmTarget.targets); setConfirmTarget(null); }}
                                className="btn-modal-primary">
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
                        <h3 className="text-lg font-bold text-slate-800">
                            {confirmCancelTarget.targets.length}건의 확정을 취소할까요?
                        </h3>
                        <p className="text-sm text-slate-500">
                            {summarize(confirmCancelTarget.targets)}
                            {confirmCancelTarget.targets.length === 1 &&
                                ` · 입고번호 ${confirmCancelTarget.targets[0].ibNo}`}
                        </p>
                        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                            입고예정이 <b>삭제</b>되고 주문은 <b>작성</b> 상태로 돌아갑니다.
                            내용을 고쳐 다시 확정하면 새 입고번호로 입고예정이 다시 생성됩니다.
                        </p>
                        {confirmCancelTarget.excluded > 0 && (
                            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                                확정(검수 전) 상태가 아닌 {confirmCancelTarget.excluded}건은 제외됩니다.
                            </p>
                        )}
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConfirmCancelTarget(null)}
                                className="btn-modal-cancel">
                                닫기
                            </button>
                            <button
                                onClick={() => { doConfirmCancel(confirmCancelTarget.targets); setConfirmCancelTarget(null); }}
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
                        <h3 className="text-lg font-bold text-slate-800">
                            주문 {deleteTarget.targets.length}건을 삭제하시겠습니까?
                        </h3>
                        <p className="text-sm text-slate-500">
                            {summarize(deleteTarget.targets)} ·
                            {' '}라인 {deleteTarget.targets.reduce((s, o) => s + o.lineCount, 0)}건
                        </p>
                        <p className="text-xs text-slate-400">
                            취소 상태로 남기지 않고 지웁니다 — 되돌릴 수 없습니다.
                        </p>
                        {deleteTarget.excluded > 0 && (
                            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                                작성 상태가 아닌 {deleteTarget.excluded}건은 제외됩니다.
                            </p>
                        )}
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                className="btn-modal-cancel">
                                닫기
                            </button>
                            <button
                                onClick={() => { doDelete(deleteTarget.targets); setDeleteTarget(null); }}
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