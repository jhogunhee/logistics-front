import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Send, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

import { atoOdrApi } from '@/api/atoOdrApi';
import { num } from '@/utils/format';
import SearchBar, { SearchText, SearchProd } from '@/components/common/SearchBar';
import ConfirmModal from '@/components/common/ConfirmModal';

/** 수량 컬럼 한 벌 — 오른쪽 정렬 + 천단위 콤마. 컬럼 정의가 useMemo 안이라 모듈 스코프에 둔다 */
const qtyCol = (field, headerName, width, tooltip) => ({
    field, headerName, width,
    headerTooltip: tooltip,
    cellClass: 'ag-right-aligned-cell',
    valueFormatter: (p) => (p.value == null ? '' : num(p.value)),
});

// 자동발주 — 순재고(가용 + 미입고 예정 + 미확정 발주)가 발주점 아래인 상품을 거래처별로 묶어
// 입고주문(작성)으로 낸다. 확정(→ 입고예정)은 「입고주문 관리」에서 사람이 누른다.
// 스케줄러가 매일 새벽 같은 경로로 돌고, 이 화면은 임의 시점 재계산·수량 보정용이다.

export default function AtoOdrPlan() {
    const [cond, setCond] = useState({ prodCd: '', prodNm: '', vndrCd: '' });
    const [proposals, setProposals] = useState(null); // null = 아직 조회 전
    const [selectedVendorId, setSelectedVendorId] = useState(null);
    const [confirmIssue, setConfirmIssue] = useState(null);
    const [busy, setBusy] = useState(false);
    const vendorGridRef = useRef(null);
    const lineGridRef = useRef(null);

    const selected = proposals?.find(p => p.vendorId === selectedVendorId) ?? null;
    const totalLines = (proposals ?? []).reduce((s, p) => s + p.lines.length, 0);

    useEffect(() => {
        fetchPlan();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchPlan = async () => {
        try {
            const data = await atoOdrApi.plan(cond);
            // 수량을 화면에서 고칠 수 있게 라인을 복사해 든다 — 서버 응답은 그대로 두고 _odrQty만 편집한다
            setProposals(data.map(p => ({ ...p, lines: p.lines.map(l => ({ ...l, _odrQty: l.odrQty })) })));
            setSelectedVendorId(null);
        } catch (e) {
            toast.error(e.message || '자동발주 산정에 실패했습니다.');
        }
    };

    // ── 상단: 거래처별 제안 ──
    // useMemo로 감싼다 — 매 렌더마다 새 배열을 주면 ag-grid가 그때마다 컬럼을 다시 적용한다.
    // 정기 보충 화면(StockSpmt)과 같은 형태
    const vendorColumnDefs = useMemo(() => [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        { field: 'vndrCd', headerName: '거래처', width: 120 },
        { field: 'vndrNm', headerName: '거래처명', width: 180, flex: 1 },
        {
            headerName: '상품 수', width: 100, cellClass: 'ag-right-aligned-cell',
            valueGetter: (p) => p.data.lines.length,
            valueFormatter: (p) => num(p.value),
        },
        {
            headerName: '발주 수량', width: 120, cellClass: 'ag-right-aligned-cell font-bold',
            headerTooltip: '발주단위 합계 — 상품마다 단위가 달라 참고용 합이다',
            valueGetter: (p) => p.data.lines.reduce((s, l) => s + (Number(l._odrQty) || 0), 0),
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'expctDe', headerName: '입고 예정일', width: 130,
            headerTooltip: '오늘 + 이 거래처 라인 중 가장 긴 리드타임',
        },
    ], []);

    const onVendorSelectionChanged = () => {
        const row = vendorGridRef.current?.api.getSelectedNodes()?.[0];
        setSelectedVendorId(row?.data?.vendorId ?? null);
    };

    // ── 하단: 선택 거래처의 상품 라인 ──
    const lineColumnDefs = useMemo(() => [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        { field: 'prodCd', headerName: '상품', width: 130 },
        // flex를 주지 않는다 — 컬럼이 많아 총 폭이 화면을 넘으면 flex 컬럼만 최소폭까지 수축해
        // 상품명이 「왕..」으로 뭉개진다. 넘치는 폭은 가로 스크롤이 받는다
        { field: 'prodNm', headerName: '상품명', width: 180 },
        qtyCol('avalQty', '가용', 90, '창고의 가용 재고 (보유 − 예약 − 보류). 반품존은 뺀다'),
        qtyCol('openAsnQty', '입고예정', 100, '아직 입고확정되지 않은 입고예정의 잔량 (예정 − 검수 − 불량)'),
        qtyCol('openOdrEaQty', '미확정 발주', 110, '작성 상태로 남아 있는 발주의 낱개 환산 — 이걸 세야 어제 낸 발주를 또 내지 않는다'),
        {
            ...qtyCol('netQty', '순재고', 100, '가용 + 입고예정 + 미확정 발주 — 이 값이 발주점 아래면 대상'),
            cellClass: 'ag-right-aligned-cell font-bold text-slate-700',
        },
        qtyCol('minQty', '발주점', 90),
        qtyCol('maxQty', '발주 상한', 100),
        qtyCol('shortEaQty', '부족(EA)', 100, '발주 상한 − 순재고'),
        { field: 'inbUomCd', headerName: '발주단위', width: 90, cellClass: 'text-slate-400' },
        qtyCol('minOdrQty', '최소주문', 90, '이보다 적게는 시키지 않는다 (발주단위)'),
        {
            field: '_odrQty', headerName: '발주 수량', width: 120, editable: true,
            headerClass: 'header-required',
            cellClass: 'ag-right-aligned-cell font-bold text-indigo-700',
            headerTooltip: '부족분을 발주단위로 올림한 뒤 최소주문수량을 적용한 값 — 고칠 수 있다 (0이면 제외)',
            valueFormatter: (p) => (p.value == null || p.value === '' ? '' : num(p.value)),
        },
    ], []);

    // ── 발행 ──
    const handleIssueClick = () => {
        if (!proposals || proposals.length === 0) {
            return;
        }
        lineGridRef.current?.api.stopEditing();
        const requests = proposals
            .map(p => ({
                vendorId: p.vendorId,
                vndrCd: p.vndrCd,
                vndrNm: p.vndrNm,
                expctDe: p.expctDe,
                items: p.lines
                    .filter(l => Number(l._odrQty) > 0)
                    .map(l => ({ prodId: l.prodId, prodCd: l.prodCd, prodNm: l.prodNm,
                                 inbUomCd: l.inbUomCd, odrQty: Number(l._odrQty) })),
            }))
            .filter(r => r.items.length > 0);

        if (requests.length === 0) {
            toast.error('발주할 수량이 없습니다.');
            return;
        }
        setConfirmIssue(requests);
    };

    const doIssue = async (requests) => {
        setBusy(true);
        try {
            // 화면 표시용으로 실어둔 코드·상품명은 빼고 서버 계약대로만 보낸다
            const result = await atoOdrApi.issue(requests.map(r => ({
                vendorId: r.vendorId,
                expctDe: r.expctDe,
                items: r.items.map(i => ({ prodId: i.prodId, odrQty: i.odrQty })),
            })));
            if (result.succeeded.length > 0) {
                toast.success(`입고주문 ${result.succeeded.length}건을 만들었습니다 — 확정은 「입고주문 관리」에서 합니다.`);
            }
            result.failed.forEach(f => {
                const vndr = requests.find(r => r.vendorId === f.id);
                toast.error(`${vndr?.vndrCd ?? f.id}: ${f.reason}`);
            });
            fetchPlan(); // 만든 발주가 미확정 발주로 잡혀 그만큼 대상에서 빠진다
        } catch (e) {
            toast.error(e.message || '발주 생성에 실패했습니다.');
        } finally {
            setBusy(false);
        }
    };

    return (
        // min-h — 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">자동발주 산정</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    순재고가 발주점 아래인 상품을 거래처별 입고주문(작성)으로 — 확정은 「입고주문 관리」에서
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchPlan}>
                <SearchProd name="prodCd" />
                <SearchText name="prodNm" label="상품명" placeholder="서울우유" />
                <SearchText name="vndrCd" label="거래처" placeholder="VD-0001" />
            </SearchBar>

            <PanelGroup direction="vertical" autoSaveId="wms-ato-odr-split-v1" className="flex-1 min-h-0">
                {/* 상단: 거래처별 제안 */}
                <Panel defaultSize={45} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-slate-700 shrink-0">발주 제안</span>
                        <span className="text-xs text-slate-400 truncate">
                            거래처 한 곳이 입고주문 한 건 — 행을 고르면 아래에서 상품·수량을 확인합니다
                        </span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">
                            {proposals == null ? '조회 전' : `${num(proposals.length)}곳 · 상품 ${num(totalLines)}건`}
                        </span>
                        <button
                            onClick={handleIssueClick}
                            disabled={busy || !proposals || proposals.length === 0}
                            className="flex items-center gap-1 px-4 py-2 bg-emerald-600 rounded-lg text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-40 shrink-0">
                            <Send size={13} /> 발주 생성
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={vendorGridRef}
                            rowData={proposals ?? []}
                            columnDefs={vendorColumnDefs}
                            getRowId={(p) => String(p.data.vendorId)}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                            onSelectionChanged={onVendorSelectionChanged}
                            overlayNoRowsTemplate={proposals == null
                                ? '<span class="text-sm text-slate-400">[조회]를 눌러 발주점 미달 상품을 확인하세요</span>'
                                : '<span class="text-sm text-slate-400">발주할 상품이 없습니다 — 모든 상품이 발주점 이상입니다</span>'}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                {/* 하단: 선택 거래처의 상품 라인 */}
                <Panel defaultSize={55} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-slate-700 shrink-0">발주 상품</span>
                        <span className="text-xs text-slate-400 truncate">
                            {selected
                                ? `${selected.vndrCd} ${selected.vndrNm} — 입고 예정일 ${selected.expctDe}. 발주 수량을 고칠 수 있습니다 (0이면 제외)`
                                : '위에서 거래처를 선택하세요'}
                        </span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={lineGridRef}
                            rowData={selected?.lines ?? []}
                            columnDefs={lineColumnDefs}
                            getRowId={(p) => String(p.data.prodVndrId)}
                            rowHeight={34}
                            headerHeight={38}
                            singleClickEdit={true}
                            stopEditingWhenCellsLoseFocus={true}
                            overlayNoRowsTemplate={'<span class="text-sm text-slate-400">위에서 거래처를 선택하세요</span>'}
                        />
                    </div>
                </Panel>
            </PanelGroup>

            {/* 발행 확인 모달 */}
            {confirmIssue && (
                <ConfirmModal
                    title="발주를 생성하시겠습니까?"
                    confirmText="생성"
                    onCancel={() => setConfirmIssue(null)}
                    onConfirm={() => { const r = confirmIssue; setConfirmIssue(null); doIssue(r); }}
                >
                    <p className="text-sm text-slate-500">
                        거래처 <b className="text-slate-700">{confirmIssue.length}곳</b> · 상품{' '}
                        <b className="text-slate-700">{confirmIssue.reduce((s, r) => s + r.items.length, 0)}건</b>
                    </p>
                    <div className="flex flex-col gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2 max-h-64 overflow-y-auto">
                        {confirmIssue.map(r => (
                            <div key={r.vendorId} className="flex flex-col gap-0.5">
                                <div className="font-bold text-slate-600">
                                    {r.vndrCd} {r.vndrNm}
                                    <span className="font-normal text-slate-400"> · 입고 예정 {r.expctDe}</span>
                                </div>
                                {r.items.map(i => (
                                    <div key={i.prodId} className="flex justify-between gap-3 pl-3 font-mono">
                                        <span className="text-slate-500">
                                            {i.prodCd}<span className="font-sans text-slate-400"> · {i.prodNm}</span>
                                        </span>
                                        <span className="tabular-nums text-slate-700">
                                            {num(i.odrQty)} {i.inbUomCd}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-slate-400">
                        만들어지는 것은 <b>작성 상태 입고주문</b>입니다 — 확정(→ 입고예정)은 「입고주문 관리」에서 누릅니다.
                        트랜잭션은 거래처 단위라 한 곳이 실패해도 나머지는 생성됩니다.
                    </p>
                </ConfirmModal>
            )}
        </div>
    );
}
