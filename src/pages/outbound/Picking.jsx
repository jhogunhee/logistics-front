import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { History, PackageOpen, PackageX, Play } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbPikngApi } from '@/api/outbPikngApi';
import { useCodes } from '@/hooks/useCodes';
import { ETC_RSN_CD } from '@/constants/rsnCodes';
import { fmtDe, fmtDt, num, todayStr } from '@/utils/format';
import SearchBar, { SearchText, SearchDateRange, SearchProd } from '@/components/common/SearchBar';
import ConfirmModal from '@/components/common/ConfirmModal';
import PikngAcrstModal from '@/components/outbound/PikngAcrstModal';

/** 잔량 강조 — 0이면 완료(흐리게), 남아 있으면 눈에 걸리게 */
const remainCell = (p) => (p.value > 0
    ? <span className="font-bold text-amber-600 tabular-nums">{num(p.value)}</span>
    : <span className="text-slate-300 tabular-nums">0</span>);

/**
 * 미종결 지시 강조 — <b>0이 아니면 언제나 강조한다.</b> 결품 종결을 강제하는 마감·배치가
 * 없어서, 이 값이 「끝내 닫히지 않은 잔량」의 유일한 신호다. 시간 임계를 두면 임계 미만
 * 구간이 조용해지는데 잊히는 일은 정확히 그 구간에서 시작한다.
 */
const openCell = (p) => (p.value > 0
    ? <span className="font-bold text-indigo-600 tabular-nums">{num(p.value)}</span>
    : <span className="text-slate-300 tabular-nums">0</span>);

/** 웨이브 목록 — 지시발행(ISSUED)된 웨이브의 진행 집계. 잔량 0도 당일 확인용으로 남는다 */
const WAVE_COLUMN_DEFS = [
    { field: 'wavNo', headerName: '웨이브번호', width: 168, cellClass: 'font-bold text-slate-700' },
    { field: 'remainQty', headerName: '잔량', width: 90, cellClass: 'ag-right-aligned-cell', cellRenderer: remainCell },
    {
        field: 'openTaskCount', headerName: '미종결', width: 82, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '아직 닫히지 않은 지시 건수 — 더 집거나 결품 종결해야 하는 것이다. 종결을 강제하는 마감이 없으므로 잊히면 예약이 무기한 남고 주문이 피킹중에 머문다. 0이 아니면 항상 강조한다',
        cellRenderer: openCell,
    },
    { field: 'expctDe', headerName: '출고예정일', width: 105, valueFormatter: (p) => fmtDe(p.value) },
    {
        field: 'drctQty', headerName: '지시수량', width: 100,
        cellClass: 'ag-right-aligned-cell tabular-nums', valueFormatter: (p) => num(p.value),
    },
    {
        field: 'cmplQty', headerName: '피킹수량', width: 100,
        cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 0 ? 'text-emerald-600 font-bold' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
    { field: 'issuedDt', headerName: '발행일시', flex: 1, minWidth: 120, valueFormatter: (p) => fmtDt(p.value) },
];

/**
 * 지시 그리드 — srt_seq 순 = 집품 동선. 로케이션을 앞에 둬 「어디로 가서 무엇을 집나」로 읽힌다.
 * 완료 행(잔량 0)은 체크·편집이 잠긴다 — 실적 취소가 없어 작업 여지가 없다.
 */
const TASK_COLUMN_DEFS = [
    { field: 'srtSeq', headerName: '순번', width: 64, cellClass: 'text-slate-500 tabular-nums' },
    { field: 'locCd', headerName: '로케이션', width: 130, cellClass: 'font-medium text-slate-700' },
    { field: 'prodCd', headerName: '상품코드', width: 110, cellClass: 'text-slate-600' },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 130 },
    { field: 'lotNo', headerName: 'Lot', width: 150, cellClass: 'text-slate-500' },
    { field: 'expiryDt', headerName: '유통기한', width: 105, valueFormatter: (p) => fmtDe(p.value) },
    {
        field: 'drctQty', headerName: '지시수량', width: 96,
        cellClass: 'ag-right-aligned-cell tabular-nums', valueFormatter: (p) => num(p.value),
    },
    {
        field: 'cmplQty', headerName: '기피킹', width: 90,
        cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 0 ? 'text-emerald-600 font-bold' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
    { field: 'remainQty', headerName: '잔량', width: 84, cellClass: 'ag-right-aligned-cell', cellRenderer: remainCell },
    {
        field: 'shotgeQty', headerName: '결품', width: 78,
        headerTooltip: '결품 종결로 포기한 잔량 — 채워져 있으면 전량 집품이 아니라 결품으로 닫힌 지시다',
        cellClass: 'ag-right-aligned-cell tabular-nums text-rose-600 font-bold',
        cellRenderer: (p) => (p.value > 0 ? num(p.value) : <span className="text-slate-300 font-normal">—</span>),
    },
    {
        field: '_pikngQty', headerName: '피킹수량', width: 96, editable: (p) => p.data.remainQty > 0,
        cellDataType: 'number',
        cellEditor: 'agNumberCellEditor', cellEditorParams: { min: 1, precision: 0 },
        valueFormatter: (p) => num(p.value),
        // 잔량 초과 상태인 동안 셀을 붉게 — 토스트는 사라져도 안 고친 행이 계속 눈에 걸린다 (적치 화면과 같은 방식)
        cellClass: (p) => Number(p.value) > p.data.remainQty
            ? 'ag-right-aligned-cell bg-rose-50 text-rose-600 font-bold'
            : 'ag-right-aligned-cell bg-indigo-50',
        headerTooltip: '이번에 집품한 수량 — 기본값은 잔량 전량, 일부만 집었으면 고쳐서 부분 피킹',
    },
    { field: 'outbNo', headerName: '출고번호', width: 150, cellClass: 'font-bold text-slate-700' },
    { field: 'storeNm', headerName: '점포', flex: 1, minWidth: 110 },
];

/**
 * 피킹 (SC — 출고). <b>발행된 지시에 실적 수량을 입력하면 재고가 보관 → SHIP-STAGE로 실제
 * 이동한다</b> — 출고 흐름에서 재고가 물리적으로 움직이는 첫 지점이다.
 *
 * 부분 피킹은 잔량 재피킹으로 소진하고, 실적 취소는 지원하지 않는다(신중히 입력할 것).
 * 전 할당이 소진된 주문은 피킹완료(PICKED)가 되어 출고확정 대상이 된다.
 *
 * 시킨 만큼 실물이 없어 <b>잔량을 끝내 못 집는</b> 경우는 「결품 종결」이 닫는다 — 지시·할당수량을
 * 실적까지 낮추고 잔량만큼의 예약을 푼다. 장부에만 남은 수량은 재고조사가 정리한다.
 */
export default function Picking() {
    const shotgeRsn = useCodes('SHOTGE_RSN'); // 결품사유
    const [cond, setCond] = useState({ wavNo: '', prodCd: '', expctDeFrom: todayStr(), expctDeTo: todayStr() });
    const [waves, setWaves] = useState([]);
    const [wave, setWave] = useState(null);          // 선택 웨이브 (단일)
    const [rows, setRows] = useState([]);
    const [checkedCount, setCheckedCount] = useState(0);
    const [focusedTask, setFocusedTask] = useState(null); // 실적 내역 모달 대상 (마지막 클릭 행)
    const [acrstOpen, setAcrstOpen] = useState(false);
    const [confirmExec, setConfirmExec] = useState(null);
    // 결품 종결 모달 — 대상 행과 사유를 한 상태로 들고 있다가 확인 시점에 검증한다
    const [closeShort, setCloseShort] = useState(null);
    const taskGridRef = useRef(null);
    // 재조회 뒤 보고 있던 웨이브를 다시 열기 위한 wavId (할당 화면과 같은 방식)
    const pendingWaveRef = useRef(null);

    const fetchWaves = async () => {
        pendingWaveRef.current = wave?.wavId ?? null;
        setWaves(await outbPikngApi.pickingWaves(cond));
    };

    const fetchRows = async (wavId) => {
        setCheckedCount(0);
        setFocusedTask(null);
        if (wavId == null) {
            setRows([]);
            return;
        }
        const detail = await outbPikngApi.taskDetail(wavId);
        // 피킹수량 편집 컬럼의 기본값 = 잔량 전량 — 부분 피킹할 때만 고친다 (적치 화면과 같은 방식)
        setRows(detail.rows.map(r => ({ ...r, _pikngQty: r.remainQty > 0 ? r.remainQty : null })));
    };

    const search = async () => {
        try {
            await fetchWaves();
            if (wave) await fetchRows(wave.wavId);
        } catch (e) {
            toast.error(e.message || '조회에 실패했습니다.');
        }
    };

    // 최초 1회 조회 (검색조건 기본값 = 출고예정일 오늘)
    useEffect(() => {
        outbPikngApi.pickingWaves(cond).then(setWaves).catch(() => {});
    }, []);

    const onWaveModelUpdated = (p) => {
        if (pendingWaveRef.current == null) return;
        const wavId = pendingWaveRef.current;
        pendingWaveRef.current = null;
        p.api.forEachNode(n => { if (n.data.wavId === wavId) n.setSelected(true); });
    };

    const onWaveSelectionChanged = (e) => {
        const target = e.api.getSelectedNodes()[0]?.data ?? null;
        if (target?.wavId !== wave?.wavId) {
            setWave(target);
            fetchRows(target?.wavId ?? null).catch(() => {});
        }
    };

    // ── 피킹 실행 ─────────────────────────────────────────────
    const handleExecClick = () => {
        taskGridRef.current?.api.stopEditing();
        const picked = taskGridRef.current?.api.getSelectedRows() ?? [];
        if (picked.length === 0) {
            toast('피킹할 지시를 체크하세요.');
            return;
        }
        const bad = picked.find(r => !(Number(r._pikngQty) >= 1) || Number(r._pikngQty) > r.remainQty);
        if (bad) {
            toast.error(`피킹수량은 1 이상, 잔량 이하여야 합니다: 순번 ${bad.srtSeq} (잔량 ${num(bad.remainQty)})`);
            return;
        }
        setConfirmExec(picked);
    };

    const doExec = async (picked) => {
        try {
            const res = await outbPikngApi.execute(
                picked.map(r => ({ pikngTaskId: r.taskId, qty: Number(r._pikngQty) })));
            const picked_ = res.orderChanges.filter(c => c.status === 'PICKED');
            toast.success(`지시 ${res.taskCount}건 · ${num(res.pikngQty)}개를 피킹했습니다`
                + (picked_.length > 0 ? ` — 피킹완료 주문 ${picked_.length}건 (${picked_.map(c => c.outbNo).join(', ')})` : ''));
            await fetchWaves();
            if (wave) await fetchRows(wave.wavId);
        } catch (e) {
            toast.error(e.message || '피킹에 실패했습니다.');
        }
    };

    // ── 결품 종결 ─────────────────────────────────────────────
    const handleCloseShortClick = () => {
        taskGridRef.current?.api.stopEditing();
        const picked = taskGridRef.current?.api.getSelectedRows() ?? [];
        if (picked.length === 0) {
            toast('결품 종결할 지시를 체크하세요.');
            return;
        }
        // 실적이 없는 지시는 종결이 아니라 지시취소 대상이다 — 두 경로가 겹치지 않게 여기서 갈라준다.
        // 그 취소는 지시 단위라, 같은 웨이브의 다른 지시가 이미 집혔어도 막히지 않는다
        const untouched = picked.filter(r => r.cmplQty === 0);
        if (untouched.length > 0) {
            toast.error(`아직 한 개도 집지 않은 지시가 ${untouched.length}건 있습니다`
                + ` — 결품 종결이 아니라 피킹지시 화면에서 그 지시만 골라 「지시취소」하세요`
                + ` (순번 ${untouched.map(r => r.srtSeq).join(', ')})`);
            return;
        }
        setCloseShort({ rows: picked, rsnCd: '', rsnDscr: '' });
    };

    const doCloseShort = async ({ rows: targets, rsnCd, rsnDscr }) => {
        try {
            const res = await outbPikngApi.closeShort(targets.map(r => ({
                pikngTaskId: r.taskId,
                rsnCd,
                rsnDscr: rsnCd === ETC_RSN_CD ? rsnDscr.trim() : null,
            })));
            const done = res.orderChanges.filter(c => c.status === 'PICKED');
            toast.success(`지시 ${res.taskCount}건 · ${num(res.shotgeQty)}개를 결품으로 닫았습니다 (예약 반환)`
                + (done.length > 0 ? ` — 피킹완료 주문 ${done.length}건 (${done.map(c => c.outbNo).join(', ')})` : ''));
            await fetchWaves();
            if (wave) await fetchRows(wave.wavId);
        } catch (e) {
            toast.error(e.message || '결품 종결에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <PackageOpen size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">피킹</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    지시 순서대로 집품하고 수량을 입력하면 재고가 보관 → SHIP-STAGE로 이동합니다
                </span>
            </div>

            {/* 검색 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={search}>
                <SearchText name="wavNo" label="웨이브번호" placeholder="WV-20260820-001" />
                <SearchProd name="prodCd" />
                <SearchDateRange from="expctDeFrom" to="expctDeTo" label="출고예정일" />
            </SearchBar>

            {/* 좌: 발행된 웨이브(단일 선택) / 우: 지시 그리드(체크 + 수량 편집 = 실행 대상) */}
            <PanelGroup direction="horizontal" autoSaveId="outb-picking-split" className="flex-1 min-h-0">
                <Panel defaultSize={33} minSize={16} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">발행된 웨이브</span>
                        <span className="text-xs text-slate-400 truncate">피킹지시 발행분</span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">{waves.length}건</span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            rowData={waves}
                            columnDefs={WAVE_COLUMN_DEFS}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
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
                        <span className="text-sm font-bold text-slate-700 shrink-0">피킹 지시</span>
                        <span className="text-xs text-slate-400 truncate">
                            {wave ? `${wave.wavNo} · 순번 = 집품 동선` : '왼쪽에서 웨이브를 선택하세요'}
                        </span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">
                            선택 {checkedCount} / {rows.length}건
                        </span>
                        <button onClick={() => setAcrstOpen(true)} disabled={!focusedTask}
                                title="클릭한 지시의 실행 실적 로그를 봅니다 (부분 피킹 이력)"
                                className="btn-ghost shrink-0 disabled:text-slate-300 disabled:border-slate-200 disabled:hover:bg-white">
                            <History size={13} /> 실적 내역
                        </button>
                        <button onClick={handleCloseShortClick} className="btn-ghost shrink-0"
                                title="시킨 만큼 실물이 없어 잔량을 끝내 못 집을 때 — 지시를 실적까지 낮춰 닫고 예약을 돌려줍니다">
                            <PackageX size={13} /> 결품 종결
                        </button>
                        <button onClick={handleExecClick} className="btn-primary shrink-0"
                                title="체크한 지시를 입력한 수량만큼 피킹 처리합니다">
                            <Play size={13} /> 피킹
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={taskGridRef}
                            rowData={rows}
                            columnDefs={TASK_COLUMN_DEFS}
                            rowHeight={34}
                            headerHeight={38}
                            singleClickEdit={true}
                            stopEditingWhenCellsLoseFocus={true}
                            rowSelection={{
                                mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false,
                                // 완료 행은 작업 여지가 없다 — 실적 취소가 없으므로 체크 자체를 막는다
                                isRowSelectable: (node) => node.data.remainQty > 0,
                            }}
                            onSelectionChanged={(e) => setCheckedCount(e.api.getSelectedRows().length)}
                            onCellClicked={(e) => setFocusedTask(e.data)}
                            // 완료 행은 흐리게 — 남은 일과 끝난 일이 한눈에 갈리게 한다
                            getRowClass={(p) => (p.data.remainQty === 0 ? 'opacity-45' : '')}
                        />
                    </div>
                </Panel>
            </PanelGroup>

            {/* 실적 내역 팝업 */}
            {acrstOpen && focusedTask && (
                <PikngAcrstModal task={focusedTask} onClose={() => setAcrstOpen(false)} />
            )}

            {/* 피킹 확인 — 실적 취소가 없으므로 실행 전에 한 번 짚는다 */}
            {confirmExec && (
                <ConfirmModal
                    title="피킹 처리할까요?"
                    confirmText="피킹"
                    onCancel={() => setConfirmExec(null)}
                    onConfirm={() => { doExec(confirmExec); setConfirmExec(null); }}
                >
                    <p className="text-sm text-slate-500">
                        지시 <b>{confirmExec.length}건</b> · <b>{num(confirmExec.reduce((s, r) => s + Number(r._pikngQty), 0))}</b>개를
                        피킹 처리합니다 — 재고가 보관 로케이션에서 SHIP-STAGE로 이동합니다.
                    </p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        피킹 실적 취소는 지원하지 않습니다 — 수량을 확인하고 진행하세요.
                        일부만 집었으면 수량을 줄여 부분 피킹하고, 잔량은 나중에 다시 피킹하면 됩니다.
                    </p>
                </ConfirmModal>
            )}
            {/* 결품 종결 확인 — 되돌릴 수 없다. 사유는 여기서만 받는다 (잔량을 없앤 근거) */}
            {closeShort && (
                <ConfirmModal
                    title="결품으로 닫을까요?"
                    confirmText="결품 종결"
                    danger
                    onCancel={() => setCloseShort(null)}
                    onConfirm={() => {
                        if (!closeShort.rsnCd) {
                            toast.error('결품사유를 선택하세요.');
                            return;
                        }
                        if (closeShort.rsnCd === ETC_RSN_CD && !closeShort.rsnDscr.trim()) {
                            toast.error('사유가 기타일 때는 사유 내용을 입력해야 합니다.');
                            return;
                        }
                        doCloseShort(closeShort);
                        setCloseShort(null);
                    }}
                >
                    <p className="text-sm text-slate-500">
                        지시 <b>{closeShort.rows.length}건</b>의 잔량{' '}
                        <b className="text-rose-600">{num(closeShort.rows.reduce((sum, r) => sum + r.remainQty, 0))}</b>개를
                        결품으로 닫습니다 — 지시·할당수량이 집품한 만큼으로 내려가고 <b>예약이 풀립니다.</b>
                    </p>
                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-slate-600">결품사유</span>
                        <select
                            value={closeShort.rsnCd}
                            onChange={(e) => setCloseShort({ ...closeShort, rsnCd: e.target.value })}
                            className="input-base"
                        >
                            <option value="">사유 선택</option>
                            {shotgeRsn.selectOptions.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </label>
                    {closeShort.rsnCd === ETC_RSN_CD && (
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-slate-600">사유 내용</span>
                            <input
                                type="text" maxLength={200} autoFocus
                                value={closeShort.rsnDscr}
                                onChange={(e) => setCloseShort({ ...closeShort, rsnDscr: e.target.value })}
                                className="input-base" placeholder="결품 사유를 입력하세요"
                            />
                        </label>
                    )}
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        되돌릴 수 없습니다 — 사유가 다른 지시는 나눠서 종결하세요.
                        <br />
                        장부에만 남고 실물이 없는 수량은 여기서 줄이지 않습니다. 예약이 풀렸으므로 <b>재고조사</b>로 정리하세요.
                    </p>
                </ConfirmModal>
            )}
        </div>
    );
}
