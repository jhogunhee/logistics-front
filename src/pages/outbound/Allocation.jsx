import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Hand, PackageCheck, Rocket, Unlink } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import ConfirmModal from '@/components/common/ConfirmModal';
import AllocCandidateModal from '@/components/outbound/AllocCandidateModal';
import { outbAllocApi } from '@/api/outbAllocApi';
import { fmtDe, fmtDt, num } from '@/utils/format';

/** 잔량 강조 — 0이면 흐리게, 남아 있으면 눈에 걸리게. 이 값이 이 화면의 결품 표시다 */
const remainCell = (p) => (p.value > 0
    ? <span className="font-bold text-amber-600 tabular-nums">{num(p.value)}</span>
    : <span className="text-slate-300 tabular-nums">0</span>);

// 체크박스 컬럼을 따로 두지 않는다 — rowSelection.checkboxes가 이미 앞에 하나를 그린다
const WAVE_COLUMN_DEFS = [
    { field: 'wavNo', headerName: '웨이브번호', width: 168, cellClass: 'font-bold text-slate-700' },
    {
        field: 'orderCount', headerName: '주문', width: 70,
        cellClass: 'ag-right-aligned-cell text-slate-500', valueFormatter: (p) => num(p.value),
    },
    {
        field: 'odrQty', headerName: '주문수량', width: 100,
        cellClass: 'ag-right-aligned-cell tabular-nums', valueFormatter: (p) => num(p.value),
    },
    {
        field: 'alocQty', headerName: '할당수량', width: 100,
        cellClass: 'ag-right-aligned-cell tabular-nums text-slate-600', valueFormatter: (p) => num(p.value),
    },
    {
        field: 'remainQty', headerName: '잔량', width: 90, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '주문수량 − 할당수량. 별도 결품 테이블을 두지 않고 이 파생값으로 부족분을 본다',
        cellRenderer: remainCell,
    },
    { field: 'createdAt', headerName: '생성일시', flex: 1, minWidth: 120, valueFormatter: (p) => fmtDt(p.value) },
];

const LINE_COLUMN_DEFS = [
    { headerName: 'No.', width: 56, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'outbNo', headerName: '출고번호', width: 150, cellClass: 'font-bold text-slate-700' },
    { field: 'storeNm', headerName: '점포', flex: 1, minWidth: 110 },
    { field: 'prodCd', headerName: '상품코드', width: 110, cellClass: 'text-slate-600' },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 130 },
    { field: 'expctDe', headerName: '출고예정일', width: 105, valueFormatter: (p) => fmtDe(p.value) },
    {
        field: 'odrQty', headerName: '주문수량', width: 100,
        cellClass: 'ag-right-aligned-cell tabular-nums', valueFormatter: (p) => num(p.value),
    },
    {
        field: 'alocQty', headerName: '할당수량', width: 100,
        cellClass: 'ag-right-aligned-cell tabular-nums text-slate-600', valueFormatter: (p) => num(p.value),
    },
    { field: 'remainQty', headerName: '잔량', width: 90, cellClass: 'ag-right-aligned-cell', cellRenderer: remainCell },
];

const ALLOC_COLUMN_DEFS = [
    { field: 'locCd', headerName: '로케이션', width: 130, cellClass: 'font-medium text-slate-700' },
    { field: 'lotNo', headerName: 'Lot', width: 160, cellClass: 'text-slate-500' },
    { field: 'expiryDt', headerName: '유통기한', width: 110, valueFormatter: (p) => fmtDe(p.value) },
    {
        field: 'alocQty', headerName: '할당수량', width: 100,
        cellClass: 'ag-right-aligned-cell tabular-nums', valueFormatter: (p) => num(p.value),
    },
    {
        field: 'pikngQty', headerName: '피킹수량', width: 100, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '피킹이 시작된 할당은 해제할 수 없다 — 실물이 이미 나갔거나 나가는 중이다',
        cellRenderer: (p) => (p.value > 0
            ? <span className="font-bold text-emerald-600 tabular-nums">{num(p.value)}</span>
            : <span className="text-slate-300 tabular-nums">0</span>),
    },
];

/**
 * 재고 할당 (SC — 출고). <b>웨이브를 대상으로 실행해서 그 안의 출고주문 라인을 채운다.</b>
 *
 * 실행 단위가 웨이브인 것은 피킹지시가 웨이브 단위이기 때문이다 — 할당만 주문 단위로 하면
 * 편성(웨이브) → 할당(주문) → 피킹지시(웨이브)로 흐름 중간에서 단위가 한 번 어긋난다.
 *
 * 자동할당은 FEFO(유통기한 임박순)로 채우고, 점포마다 다른 잔여수명 기준으로 Lot을 먼저 거른다.
 * 재고가 모자라면 <b>앞 순번 주문이 채울 수 있는 만큼 다 가져간다</b>(순차 소진) — 나눠주면 모든
 * 주문이 부분출고가 되어 어느 점포도 만족하지 못하기 때문이다. 못 채운 만큼은 잔량으로 남고,
 * 재고가 들어오면 같은 웨이브를 다시 할당하면 된다.
 */
export default function Allocation() {
    const [cond, setCond] = useState({ wavNo: '', outbNo: '', prodCd: '', storeCd: '', expctDeFrom: '', expctDeTo: '' });
    const [waves, setWaves] = useState([]);
    const [detail, setDetail] = useState(null);      // { wavId, wavNo, lines, allocs }
    const [selectedLine, setSelectedLine] = useState(null);
    const [execResult, setExecResult] = useState(null);
    const [manualLine, setManualLine] = useState(null);
    const [confirmExec, setConfirmExec] = useState(null);
    const [confirmRelease, setConfirmRelease] = useState(null);

    const waveGridRef = useRef(null);
    const allocGridRef = useRef(null);
    // 재조회 뒤 보고 있던 웨이브를 다시 열기 위한 wavId (편성 화면과 같은 방식)
    const pendingWaveRef = useRef(null);

    // 검색 조건이 웨이브를 거르므로, 조건에 맞는 라인이 어느 것인지 하단에서 짚어준다
    const matchesCond = (line) => {
        const hit = (v, kw) => !kw || String(v ?? '').toLowerCase().includes(kw.toLowerCase());
        if (!cond.outbNo && !cond.prodCd && !cond.storeCd) return false;
        return hit(line.outbNo, cond.outbNo) && hit(line.prodCd, cond.prodCd) && hit(line.storeCd, cond.storeCd);
    };

    const fetchWaves = async (keepSelection = true) => {
        pendingWaveRef.current = keepSelection ? detail?.wavId ?? null : null;
        if (!keepSelection) {
            setDetail(null);
            setSelectedLine(null);
        }
        setWaves(await outbAllocApi.targetWaves(cond));
    };

    const fetchDetail = async (wavId) => {
        setSelectedLine(null);
        setDetail(wavId == null ? null : await outbAllocApi.detail(wavId));
    };

    const search = async () => {
        try {
            await fetchWaves();
            // 열려 있던 웨이브가 전량 할당돼 목록에서 빠져도 상세는 남긴다 —
            // 방금 한 작업의 결과를 확인하고 해제할 수 있어야 한다
            if (detail) await fetchDetail(detail.wavId);
        } catch (e) {
            toast.error(e.message || '조회에 실패했습니다.');
        }
    };

    useEffect(() => {
        outbAllocApi.targetWaves({}).then(setWaves).catch(() => {});
    }, []);

    const onWaveModelUpdated = (p) => {
        if (pendingWaveRef.current == null) return;
        const wavId = pendingWaveRef.current;
        pendingWaveRef.current = null;
        p.api.forEachNode(n => { if (n.data.wavId === wavId) n.setSelected(true); });
    };

    /** 체크가 곧 실행 대상이다. 마지막으로 체크한 웨이브의 상세를 아래에 편다 */
    const onWaveSelectionChanged = (e) => {
        const rows = e.api.getSelectedRows();
        const target = rows[rows.length - 1] ?? null;
        if (target?.wavId !== detail?.wavId) fetchDetail(target?.wavId ?? null);
    };

    const checkedWaves = () => waveGridRef.current?.api.getSelectedRows() ?? [];
    const checkedAllocs = () => allocGridRef.current?.api.getSelectedRows() ?? [];

    // ── 실행 ─────────────────────────────────────────────────
    const doExec = async (rows) => {
        try {
            const res = await outbAllocApi.execute(rows.map(r => r.wavId));
            setExecResult(res);
            if (res.alocQty === 0) {
                toast(`요청 ${num(res.reqQty)} 중 할당 0 — 쓸 수 있는 재고가 없습니다.`);
            } else if (res.shortQty > 0) {
                toast.success(`${num(res.alocQty)}개 할당 · 재고 부족으로 ${num(res.shortQty)}개가 잔량으로 남았습니다.`);
            } else {
                toast.success(`요청 ${num(res.reqQty)}개를 전량 할당했습니다.`);
            }
            await fetchWaves();
            if (detail) await fetchDetail(detail.wavId);
        } catch (e) {
            toast.error(e.message || '할당에 실패했습니다.');
        }
    };

    const handleExecClick = () => {
        const rows = checkedWaves();
        if (rows.length === 0) {
            toast('할당할 웨이브를 체크하세요.');
            return;
        }
        setConfirmExec(rows);
    };

    const handleManualClick = () => {
        if (!selectedLine) {
            toast('수동할당할 라인을 선택하세요.');
            return;
        }
        if (selectedLine.remainQty <= 0) {
            toast('이미 전량 할당된 라인입니다.');
            return;
        }
        setManualLine(selectedLine);
    };

    const handleReleaseClick = () => {
        const rows = checkedAllocs();
        if (rows.length === 0) {
            toast('해제할 할당을 체크하세요.');
            return;
        }
        const picked = rows.filter(r => r.pikngQty > 0);
        if (picked.length > 0) {
            toast.error(`피킹이 시작된 할당이 ${picked.length}건 있습니다 — 해제할 수 없습니다.`);
            return;
        }
        setConfirmRelease(rows);
    };

    const doRelease = async (rows) => {
        try {
            await outbAllocApi.release(rows.map(r => r.outbAllocId));
            toast.success(`할당 ${rows.length}건을 해제했습니다 — 재고 예약이 풀립니다.`);
            setExecResult(null);
            await fetchWaves();
            if (detail) await fetchDetail(detail.wavId);
        } catch (e) {
            toast.error(e.message || '할당 해제에 실패했습니다.');
        }
    };

    // 선택 라인의 할당 레코드만 아래에 보여준다. 라인을 안 고르면 웨이브 전체
    const shownAllocs = useMemo(() => {
        if (!detail) return [];
        return selectedLine
            ? detail.allocs.filter(a => a.outbLineId === selectedLine.outbLineId)
            : detail.allocs;
    }, [detail, selectedLine]);

    const shortLines = execResult?.lines.filter(l => l.shortQty > 0) ?? [];

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <PackageCheck size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">재고 할당</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    웨이브를 골라 실행하면 그 안의 주문 라인에 재고가 예약됩니다 — 재고는 움직이지 않습니다
                </span>
            </div>

            {/* 검색 — 조건은 웨이브를 거른다 */}
            <SearchBar label="검색" onSearch={search}>
                <SearchItem label="웨이브번호">
                    <input type="text" value={cond.wavNo}
                           onChange={(e) => setCond(p => ({ ...p, wavNo: e.target.value }))}
                           onKeyDown={(e) => e.key === 'Enter' && search()}
                           placeholder="WV-20260803-001" className="w-full input-base" />
                </SearchItem>
                <SearchItem label="출고번호">
                    <input type="text" value={cond.outbNo}
                           onChange={(e) => setCond(p => ({ ...p, outbNo: e.target.value }))}
                           onKeyDown={(e) => e.key === 'Enter' && search()}
                           placeholder="OB-20260803-001" className="w-full input-base" />
                </SearchItem>
                <SearchItem label="상품코드">
                    <input type="text" value={cond.prodCd}
                           onChange={(e) => setCond(p => ({ ...p, prodCd: e.target.value }))}
                           onKeyDown={(e) => e.key === 'Enter' && search()}
                           placeholder="PROD-0001" className="w-full input-base" />
                </SearchItem>
                <SearchItem label="점포코드">
                    <input type="text" value={cond.storeCd}
                           onChange={(e) => setCond(p => ({ ...p, storeCd: e.target.value }))}
                           onKeyDown={(e) => e.key === 'Enter' && search()}
                           placeholder="ST-0001" className="w-full input-base" />
                </SearchItem>
                <SearchItem label="출고예정일" wide>
                    <div className="flex items-center gap-2">
                        <input type="date" value={cond.expctDeFrom}
                               onChange={(e) => setCond(p => ({ ...p, expctDeFrom: e.target.value }))}
                               className="flex-1 min-w-0 input-base" />
                        <span className="text-slate-400 shrink-0">~</span>
                        <input type="date" value={cond.expctDeTo}
                               onChange={(e) => setCond(p => ({ ...p, expctDeTo: e.target.value }))}
                               className="flex-1 min-w-0 input-base" />
                    </div>
                </SearchItem>
            </SearchBar>

            {/* 실행 결과 — 동기 실행이라 결과를 바로 돌려준다 (작업로그를 뒤질 일이 없다) */}
            {execResult && (
                <div className="border border-slate-200 rounded-xl bg-white px-4 py-3 shrink-0 flex flex-col gap-2">
                    <div className="flex items-center gap-4 flex-wrap text-xs">
                        <div className="flex items-center gap-1.5">
                            <Rocket size={14} className="text-emerald-600" />
                            <span className="text-sm font-bold text-slate-700">할당 결과</span>
                        </div>
                        <Fig label="웨이브" value={execResult.waveCount} />
                        <Fig label="라인" value={execResult.lineCount} />
                        <Fig label="요청" value={execResult.reqQty} />
                        <Fig label="할당" value={execResult.alocQty} tone="text-emerald-600" />
                        <Fig label="잔량" value={execResult.shortQty} tone={execResult.shortQty > 0 ? 'text-amber-600' : ''} />
                        <button onClick={() => setExecResult(null)} className="ml-auto btn-ghost">닫기</button>
                    </div>
                    {shortLines.length > 0 && (
                        <div className="text-[11px] text-slate-500 bg-amber-50/60 rounded-lg px-3 py-2 leading-relaxed">
                            <b className="text-amber-700">재고가 모자란 라인 {shortLines.length}건</b> — 부족분은 잔량으로 남습니다(백오더 없음).
                            재고가 들어오면 같은 웨이브를 다시 할당하면 됩니다.
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                                {shortLines.slice(0, 8).map(l => (
                                    <span key={l.outbLineId} className="tabular-nums">
                                        {l.outbNo} · {l.prodCd} <b className="text-amber-700">{num(l.shortQty)}</b>
                                        {l.skips.length > 0 && (
                                            <span className="text-slate-400"> ({l.skips[0].reason}{l.skips.length > 1 ? ` 외 ${l.skips.length - 1}` : ''})</span>
                                        )}
                                    </span>
                                ))}
                                {shortLines.length > 8 && <span className="text-slate-400">외 {shortLines.length - 8}건</span>}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/*
              * 상: 대상 웨이브(체크 = 실행 대상) / 하: 선택 웨이브의 라인 — 그 라인의 할당 레코드.
              * 웨이브는 컬럼이 적어 위에 눕히고, 라인·할당 둘이 아래를 좌우로 나눈다.
              */}
            <PanelGroup direction="vertical" autoSaveId="outb-alloc-split-v1" className="flex-1 min-h-0">
                <Panel defaultSize={38} minSize={18} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">할당 대상 웨이브</span>
                        <span className="text-xs text-slate-400 truncate">
                            잔량이 남은 편성중 웨이브만 — 지시가 발행된 웨이브는 대상이 아닙니다
                        </span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">{waves.length}건</span>
                        <button onClick={handleExecClick} className="btn-primary shrink-0"
                                title="체크한 웨이브의 미할당 잔량을 FEFO로 채웁니다">
                            <Rocket size={13} /> 자동할당
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={waveGridRef}
                            rowData={waves}
                            columnDefs={WAVE_COLUMN_DEFS}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: true }}
                            onSelectionChanged={onWaveSelectionChanged}
                            onModelUpdated={onWaveModelUpdated}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={62} minSize={25} className="min-h-0">
                    <PanelGroup direction="horizontal" autoSaveId="outb-alloc-detail-split-v1" className="h-full">
                        {/* 좌: 라인 */}
                        <Panel defaultSize={62} minSize={35} className="flex flex-col gap-2 min-h-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-700 shrink-0">주문 라인</span>
                                <span className="text-xs text-slate-400 truncate">
                                    {detail ? detail.wavNo : '위에서 웨이브를 선택하세요'}
                                </span>
                                <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">
                                    {detail?.lines.length ?? 0}건
                                </span>
                                <button onClick={handleManualClick} disabled={!selectedLine} className="btn-ghost shrink-0
                                        disabled:text-slate-300 disabled:border-slate-200 disabled:hover:bg-white"
                                        title="선택한 라인에 Lot·로케이션을 직접 골라 할당합니다">
                                    <Hand size={13} /> 수동할당
                                </button>
                            </div>
                            <div className="flex-1 min-h-0">
                                <AgGridReact
                                    rowData={detail?.lines ?? []}
                                    columnDefs={LINE_COLUMN_DEFS}
                                    rowHeight={34}
                                    headerHeight={38}
                                    rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                                    onSelectionChanged={(e) => setSelectedLine(e.api.getSelectedNodes()[0]?.data ?? null)}
                                    // 검색 조건이 웨이브를 거르므로 「왜 안 찾은 주문까지 보이나」가 생긴다 —
                                    // 조건에 맞는 라인을 강조해 화면이 그 사실을 설명한다
                                    getRowClass={(p) => (matchesCond(p.data) ? 'bg-indigo-50/60' : '')}
                                />
                            </div>
                        </Panel>

                        <PanelResizeHandle className="w-2.5 flex items-center justify-center group cursor-col-resize">
                            <div className="w-1 h-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                        </PanelResizeHandle>

                        {/* 우: 할당 레코드 */}
                        <Panel defaultSize={38} minSize={25} className="flex flex-col gap-2 min-h-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-700 shrink-0">할당 내역</span>
                                <span className="text-xs text-slate-400 truncate">
                                    {selectedLine ? `${selectedLine.prodCd} · ${selectedLine.outbNo}` : '웨이브 전체'}
                                </span>
                                <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">{shownAllocs.length}건</span>
                                <button onClick={handleReleaseClick} className="btn-danger shrink-0"
                                        title="체크한 할당을 지우고 재고 예약을 되돌립니다">
                                    <Unlink size={13} /> 해제
                                </button>
                            </div>
                            <div className="flex-1 min-h-0">
                                <AgGridReact
                                    ref={allocGridRef}
                                    rowData={shownAllocs}
                                    columnDefs={ALLOC_COLUMN_DEFS}
                                    rowHeight={34}
                                    headerHeight={38}
                                    rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false }}
                                />
                            </div>
                        </Panel>
                    </PanelGroup>
                </Panel>
            </PanelGroup>

            {/* 수동할당 팝업 */}
            <AllocCandidateModal
                line={manualLine}
                wavId={detail?.wavId}
                onClose={() => setManualLine(null)}
                onSaved={async () => {
                    setExecResult(null);
                    await fetchWaves();
                    if (detail) await fetchDetail(detail.wavId);
                }}
            />

            {/* 자동할당 확인 */}
            {confirmExec && (
                <ConfirmModal
                    title="선택한 웨이브를 할당할까요?"
                    confirmText="할당"
                    onCancel={() => setConfirmExec(null)}
                    onConfirm={() => { doExec(confirmExec); setConfirmExec(null); }}
                >
                    <p className="text-sm text-slate-500">
                        웨이브 <b>{confirmExec.length}건</b>의 미할당 잔량 <b>{num(confirmExec.reduce((s, w) => s + w.remainQty, 0))}</b>개를
                        유통기한 임박순(FEFO)으로 채웁니다.
                    </p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        재고가 모자라면 앞 순번 주문이 채울 수 있는 만큼 가져가고 나머지는 잔량으로 남습니다 —
                        나눠서 배분하지 않습니다. 여러 웨이브를 함께 실행해도 <b>한 트랜잭션</b>이라,
                        도중에 오류가 나면 이번 실행 전체가 되돌아갑니다.
                    </p>
                </ConfirmModal>
            )}

            {/* 해제 확인 */}
            {confirmRelease && (
                <ConfirmModal
                    title="할당을 해제할까요?"
                    confirmText="해제"
                    danger
                    onCancel={() => setConfirmRelease(null)}
                    onConfirm={() => { doRelease(confirmRelease); setConfirmRelease(null); }}
                >
                    <p className="text-sm text-slate-500">
                        할당 <b>{confirmRelease.length}건</b>({num(confirmRelease.reduce((s, a) => s + a.alocQty, 0))}개)을 지우고
                        재고 예약을 되돌립니다.
                    </p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        재고는 물리적으로 움직이지 않고 가용수량만 복원됩니다.
                        해제 후 주문에 할당이 한 건도 남지 않으면 그 주문은 할당 이전(생성) 상태로 돌아갑니다.
                    </p>
                </ConfirmModal>
            )}
        </div>
    );
}

const Fig = ({ label, value, tone = '' }) => (
    <div className="flex items-center gap-1.5">
        <span className="text-slate-400">{label}</span>
        <span className={`text-sm font-bold tabular-nums ${tone || 'text-slate-700'}`}>{num(value)}</span>
    </div>
);
