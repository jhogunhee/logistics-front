import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { CheckCircle2, FilePlus, Search, Trash2, Undo2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { omsOutbOrderApi } from '@/api/omsOutbOrderApi';
import { useCodes } from '@/hooks/useCodes';
import { OMS_OUTB_STATUS_META, OUTB_STATUS_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { OMS_OUTB_STATUS_OPTIONS } from '@/constants/codeOptions';
import { daysAheadStr, num, todayStr } from '@/utils/format';
import SearchBar, { SearchItem, SearchText, SearchSelect, SearchDateRange } from '@/components/common/SearchBar';
import StorePickerModal from '@/components/common/StorePickerModal';
import { Badge } from '@/components/common/Badge';

const centered = { display: 'flex', alignItems: 'center', justifyContent: 'center' };

const HEADER_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    {
        // 주문번호를 눌러 수정 화면으로.
        field: 'omsOutbNo', headerName: '주문번호', width: 150,
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
    { field: 'expctDe', headerName: '출고 예정일', width: 120 },
    { field: 'storeNm', headerName: '납품처', flex: 1, minWidth: 110 },
    {
        field: 'status', headerName: '주문상태', width: 90,
        cellStyle: centered,
        cellRenderer: (p) => <Badge meta={OMS_OUTB_STATUS_META} value={p.value} show="label" />,
    },
    {
        field: 'outbTyp', headerName: '출고유형', width: 100,
        cellStyle: centered,
        cellRenderer: (p) => {
            const nm = p.context.outbTypNm(p.value);
            if (!nm) return null;
            return p.value === 'NRML'
                ? <span className="text-[11px] text-slate-500">{nm}</span>
                : <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700">{nm}</span>;
        },
    },
    {
        field: 'vhclFltno', headerName: '편수', width: 90,
        headerTooltip: '차량 배차 차수. 비어 있으면 배차 미정',
        cellStyle: centered,
        cellRenderer: (p) => (p.value
            ? <span className="text-[11px] text-slate-600">{p.context.vhclFltnoNm(p.value) ?? p.value}</span>
            : <span className="text-[11px] text-slate-300">미정</span>),
    },
    {
        field: 'picNm', headerName: '담당자', width: 90,
        cellRenderer: (p) => p.value || <span className="text-slate-300">-</span>,
    },
    { field: 'lineCount', headerName: '라인수', width: 80, cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value) },
    {
        field: 'totalOrderQty', headerName: '총 주문수량', width: 120, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '라인 주문수량(출고단위)의 합',
        valueFormatter: (p) => num(p.value),
    },
    {
        field: 'outbNo', headerName: '출고번호', width: 140,
        headerTooltip: '확정 시 자동 생성된 창고 출고주문 번호',
        cellRenderer: (p) => p.value ?? <span className="text-slate-300">미생성</span>,
    },
    {
        field: 'outbStatus', headerName: '창고 진행', width: 95,
        headerTooltip: '창고 출고주문의 진행 상태',
        cellStyle: centered,
        cellRenderer: (p) => <Badge meta={OUTB_STATUS_META} value={p.value} show="label" />,
    },
    {
        field: 'wavNo', headerName: '웨이브', width: 130,
        headerTooltip: '편성된 웨이브. 편성된 주문은 확정취소할 수 없다 — 웨이브에서 먼저 빼야 한다',
        cellRenderer: (p) => p.value ?? <span className="text-slate-300">미편성</span>,
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
        field: 'odrQty', headerName: '주문수량', width: 120, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '출고단위 기준 — 확정 시 낱개(EA)로 환산돼 창고로 넘어간다',
        cellRenderer: (p) => (
            <>
                {num(p.value)}
                {' '}<span className="text-[11px] font-bold text-slate-400">{p.data.outbUomCd}</span>
            </>
        ),
    },
    {
        field: 'shelfLifeDays', headerName: '유통기한', width: 100, cellClass: 'ag-right-aligned-cell',
        cellRenderer: (p) => (p.value == null
            ? <span className="text-slate-300">미관리</span>
            : `${num(p.value)}일`),
    },
];

export default function OutboundOrderList() {
    const navigate = useNavigate();
    const outbTypCodes = useCodes('OUTB_TYP');
    const vhclFltnoCodes = useCodes('VHCL_FLTNO');
    const [cond, setCond] = useState({
        omsOutbNo: '', storeNm: '', status: '', outbTyp: '', vhclFltno: '',
        dateFrom: todayStr(), dateTo: daysAheadStr(7),
    });
    const [rowData, setRowData] = useState([]);
    const [lineRows, setLineRows] = useState([]);
    const [selected, setSelected] = useState(null);

    const [storePickerOpen, setStorePickerOpen] = useState(false);
    const [confirmTarget, setConfirmTarget] = useState(null);             // 확정 확인 모달 대상
    const [confirmCancelTarget, setConfirmCancelTarget] = useState(null); // 확정취소 확인 모달 대상
    const [deleteTarget, setDeleteTarget] = useState(null);               // 삭제 확인 모달 대상
    const [busy, setBusy] = useState(false); // 일괄 처리 중 — 버튼을 잠가 이중 실행을 막는다 (원격 DB라 수십 건이면 수십 초)
    const gridRef = useRef(null);

    const fetchList = async () => {
        const data = await omsOutbOrderApi.list(cond);
        setRowData(data);
        setSelected(null);
        setLineRows([]);
    };

    useEffect(() => {
        omsOutbOrderApi.list(cond).then(setRowData);
    }, []);

    // 행 클릭 시 라인 조회 — 체크박스(일괄 처리 대상)와 역할을 분리한다.
    const onRowClicked = async (e) => {
        setSelected(e.data);
        setLineRows(await omsOutbOrderApi.lines(e.data.omsOutbOrderId));
    };

    // 버튼들이 처리할 대상 = 체크된 행들
    const checkedRows = () => gridRef.current?.api?.getSelectedRows() ?? [];

    // 일괄 실행 — 체크된 주문의 id를 한 요청으로 보낸다. 건마다 왕복하면 100건에 100번 기다린다.
    // 서버가 건별 트랜잭션으로 처리해 성공/실패를 나눠 돌려주므로(BatchResult) 한 건 실패가 나머지를 막지 않는다.
    const runBatch = async (orders, call, verb) => {
        setBusy(true);
        let result;
        try {
            result = await call(orders.map(o => o.omsOutbOrderId));
        } catch (e) {
            toast.error(e.message || `${verb} 실패`); // 요청 자체가 실패 — 건별 결과 없음
            return;
        } finally {
            setBusy(false);
        }
        toastBatchResult(orders, result, verb);
        fetchList();
    };

    // 건별 결과 요약 — 성공은 건수만, 실패는 첫 건의 주문번호·사유 + "외 N건"
    const toastBatchResult = (orders, { succeeded, failed }, verb) => {
        if (succeeded.length > 0) toast.success(`${succeeded.length}건 ${verb} 완료`);
        if (failed.length === 0) return;

        const [first, ...others] = failed;
        const omsOutbNo = orders.find(o => o.omsOutbOrderId === first.id)?.omsOutbNo ?? first.id;
        const tail = others.length > 0 ? ` 외 ${others.length}건` : '';
        toast.error(`${failed.length}건 실패 — ${omsOutbNo}: ${first.reason}${tail}`);
    };

    // ── 주문확정 (창고 출고주문 생성) ─────────────────────────
    // 사용자가 하는 행위는 "수주를 확정한다"이고 창고 문서 생성은 그 결과다 — 그래서 버튼은
    // 「주문확정」이고, 무엇이 생기는지는 툴팁·모달이 설명한다 (입고주문과 같은 규칙).
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
        runBatch(orders, omsOutbOrderApi.confirm, '확정');

    // ── 확정취소 (창고 출고주문 삭제 + 주문 원복) ──────────────
    // 웨이브에 담긴 주문은 서버가 거부한다 — 화면도 같은 기준으로 미리 걸러 헛수고를 막는다.
    const handleConfirmCancelClick = () => {
        const checked = checkedRows();
        if (checked.length === 0) {
            toast('확정취소할 주문을 체크하세요.');
            return;
        }
        const targets = checked.filter(o =>
            o.status === 'CONFIRMED' && !o.wavNo && (!o.outbStatus || o.outbStatus === 'CREATED'));
        if (targets.length === 0) {
            toast.error('확정 상태이면서 웨이브 편성·할당 전인 주문만 확정취소할 수 있습니다.');
            return;
        }
        setConfirmCancelTarget({ targets, excluded: checked.length - targets.length });
    };

    const doConfirmCancel = (orders) =>
        runBatch(orders, omsOutbOrderApi.cancelConfirm, '확정취소');

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
        runBatch(orders, omsOutbOrderApi.remove, '삭제');

    // 모달 요약용 — "SO-... 외 2건"
    const summarize = (orders) => orders.length === 1
        ? orders[0].omsOutbNo
        : `${orders[0].omsOutbNo} 외 ${orders.length - 1}건`;

    return (
        // min-h — 노트북처럼 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <FilePlus size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">출고주문 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    조회 · 확정 · 삭제 — 확정하면 창고 출고주문이 생성되고 이후는 출고 메뉴(웨이브)에서 진행합니다
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="omsOutbNo" label="주문번호" placeholder="SO-20260803-001" />
                <SearchDateRange from="dateFrom" to="dateTo" label="출고예정일" />
                <SearchItem label="납품처">
                    <button
                        type="button"
                        onClick={() => setStorePickerOpen(true)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-left flex items-center justify-between gap-2 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400">
                        <span className={`truncate ${cond.storeNm ? 'text-slate-700' : 'text-slate-400'}`}>
                            {cond.storeNm || '전체'}
                        </span>
                        {cond.storeNm
                            ? <X
                                size={13}
                                title="납품처 조건 지우기"
                                className="shrink-0 text-slate-400 hover:text-slate-600"
                                onClick={(e) => { e.stopPropagation(); setCond(prev => ({ ...prev, storeNm: '' })); }}
                            />
                            : <Search size={13} className="shrink-0 text-slate-400" />}
                    </button>
                </SearchItem>
                <SearchSelect name="status" label="주문상태" options={OMS_OUTB_STATUS_OPTIONS} />
                <SearchSelect name="outbTyp" label="출고유형" options={outbTypCodes.searchOptions} />
                <SearchSelect name="vhclFltno" label="편수" options={vhclFltnoCodes.searchOptions} />
            </SearchBar>

            {/* 상하 분할 + 드래그 스플리터 (비율은 localStorage에 기억됨) */}
            <PanelGroup direction="vertical" autoSaveId="oms-outb-order-split-v1" className="flex-1 min-h-0">
                <Panel defaultSize={60} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">{num(rowData.length)}건</span>
                        <div className="flex gap-2">
                            <button
                                onClick={handleDeleteClick}
                                disabled={busy}
                                title="체크한 주문을 일괄 삭제합니다 (작성 상태만). 확정된 주문은 확정취소가 먼저입니다"
                                className="btn-danger">
                                <Trash2 size={13} /> 주문삭제
                            </button>
                            <button
                                onClick={handleConfirmCancelClick}
                                disabled={busy}
                                title="체크한 주문의 창고 출고주문을 삭제하고 작성 상태로 일괄 원복합니다 (웨이브 편성 전만)"
                                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-amber-300 hover:text-amber-600 transition-colors disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600">
                                <Undo2 size={13} /> 확정취소
                            </button>
                            <button
                                onClick={handleConfirmClick}
                                disabled={busy}
                                title="체크한 주문을 일괄 확정해 창고 출고주문을 생성합니다"
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
                                openOrder: (o) => navigate(`/oms/outbound-order/${o.omsOutbOrderId}`),
                                outbTypNm: (cd) => outbTypCodes.nmByCd[cd],
                                vhclFltnoNm: (cd) => vhclFltnoCodes.nmByCd[cd],
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
                        <span className="text-sm font-bold text-slate-700">주문 라인</span>
                        <span className="text-xs text-slate-400">
                            {selected ? `${selected.omsOutbNo} · ${selected.storeNm}` : '위에서 주문 행을 클릭하세요 (체크는 확정·삭제 대상 선택)'}
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
                            {' '}라인 {num(confirmTarget.targets.reduce((s, o) => s + o.lineCount, 0))}건 ·
                            {' '}수량 {num(confirmTarget.targets.reduce((s, o) => s + o.totalOrderQty, 0))}
                        </p>
                        <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                            확정하면 창고 출고주문이 생성되어 웨이브 편성 대상이 됩니다.
                            웨이브에 담기기 전이라면 <b>확정취소</b>로 되돌려 다시 확정할 수 있습니다.
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
                                ` · 출고번호 ${confirmCancelTarget.targets[0].outbNo}`}
                        </p>
                        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                            창고 출고주문이 <b>삭제</b>되고 주문은 <b>작성</b> 상태로 돌아갑니다.
                            내용을 고쳐 다시 확정하면 새 출고번호로 다시 생성됩니다.
                        </p>
                        {confirmCancelTarget.excluded > 0 && (
                            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                                웨이브 편성·할당 전의 확정 상태가 아닌 {confirmCancelTarget.excluded}건은 제외됩니다.
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

            {/* 납품처 선택 팝업 — 등록 화면과 같은 컴포넌트를 검색 조건에 재사용 */}
            <StorePickerModal
                open={storePickerOpen}
                onClose={() => setStorePickerOpen(false)}
                onSelect={(s) => setCond(prev => ({ ...prev, storeNm: s.storeNm }))}
            />
        </div>
    );
}
