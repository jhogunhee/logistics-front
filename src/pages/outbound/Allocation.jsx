import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Hand, PackageCheck, Rocket, ScrollText } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbAllocApi } from '@/api/outbAllocApi';
import { fmtDe, fmtDt, num, todayStr } from '@/utils/format';
import SearchBar, { SearchText, SearchDateRange, SearchProd } from '@/components/common/SearchBar';
import ConfirmModal from '@/components/common/ConfirmModal';
import AllocCandidateModal from '@/components/outbound/AllocCandidateModal';
import AllocRecordsModal from '@/components/outbound/AllocRecordsModal';

/** 잔량 강조 — 0이면 흐리게, 남아 있으면 눈에 걸리게. 이 값이 이 화면의 결품 표시다 */
const remainCell = (p) => (p.value > 0
    ? <span className="font-bold text-amber-600 tabular-nums">{num(p.value)}</span>
    : <span className="text-slate-300 tabular-nums">0</span>);

/**
 * 웨이브 목록. 좌측 패널이 좁아 뒤쪽 컬럼은 가로 스크롤로 밀리므로, <b>실행 대상을 고를 때
 * 필요한 것</b>(번호 · 잔량)을 앞에 둬 기본 폭에서 스크롤 없이 보이게 한다 (편성 화면과 같은 원칙).
 * 체크박스 컬럼을 따로 두지 않는다 — rowSelection.checkboxes가 이미 앞에 하나를 그린다.
 */
const WAVE_COLUMN_DEFS = [
    { field: 'wavNo', headerName: '웨이브번호', width: 168, cellClass: 'font-bold text-slate-700' },
    {
        field: 'remainQty', headerName: '잔량', width: 90, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '주문수량 − 할당수량. 별도 결품 테이블을 두지 않고 이 파생값으로 부족분을 본다',
        cellRenderer: remainCell,
    },
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
    const [cond, setCond] = useState({ wavNo: '', outbNo: '', prodCd: '', storeCd: '', expctDeFrom: todayStr(), expctDeTo: todayStr() });
    const [waves, setWaves] = useState([]);
    const [detail, setDetail] = useState(null);      // { wavId, wavNo, lines, allocs }
    const [selectedLine, setSelectedLine] = useState(null);
    const [execResult, setExecResult] = useState(null);
    const [recordsOpen, setRecordsOpen] = useState(false); // 할당 내역 팝업
    const [manualLine, setManualLine] = useState(null);
    const [confirmExec, setConfirmExec] = useState(null);
    const waveGridRef = useRef(null);
    // 재조회 뒤 보고 있던 웨이브를 다시 열기 위한 wavId (편성 화면과 같은 방식)
    const pendingWaveRef = useRef(null);

    // 검색 조건이 웨이브를 거르므로, 조건에 맞는 라인이 어느 것인지 우측에서 짚어준다
    const matchesCond = (line) => {
        const hit = (v, kw) => !kw || String(v ?? '').toLowerCase().includes(kw.toLowerCase());
        if (!cond.outbNo && !cond.prodCd && !cond.storeCd) return false;
        return hit(line.outbNo, cond.outbNo) && hit(line.prodCd, cond.prodCd) && hit(line.storeCd, cond.storeCd);
    };

    const shortLines = execResult?.lines.filter(l => l.shortQty > 0) ?? [];

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

    // 최초 1회 조회 (검색조건 기본값 = 출고예정일 오늘)
    useEffect(() => {
        outbAllocApi.targetWaves(cond).then(setWaves).catch(() => {});
    }, []);

    const onWaveModelUpdated = (p) => {
        if (pendingWaveRef.current == null) return;
        const wavId = pendingWaveRef.current;
        pendingWaveRef.current = null;
        p.api.forEachNode(n => { if (n.data.wavId === wavId) n.setSelected(true); });
    };

    /** 체크가 곧 실행 대상이다. 마지막으로 체크한 웨이브의 상세를 우측에 편다 */
    const onWaveSelectionChanged = (e) => {
        const rows = e.api.getSelectedRows();
        const target = rows[rows.length - 1] ?? null;
        if (target?.wavId !== detail?.wavId) fetchDetail(target?.wavId ?? null);
    };

    const checkedWaves = () => waveGridRef.current?.api.getSelectedRows() ?? [];

    // ── 실행 ─────────────────────────────────────────────────
    const handleExecClick = () => {
        const rows = checkedWaves();
        if (rows.length === 0) {
            toast('할당할 웨이브를 체크하세요.');
            return;
        }
        setConfirmExec(rows);
    };

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

    // 해제 자체는 팝업이 처리하고, 여기선 해제된 뒤 목록을 다시 읽는다 (팝업 목록도 따라 갱신된다)
    const onReleased = async () => {
        setExecResult(null);
        await fetchWaves();
        if (detail) await fetchDetail(detail.wavId);
    };

    return (
        // min-h — 노트북처럼 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <PackageCheck size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">재고 할당</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    웨이브를 골라 실행하면 그 안의 주문 라인에 재고가 예약됩니다 — 재고는 움직이지 않습니다
                </span>
            </div>

            {/* 검색 — 조건은 웨이브를 거른다 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={search}>
                <SearchText name="wavNo" label="웨이브번호" placeholder="WV-20260803-001" />
                <SearchText name="outbNo" label="출고번호" placeholder="OB-20260803-001" />
                <SearchProd name="prodCd" />
                <SearchText name="storeCd" label="점포코드" placeholder="ST-0001" />
                <SearchDateRange from="expctDeFrom" to="expctDeTo" label="출고예정일" />
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
                        {/* 어느 규칙으로 뽑혔는지 — 전략이 없으면 「기본 동작」이 정상 상태다 */}
                        <span className="text-slate-500" title="적용된 할당 전략 (실행 1회에 1건)">
                            {execResult.stgyNm
                                ? <>전략 <b className="text-indigo-600">{execResult.stgyNm}</b>
                                    <span className="text-slate-400"> r{execResult.rvsnNo}</span></>
                                : <span className="text-slate-400">기본 동작 (FEFO · 순차 소진)</span>}
                        </span>
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
              * 좌: 대상 웨이브(체크 = 실행 대상) / 우: 선택 웨이브의 주문 라인 — 편성 화면과 같은 구성.
              * 할당 레코드는 상시 그리드로 두지 않고 「할당 내역」 팝업에서 본다 — 해제는 예외 경로라
              * 자주 쓰지 않는데, 상시로 두면 세 그리드가 화면을 나눠 매번 보는 웨이브·라인이 좁아진다.
              */}
            <PanelGroup direction="horizontal" autoSaveId="outb-alloc-split-v2" className="flex-1 min-h-0">
                <Panel defaultSize={33} minSize={16} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">할당 대상 웨이브</span>
                        <span className="text-xs text-slate-400 truncate">
                            잔량이 남은 편성중 웨이브만
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

                <PanelResizeHandle className="w-2.5 flex items-center justify-center group cursor-col-resize">
                    <div className="w-1 h-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={67} minSize={40} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">주문 라인</span>
                        <span className="text-xs text-slate-400 truncate">
                            {detail ? detail.wavNo : '왼쪽에서 웨이브를 선택하세요'}
                        </span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">
                            {detail?.lines.length ?? 0}건
                        </span>
                        <button onClick={handleManualClick} disabled={!selectedLine} className="btn-ghost shrink-0
                                disabled:text-slate-300 disabled:border-slate-200 disabled:hover:bg-white"
                                title="선택한 라인에 Lot·로케이션을 직접 골라 할당합니다">
                            <Hand size={13} /> 수동할당
                        </button>
                        <button onClick={() => setRecordsOpen(true)} disabled={!detail}
                                title="이 웨이브의 할당 레코드를 보고 체크해서 해제합니다"
                                className="btn-ghost shrink-0 disabled:text-slate-300 disabled:border-slate-200 disabled:hover:bg-white">
                            <ScrollText size={13} /> 할당 내역
                            <span className="font-normal opacity-80">({num(detail?.allocs.length ?? 0)})</span>
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
            </PanelGroup>

            {/* 할당 내역 팝업 — 열려 있는 동안만 마운트. 해제 후에도 열린 채 갱신된 목록을 보여준다 */}
            {recordsOpen && detail && (
                <AllocRecordsModal
                    detail={detail}
                    onClose={() => setRecordsOpen(false)}
                    onReleased={onReleased}
                />
            )}

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
        </div>
    );
}

const Fig = ({ label, value, tone = '' }) => (
    <div className="flex items-center gap-1.5">
        <span className="text-slate-400">{label}</span>
        <span className={`text-sm font-bold tabular-nums ${tone || 'text-slate-700'}`}>{num(value)}</span>
    </div>
);
