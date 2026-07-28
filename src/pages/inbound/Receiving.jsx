import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ClipboardCheck, History, X } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import { asnApi, ASN_STATUS_META } from '@/api/asnApi';
import { TEMP_ZONE_META } from '@/api/prodApi';

// ISO 일시("2026-07-16T14:03:21...") → "2026-07-16 14:03"
const formatDateTime = (v) => (v ? v.replace('T', ' ').slice(0, 16) : '');

// 오늘 날짜 "YYYY-MM-DD" (입고일자/제조일자 기본값)
const todayStr = () => new Date().toISOString().slice(0, 10);

const StatusBadge = ({ value }) => {
    const meta = ASN_STATUS_META[value];
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

const HEADER_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'ibNo', headerName: '입고번호', width: 170 },
    {
        field: 'status', headerName: '입고진행상태', width: 130,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <StatusBadge value={p.value} />,
    },
    { field: 'vndrNm', headerName: '벤더', flex: 1, minWidth: 110 },
    { field: 'expctDt', headerName: '입고 예정일', width: 120 },
    {
        headerName: '검수 진행', width: 100, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '검수된 라인 / 전체 라인',
        valueGetter: (p) => `${p.data.rcvdLineCount} / ${p.data.lineCount}`,
    },
    { field: 'totalExpctQty', headerName: '예정수량', width: 100, cellClass: 'ag-right-aligned-cell' },
    { field: 'totalRcvdQty', headerName: '검수수량', width: 100, cellClass: 'ag-right-aligned-cell' },
    {
        field: 'createdAt', headerName: '등록시간', width: 150,
        valueFormatter: (p) => formatDateTime(p.value),
    },
];

export default function Receiving() {
    const [rowData, setRowData] = useState([]);
    const [lineRows, setLineRows] = useState([]);
    const [selectedAsn, setSelectedAsn] = useState(null);
    const [cond, setCond] = useState({ ibNo: '', dateFrom: todayStr(), dateTo: todayStr() });
    const [receiveConfirm, setReceiveConfirm] = useState(null); // 검수 저장 확인 모달 대상 라인들
    const [receiptsModal, setReceiptsModal] = useState(null); // { line, receipts } — 검수 이력 모달 대상
    const [cancelReceiptTarget, setCancelReceiptTarget] = useState(null); // 검수 취소 확인 대상 (receipt 1건)
    const gridRef = useRef(null);
    const lineGridRef = useRef(null);
    const pendingSelectRef = useRef(null); // 재조회 후 같은 헤더 행을 다시 선택하기 위한 id

    const canReceive = !!selectedAsn && ['SCHEDULED', 'RECEIVING'].includes(selectedAsn.status);

    // 검수 작업 화면이므로 검수/취소가 아직 의미 있는 것만 보여준다 (적치까지 끝난 COMPLETED는 제외)
    const fetchList = async (keepSelection = false) => {
        if (keepSelection) {
            pendingSelectRef.current = selectedAsn?.ibOrderId ?? null;
        } else {
            setSelectedAsn(null);
            setLineRows([]);
        }
        const data = await asnApi.list(cond);
        setRowData(data.filter(a => ['SCHEDULED', 'RECEIVING', 'RECEIVED'].includes(a.status)));
    };

    const onModelUpdated = (p) => {
        if (pendingSelectRef.current == null) return;
        const id = pendingSelectRef.current;
        pendingSelectRef.current = null;
        p.api.forEachNode(n => { if (n.data.ibOrderId === id) n.setSelected(true); });
    };

    // 최초 1회 조회 (검색조건 기본값 = 오늘)
    useEffect(() => {
        let ignore = false;
        asnApi.list(cond).then(data => {
            if (!ignore) setRowData(data.filter(a => ['SCHEDULED', 'RECEIVING', 'RECEIVED'].includes(a.status)));
        });
        return () => { ignore = true; };
    }, []);

    // 헤더 행 선택 시 라인 조회 + 검수 입력 컬럼 초기화
    const onSelectionChanged = async (e) => {
        const node = e.api.getSelectedNodes()[0];
        if (!node) {
            setSelectedAsn(null);
            setLineRows([]);
            return;
        }
        setSelectedAsn(node.data);
        const lines = await asnApi.lines(node.data.ibOrderId);
        // 입고일자는 전 라인, 제조일자는 유통기한 관리 상품만 입력
        // (둘 다 기본값 오늘 — 제조일자를 과거로 바꾸면 임박 Lot 시나리오 재현 가능)
        setLineRows(lines.map(l => ({
            ...l,
            _inspectQty: '',
            _receiptDt: todayStr(),
            _mfgDt: l.shelfLifeDays != null ? todayStr() : '',
        })));
    };

    // 라인 그리드: 작업 순서대로 [식별 → 잔량 → 입력 4개]를 앞에 두고, 참고용 누계는 뒤로 보낸다
    // (입력 컬럼이 가로 스크롤 없이 바로 보이게)
    const lineColumnDefs = [
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', minWidth: 300 },
        { field: 'expctQty', headerName: '예정', width: 70, cellClass: 'ag-right-aligned-cell' },
        {
            headerName: '잔량', width: 70,
            headerTooltip: '예정 - 검수누계. 아직 도착하지 않았거나 검수 전인 수량 (음수 = 과입고)',
            valueGetter: (p) => p.data.expctQty - p.data.rcvdQty,
            cellClass: (p) => p.value < 0 ? 'ag-right-aligned-cell text-red-500 font-bold' : 'ag-right-aligned-cell',
        },
        {
            field: '_inspectQty', headerName: '검수수량', width: 90, editable: canReceive,
            cellClass: 'ag-right-aligned-cell bg-indigo-50', headerTooltip: '이번에 개수 확인한 수량 (전량 재고로 입고)',
        },
        {
                field: '_mfgDt', headerName: '제조일자', width: 115,
                editable: (p) => canReceive && p.data.shelfLifeDays != null,
                cellClass: 'bg-indigo-50',
                headerTooltip: '유통기한 = 제조일자 + 유통기한(일). 유통기한 미관리 상품은 입력 없음',
                cellRenderer: (p) => p.data.shelfLifeDays == null
                    ? <span className="text-slate-400">미관리</span>
                    : p.value,
            },
        {
            field: '_receiptDt', headerName: '입고일자', width: 115, editable: canReceive,
            cellClass: 'bg-indigo-50',
            headerTooltip: '실제 입고된 날 (소급 등록 시 과거로 변경). Lot 번호 채번 기준',
        },
        { field: 'rcvdQty', headerName: '검수누계', width: 90, cellClass: 'ag-right-aligned-cell' },
        {
            headerName: '검수이력', width: 90,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => (
                <button
                    onClick={() => openReceiptsModal(p.data)}
                    disabled={p.data.rcvdQty <= 0}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 disabled:text-slate-300 disabled:cursor-not-allowed">
                    이력보기
                </button>
            ),
        },
        {
            field: 'shelfLifeDays', headerName: '유통기한(일)', width: 110, cellClass: 'ag-right-aligned-cell',
            headerTooltip: '서버가 제조일자 + 이 일수로 유통기한을 계산해 Lot에 기록',
            cellRenderer: (p) => p.value == null ? <span className="text-slate-400">미관리</span> : p.value,
        },
        {
            field: 'tempZone', headerName: '온도대', width: 100,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <TempZoneBadge value={p.value} />,
        },
    ];

    // ── 검수 저장 ────────────────────────────────────────────
    const handleReceiveClick = () => {
        if (!canReceive) {
            toast.error('검수할 입고예정을 선택하세요.');
            return;
        }
        lineGridRef.current.api.stopEditing();
        const rows = [];
        lineGridRef.current.api.forEachNode(n => rows.push(n.data));
        const targets = rows.filter(r => String(r._inspectQty ?? '').trim() !== '');
        if (targets.length === 0) {
            toast('검수수량을 입력한 라인이 없습니다.');
            return;
        }
        for (const r of targets) {
            const inspect = Number(r._inspectQty);
            if (!(inspect > 0)) {
                toast.error(`검수수량은 1 이상이어야 합니다: ${r.prodCd}`);
                return;
            }
            if (!String(r._receiptDt || '').trim()) {
                toast.error(`입고일자를 입력하세요: ${r.prodCd}`);
                return;
            }
            if (r.shelfLifeDays != null && !String(r._mfgDt || '').trim()) {
                toast.error(`제조일자를 입력하세요: ${r.prodCd}`);
                return;
            }
            if (r.shelfLifeDays != null && r._mfgDt > r._receiptDt) {
                toast.error(`제조일자가 입고일자보다 미래일 수 없습니다: ${r.prodCd}`);
                return;
            }
        }
        setReceiveConfirm(targets);
    };

    const doReceive = async (targets) => {
        try {
            await asnApi.receive(selectedAsn.ibOrderId, {
                lines: targets.map(r => ({
                    ibLineId: r.ibLineId,
                    inspectQty: Number(r._inspectQty),
                    receiptDt: r._receiptDt,
                    mfgDt: r.shelfLifeDays != null ? r._mfgDt : null,
                })),
            });
            toast.success(`${targets.length}개 라인 검수를 저장했습니다.`);
            fetchList(true);
        } catch (e) {
            toast.error(e.message || '검수 저장에 실패했습니다.');
        }
    };

    const receiveSummary = (targets) =>
        targets.reduce((s, r) => s + Number(r._inspectQty), 0);

    // ── 검수 이력 / 취소 ─────────────────────────────────────
    const openReceiptsModal = async (line) => {
        const receipts = await asnApi.receipts(selectedAsn.ibOrderId, line.ibLineId);
        setReceiptsModal({ line, receipts });
    };

    const doCancelReceipt = async (receipt) => {
        try {
            await asnApi.cancelReceipt(selectedAsn.ibOrderId, receipt.invHistId);
            toast.success('검수를 취소했습니다.');
            const receipts = await asnApi.receipts(selectedAsn.ibOrderId, receiptsModal.line.ibLineId);
            setReceiptsModal(prev => (prev ? { ...prev, receipts } : null));
            fetchList(true);
        } catch (e) {
            toast.error(e.message || '검수 취소에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <ClipboardCheck size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">입고 검수</h2>
                <span className="text-xs text-slate-400 mt-0.5">검수 대상(입고예정/검수중/마감)만 표시 · 합격분은 RCV-STAGE로 입고 · 적치 전까지는 검수 취소 가능</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" onSearch={() => fetchList()}>
                <SearchItem label="입고번호">
                    <input
                        type="text"
                        value={cond.ibNo}
                        onChange={(e) => setCond(prev => ({ ...prev, ibNo: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="IB-20260717-001"
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
            </SearchBar>

            {/* 상하 분할 + 드래그 스플리터 — 경계를 끌어 비율 조절 (비율은 localStorage에 기억됨) */}
            <PanelGroup direction="vertical" autoSaveId="wms-receiving-split-v3" className="flex-1 min-h-0">
                <Panel defaultSize={40} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center">
                        <span className="text-xs text-slate-500 font-medium">{rowData.length}건</span>
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
                            onModelUpdated={onModelUpdated}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={60} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-bold text-slate-700 shrink-0">검수 입력</span>
                            <span className="text-xs text-slate-400 truncate">
                                {selectedAsn
                                    ? `${selectedAsn.ibNo} · ${selectedAsn.vndrNm} — 파란 컬럼에 이번 검수분 입력`
                                    : '위에서 입고예정을 선택하세요'}
                            </span>
                        </div>
                        <button
                            onClick={handleReceiveClick}
                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700 transition-colors shrink-0">
                            <ClipboardCheck size={13} /> 검수 저장
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={lineGridRef}
                            rowData={lineRows}
                            columnDefs={lineColumnDefs}
                            rowHeight={34}
                            stopEditingWhenCellsLoseFocus={true}
                        />
                    </div>
                </Panel>
            </PanelGroup>

            {/* 검수 저장 확인 모달 */}
            {receiveConfirm && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">검수를 저장하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {receiveConfirm.length}개 라인 · 총 검수수량 <b className="text-emerald-600">{receiveSummary(receiveConfirm)}</b>
                        </p>
                        <p className="text-xs text-slate-400">검수수량은 RCV-STAGE 재고로 즉시 반영됩니다.</p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setReceiveConfirm(null)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                취소
                            </button>
                            <button
                                onClick={() => { doReceive(receiveConfirm); setReceiveConfirm(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                                저장
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 검수 이력 모달 */}
            {receiptsModal && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[520px] flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <History size={16} className="text-indigo-600" />
                                <h3 className="text-lg font-bold text-slate-800">검수 이력</h3>
                            </div>
                            <button onClick={() => setReceiptsModal(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <p className="text-xs text-slate-400">
                            {receiptsModal.line.prodCd} · {receiptsModal.line.prodNm}
                        </p>
                        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                            {receiptsModal.receipts.length === 0 && (
                                <p className="text-sm text-slate-400 text-center py-6">검수 이력이 없습니다.</p>
                            )}
                            {receiptsModal.receipts.map(r => (
                                <div key={r.invHistId} className={`flex items-center justify-between gap-3 px-3 py-2 border border-slate-200 rounded-lg ${r.cancelled ? 'opacity-50' : ''}`}>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-sm font-bold text-slate-700">{r.qty}개 · {r.lotNo}</span>
                                        <span className="text-[11px] text-slate-400">
                                            입고일자 {r.receiptDt}{r.mfgDt ? ` · 제조일자 ${r.mfgDt}` : ''} · {formatDateTime(r.createdAt)}
                                        </span>
                                    </div>
                                    {r.cancelled ? (
                                        <span className="text-[11px] font-bold text-slate-400 shrink-0">취소됨</span>
                                    ) : selectedAsn && ['RECEIVING', 'RECEIVED'].includes(selectedAsn.status) && (
                                        <button
                                            onClick={() => setCancelReceiptTarget(r)}
                                            className="text-[11px] font-bold text-rose-600 hover:text-rose-800 shrink-0">
                                            취소
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 검수 취소 확인 모달 */}
            {cancelReceiptTarget && (
                <div className="fixed inset-0 z-[60] flex items-start justify-center pt-16 bg-black/30">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">검수를 취소하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {cancelReceiptTarget.qty}개 · {cancelReceiptTarget.lotNo}
                        </p>
                        <p className="text-xs text-slate-400">이미 적치된 수량이 있으면 취소할 수 없습니다.</p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setCancelReceiptTarget(null)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                닫기
                            </button>
                            <button
                                onClick={() => { doCancelReceipt(cancelReceiptTarget); setCancelReceiptTarget(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700">
                                검수취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
