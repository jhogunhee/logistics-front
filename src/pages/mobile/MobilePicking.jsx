import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, MapPin, PackageOpen, PackageX, RefreshCw, SkipForward } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbPikngApi } from '@/api/outbPikngApi';
import { useCodes } from '@/hooks/useCodes';
import { useScanFlow } from '@/hooks/useScanFlow';
import { ETC_RSN_CD } from '@/constants/rsnCodes';
import { fmtDe, num } from '@/utils/format';
import { okFeedback } from '@/utils/scanFeedback';
import { ProdThumb } from '@/components/common/ProdThumb';
import { QtyStepper } from '@/components/mobile/QtyStepper';
import { ScanRow } from '@/components/mobile/ScanRow';
import { StatBox } from '@/components/mobile/StatBox';
import { StepChips } from '@/components/mobile/StepChips';

/** 집품 단계 — 로케이션·상품·Lot을 차례로 스캔해 맞는 곳·맞는 물건·맞는 Lot임을 확인한 뒤 수량을 넣는다 */
const STEPS = [
    { key: 'LOC', label: '로케이션' },
    { key: 'PROD', label: '상품' },
    { key: 'LOT', label: 'Lot' },
    { key: 'QTY', label: '수량' },
];

/** 단계별 대조 대상 — 무엇과 맞춰 보고 틀리면 뭐라고 알릴지. 단계 진행 자체는 useScanFlow가 한다 */
const MATCHERS = {
    LOC: { of: t => t.locCd, fail: t => `로케이션이 다릅니다 — ${t.locCd} 위치로 가세요` },
    PROD: { of: t => t.prodCd, fail: t => `상품이 다릅니다 — ${t.prodCd} ${t.prodNm}` },
    LOT: { of: t => t.lotNo, fail: t => `Lot이 다릅니다 — ${t.lotNo} (유통기한 ${fmtDe(t.expiryDt) || '—'})` },
};

/** 지금 집을 수 있는 지시 — 잔량이 있고 보충 대기(실물이 아직 보관존)가 아닌 것 */
const isWorkable = (r) => r.remainQty > 0 && r.rplnStatus !== 'DIRECTED';

/** 점포 식별 색 — 웹 피킹 화면과 같은 배정 방식(동선 순으로 처음 나온 순서) */
const STORE_DOTS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
    'bg-sky-500', 'bg-violet-500', 'bg-teal-500', 'bg-fuchsia-500'];

/** 진행 위치 복원용 sessionStorage 키 — PDA 슬립·새로고침에도 보던 웨이브로 돌아온다 */
const WAV_KEY = 'mpicking.wavId';
const LOC_KEY = 'mpicking.locKw';

/**
 * 피킹 실행 (PDA — /m). 웹 피킹 화면과 같은 API를 쓰되, RF 표준대로 <b>한 번에 한 지시</b>를
 * 동선(srt_seq) 순으로 로케이션 → 상품 → Lot 확인을 거쳐 소진한다. 지시 발행·취소·실적 조회는
 * 웹 화면의 몫이고 이 화면은 실행(피킹·결품 종결)만 한다.
 */
export default function MobilePicking() {
    const shotgeRsn = useCodes('SHOTGE_RSN'); // 결품사유
    const [waves, setWaves] = useState([]);
    const [rows, setRows] = useState([]);
    const [wave, setWave] = useState(null);          // 선택 웨이브 (없으면 웨이브 목록 화면)
    const [locKw, setLocKw] = useState(() => sessionStorage.getItem(LOC_KEY) ?? '');
    const [qty, setQty] = useState('');
    const [busy, setBusy] = useState(false);
    const [closeShort, setCloseShort] = useState(null); // { rsnCd, rsnDscr }
    // 부분 피킹 직후 잔량 처리 문답 — 실행이 끝난 뒤에 묻는다 (수량을 줄였다고 잔량을 멋대로 결품 내지 않는다)
    const [askShort, setAskShort] = useState(null);     // 잔량이 남은 지시 (재조회 후 값)
    const qtyRef = useRef(null);

    const workableAll = useMemo(() => rows.filter(isWorkable), [rows]);
    const filtered = useMemo(() => {
        const kw = locKw.trim().toLowerCase();
        return kw ? workableAll.filter(r => (r.locCd ?? '').toLowerCase().includes(kw)) : workableAll;
    }, [workableAll, locKw]);

    const {
        task, queue: openTasks, step, scanVal, setScanVal, scanRef, handleScan, pass, skip, goTo, stay, clear,
    } = useScanFlow({
        steps: STEPS,
        queue: filtered,
        idOf: t => t.taskId,
        matchers: MATCHERS,
        onReachTerminal: (t) => setQty(String(t.remainQty)),
        terminalRef: qtyRef,
    });
    const blockedCount = useMemo(() => rows.filter(r => r.remainQty > 0 && r.rplnStatus === 'DIRECTED').length, [rows]);
    const doneCount = useMemo(() => rows.filter(r => r.remainQty === 0).length, [rows]);
    // 점포 색은 웨이브 전체 행 기준으로 배정한다 — 구역 필터로 좁혀도 같은 점포는 같은 색이다
    const storeColorOf = useMemo(() => {
        const map = new Map();
        for (const r of rows) {
            const nm = r.storeNm ?? '—';
            if (!map.has(nm)) map.set(nm, STORE_DOTS[map.size % STORE_DOTS.length]);
        }
        return map;
    }, [rows]);

    const fetchWaves = () => outbPikngApi.pickingWaves().then(setWaves);

    const openWave = async (w) => {
        const detail = await outbPikngApi.taskDetail(w.wavId).catch(() => null);
        if (!detail) return;
        sessionStorage.setItem(WAV_KEY, String(w.wavId));
        setWave(w);
        setRows(detail.rows);
        clear();
    };

    const backToWaves = () => {
        sessionStorage.removeItem(WAV_KEY);
        setWave(null);
        setRows([]);
        clear();
        fetchWaves().catch(() => {});
    };

    const changeLocKw = (v) => {
        setLocKw(v);
        sessionStorage.setItem(LOC_KEY, v);
    };

    // 최초 조회 + 진행 위치 복원 — 새로고침·재시작해도 보던 웨이브의 집품 화면으로 돌아온다
    useEffect(() => {
        (async () => {
            const list = await outbPikngApi.pickingWaves().catch(() => null);
            if (!list) return;
            setWaves(list);
            const saved = Number(sessionStorage.getItem(WAV_KEY));
            const w = list.find(x => x.wavId === saved);
            if (w) await openWave(w);
        })();
        // 마운트 1회 — openWave는 의존성으로 넣지 않는다 (매 렌더 새 함수라 넣으면 조회가 반복된다)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * 실행·종결 뒤 재조회 — 같은 지시에 잔량이 남으면 그 자리에 머물고(그 지시를 돌려준다),
     * 닫혔으면 동선상 다음 지시로 간다.
     */
    const afterAction = async (prev) => {
        const fresh = (await outbPikngApi.taskDetail(wave.wavId)).rows;
        setRows(fresh);
        const cur = fresh.find(r => r.taskId === prev.taskId);
        if (cur && isWorkable(cur)) {
            stay(cur);
            return cur;
        }
        // 동선상 다음 지시 — 없으면 큐 맨 앞(건너뛴 지시는 뒤로 밀려 있다)
        const kw = locKw.trim().toLowerCase();
        const opens = fresh.filter(isWorkable)
            .filter(r => !kw || (r.locCd ?? '').toLowerCase().includes(kw));
        goTo(opens.find(t => t.srtSeq > prev.srtSeq)?.taskId ?? null);
        return null;
    };

    // ── 피킹 실행 ─────────────────────────────────────────────
    const handleExecClick = () => {
        const n = Number(qty);
        if (!(n >= 1) || n > task.remainQty) {
            toast.error(`피킹수량은 1 이상, 잔량(${num(task.remainQty)}) 이하여야 합니다.`);
            return;
        }
        doExec(n);
    };

    const doExec = async (n) => {
        if (busy) return; // Enter 연타로 같은 실행이 두 번 나가는 것을 막는다 — 실적 취소가 없다
        setBusy(true);
        try {
            const res = await outbPikngApi.execute([{ pikngTaskId: task.taskId, qty: n }]);
            const done = res.orderChanges.filter(c => c.status === 'PICKED');
            okFeedback();
            toast.success(`${num(n)}개를 피킹했습니다`
                + (done.length > 0 ? ` — 피킹완료 주문 ${done.map(c => c.outbNo).join(', ')}` : ''));
            // 재조회 실패는 인터셉터가 알린다 — 여기서 삼키지 않으면 성공한 피킹이 실패 토스트로 둔갑한다
            const stayed = await afterAction(task).catch(() => null);
            // 잔량이 남았으면 그 자리에서 처리 방법을 묻는다 — 결품이 잦은 현장에서 확정 왕복을 줄인다
            if (stayed) setAskShort(stayed);
        } catch (e) {
            toast.error(e.message || '피킹에 실패했습니다.');
        } finally {
            setBusy(false);
        }
    };

    // ── 결품 종결 ─────────────────────────────────────────────
    const handleCloseShortClick = () => {
        // 실적 0인 지시는 종결이 아니라 지시취소 대상 — 웹 피킹 화면과 같은 갈림길이다
        if (task.cmplQty === 0) {
            toast.error('한 개도 집지 않은 지시입니다 — 결품 종결이 아니라 웹 피킹지시 화면에서 「지시취소」하세요.');
            return;
        }
        setCloseShort({ rsnCd: '', rsnDscr: '' });
    };

    const doCloseShort = async ({ rsnCd, rsnDscr }) => {
        if (busy) return;
        setBusy(true);
        try {
            const res = await outbPikngApi.closeShort([{
                pikngTaskId: task.taskId,
                rsnCd,
                rsnDscr: rsnCd === ETC_RSN_CD ? rsnDscr.trim() : null,
            }]);
            const done = res.orderChanges.filter(c => c.status === 'PICKED');
            toast.success(`잔량 ${num(res.shotgeQty)}개를 결품으로 닫았습니다 (예약 반환)`
                + (done.length > 0 ? ` — 피킹완료 주문 ${done.map(c => c.outbNo).join(', ')}` : ''));
            await afterAction(task).catch(() => {});
        } catch (e) {
            toast.error(e.message || '결품 종결에 실패했습니다.');
        } finally {
            setBusy(false);
        }
    };

    // ── 웨이브 목록 ───────────────────────────────────────────
    if (!wave) {
        return (
            <div className="flex flex-col gap-3 h-full">
                <div className="flex items-center gap-2">
                    <PackageOpen size={18} className="text-indigo-600" />
                    <h2 className="text-lg font-bold text-slate-800">피킹</h2>
                    <span className="text-xs text-slate-400 mt-0.5">피킹지시 발행분</span>
                    <button onClick={() => fetchWaves().catch(() => {})} className="btn-ghost ml-auto">
                        <RefreshCw size={13} /> 새로고침
                    </button>
                </div>
                {/* 구역 필터 — 집품 구역을 나눠 붙일 때 내 구역 지시만 받는다 (웹 피킹의 로케이션 검색과 같은 의미) */}
                <div className="relative shrink-0">
                    <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={locKw}
                        onChange={(e) => changeLocKw(e.target.value)}
                        placeholder="구역 필터 — 예: DRY-A (내 구역 지시만)"
                        className="input-base w-full pl-9 py-3"
                    />
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                    {waves.length === 0 && (
                        <p className="text-sm text-slate-400 text-center mt-12">발행된 웨이브가 없습니다</p>
                    )}
                    {waves.map(w => <WaveCard key={w.wavId} wave={w} onOpen={() => openWave(w)} />)}
                </div>
            </div>
        );
    }

    // ── 완료 화면 (집을 지시 없음) ────────────────────────────
    if (!task) {
        const filteredOut = workableAll.length > 0; // 구역 필터가 다 걸러낸 경우
        return (
            <div className="flex flex-col h-full">
                <TaskTopBar wave={wave} doneCount={doneCount} total={rows.length} onBack={backToWaves} />
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
                    <CheckCircle2 size={48} className={filteredOut || blockedCount > 0 ? 'text-amber-400' : 'text-emerald-500'} />
                    <p className="text-sm font-bold text-slate-700">
                        {filteredOut
                            ? `구역 「${locKw.trim()}」에 남은 지시가 없습니다 — 다른 구역 ${workableAll.length}건`
                            : blockedCount > 0
                                ? `집을 수 있는 지시가 없습니다 — 보충 대기 ${blockedCount}건`
                                : '이 웨이브의 피킹이 모두 끝났습니다'}
                    </p>
                    {!filteredOut && blockedCount > 0 && (
                        <p className="text-xs text-slate-500">보충이 확정되면 다시 조회하세요</p>
                    )}
                    <div className="flex gap-2 mt-2">
                        {filteredOut && (
                            <button onClick={() => changeLocKw('')} className="btn-ghost py-2.5">필터 해제</button>
                        )}
                        <button onClick={() => openWave(wave)} className="btn-ghost py-2.5">
                            <RefreshCw size={13} /> 다시 조회
                        </button>
                        <button onClick={backToWaves} className="btn-primary py-2.5">웨이브 목록</button>
                    </div>
                </div>
            </div>
        );
    }

    // ── 집품 화면 ─────────────────────────────────────────────
    const storeColor = storeColorOf.get(task.storeNm ?? '—') ?? 'bg-slate-300';
    return (
        <div className="flex flex-col gap-3 h-full">
            <TaskTopBar wave={wave} doneCount={doneCount} total={rows.length} onBack={backToWaves} />

            {locKw.trim() && (
                <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 shrink-0">
                    구역 「{locKw.trim()}」 지시만 보는 중 · 남은 {openTasks.length}건
                </p>
            )}
            {blockedCount > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 shrink-0">
                    보충 대기 {blockedCount}건은 순서에서 빠져 있습니다 — 보충 확정 후 다시 조회하세요
                </p>
            )}

            <StepChips steps={STEPS} current={step} />

            {/* 지시 카드 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shrink-0">
                <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600 shrink-0">
                        순번 {task.srtSeq}
                    </span>
                    <span className="text-slate-400 truncate">{task.outbNo}</span>
                </div>

                <div className={`flex items-center gap-2 rounded-xl px-3 py-3
                    ${step === 'LOC' ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-50'}`}>
                    <MapPin size={22} className="text-indigo-600 shrink-0" />
                    <span className="text-3xl font-black tracking-wide text-slate-800 truncate">{task.locCd}</span>
                </div>

                <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5
                    ${step === 'PROD' ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-50'}`}>
                    <ProdThumb src={task.prodImgUrl} alt={task.prodNm} size={48} />
                    <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{task.prodNm}</p>
                        <p className="text-xs text-slate-500 truncate">{task.prodCd}</p>
                    </div>
                </div>

                <div className={`flex items-center gap-2 rounded-xl px-3 py-2
                    ${step === 'LOT' ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-50'}`}>
                    <span className="text-xs font-bold text-slate-400 shrink-0">Lot</span>
                    <span className="font-bold text-slate-700 truncate">{task.lotNo}</span>
                    <span className="ml-auto text-xs text-slate-500 shrink-0">
                        {task.expiryDt ? `유통기한 ${fmtDe(task.expiryDt)}` : '유통기한 미관리'}
                    </span>
                </div>

                {/* 담을 곳 — 한 웨이브에 여러 납품처가 섞이므로 지시마다 다르다. 색은 점포 식별용 */}
                <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-slate-50">
                    <span className={`h-3 w-3 rounded-full shrink-0 ${storeColor}`} />
                    <span className="text-xs font-bold text-slate-400 shrink-0">담을 곳</span>
                    <span className="font-bold text-slate-700 truncate">{task.storeNm ?? '—'}</span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center">
                    <StatBox label="지시" value={num(task.drctQty)} />
                    <StatBox label="기피킹" value={num(task.cmplQty)} tone={task.cmplQty > 0 ? 'text-emerald-600' : ''} />
                    <StatBox label="잔량" value={num(task.remainQty)} tone="text-amber-600" big />
                </div>
            </div>

            {/* 단계별 입력 — LOC·PROD·LOT은 스캔, QTY는 수량 확정 */}
            {step !== 'QTY' ? (
                <ScanRow
                    ref={scanRef} value={scanVal} onChange={setScanVal} onCommit={handleScan} onSkip={pass}
                    placeholder={step === 'LOC' ? '로케이션 스캔'
                        : step === 'PROD' ? '상품 바코드 스캔' : 'Lot 바코드 스캔'}
                />
            ) : (
                <div className="flex flex-col gap-2 shrink-0">
                    <QtyStepper ref={qtyRef} qty={qty} onChange={setQty} onSubmit={handleExecClick} max={task.remainQty} />
                    <button onClick={handleExecClick} disabled={busy}
                            className="btn-primary justify-center py-3.5 text-base rounded-xl">
                        <PackageOpen size={18} /> 피킹 확인
                    </button>
                </div>
            )}

            {/* 하단 보조 동작 */}
            <div className="mt-auto flex gap-2 shrink-0">
                <button onClick={skip} className="btn-ghost flex-1 justify-center py-3">
                    <SkipForward size={14} /> 건너뛰기
                </button>
                <button onClick={handleCloseShortClick} disabled={busy}
                        className="btn-danger flex-1 justify-center py-3">
                    <PackageX size={14} /> 결품 종결
                </button>
            </div>

            {/* 부분 피킹 직후 잔량 문답 — 더 집을지, 결품으로 닫을지 그 자리에서 고른다 */}
            {askShort && (
                <div className="fixed inset-0 z-50 bg-black/30 flex items-end" onMouseDown={() => setAskShort(null)}>
                    <div className="w-full bg-white rounded-t-2xl p-4 pb-6 flex flex-col gap-3"
                         onMouseDown={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-slate-800">
                            잔량 {num(askShort.remainQty)}개가 남았습니다
                        </h3>
                        <p className="text-sm text-slate-500">
                            실물이 더 있으면 나중에 다시 집으세요. 시킨 만큼 실물이 없으면 결품으로 닫습니다 — 사유는 다음 화면에서 받습니다.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setAskShort(null)} className="btn-modal-cancel flex-1">
                                나중에 다시 집기
                            </button>
                            <button onClick={() => { setAskShort(null); setCloseShort({ rsnCd: '', rsnDscr: '' }); }}
                                    className="flex-1 px-4 py-2 text-sm font-bold rounded-lg bg-rose-600 text-white active:bg-rose-700">
                                결품 종결
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {closeShort && (
                <ShortCloseSheet
                    task={task}
                    options={shotgeRsn.selectOptions}
                    value={closeShort}
                    setValue={setCloseShort}
                    busy={busy}
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
                />
            )}
        </div>
    );
}

/** 집품·완료 화면 공통 상단바 — 뒤로가기 + 웨이브번호 + 진행 집계 */
function TaskTopBar({ wave, doneCount, total, onBack }) {
    return (
        <div className="flex items-center gap-1 shrink-0">
            <button onClick={onBack} aria-label="웨이브 목록으로"
                    className="p-1.5 -ml-1.5 rounded-lg text-slate-500 active:bg-slate-200">
                <ChevronLeft size={20} />
            </button>
            <span className="font-bold text-slate-800 text-sm truncate">{wave.wavNo}</span>
            <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
                완료 {doneCount} / {total}건
            </span>
        </div>
    );
}

/** 웨이브 목록 카드 — 터치 목표가 커야 해서 그리드 대신 카드다 */
function WaveCard({ wave, onOpen }) {
    const pct = wave.drctQty > 0 ? Math.round((wave.cmplQty / wave.drctQty) * 100) : 0;
    const done = wave.remainQty === 0;
    return (
        <button onClick={onOpen}
                className={`text-left bg-white border rounded-xl p-4 active:bg-indigo-50 transition-colors shrink-0
                    ${done ? 'border-slate-100 opacity-50' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 truncate">{wave.wavNo}</span>
                <span className={`ml-auto text-xs font-bold shrink-0 ${done ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {done ? '완료' : `잔량 ${num(wave.remainQty)}`}
                </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                <span>지시 {num(wave.drctQty)}</span>
                <span className={wave.cmplQty > 0 ? 'text-emerald-600' : ''}>피킹 {num(wave.cmplQty)}</span>
                {wave.openTaskCount > 0 && (
                    <span className="text-indigo-600 font-bold">미종결 {num(wave.openTaskCount)}</span>
                )}
                <span className="ml-auto">{fmtDe(wave.expctDe)}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
            </div>
        </button>
    );
}

/** 결품 종결 바텀시트 — 사유를 받고 되돌릴 수 없음을 짚는다 (웹 화면의 결품 모달과 같은 규칙) */
function ShortCloseSheet({ task, options, value, setValue, busy, onCancel, onConfirm }) {
    return (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end" onMouseDown={onCancel}>
            <div className="w-full bg-white rounded-t-2xl p-4 pb-6 flex flex-col gap-3"
                 onMouseDown={(e) => e.stopPropagation()}>
                <h3 className="text-base font-bold text-slate-800">결품으로 닫을까요?</h3>
                <p className="text-sm text-slate-500">
                    잔량 <b className="text-rose-600">{num(task.remainQty)}</b>개를 결품으로 닫습니다 —
                    지시·할당수량이 집품한 만큼으로 내려가고 <b>예약이 풀립니다.</b> 되돌릴 수 없습니다.
                </p>
                <select
                    value={value.rsnCd}
                    onChange={(e) => setValue({ ...value, rsnCd: e.target.value })}
                    className="input-base w-full py-3"
                >
                    <option value="">사유 선택</option>
                    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {value.rsnCd === ETC_RSN_CD && (
                    <input
                        type="text" maxLength={200} autoFocus
                        value={value.rsnDscr}
                        onChange={(e) => setValue({ ...value, rsnDscr: e.target.value })}
                        className="input-base w-full py-3" placeholder="결품 사유를 입력하세요"
                    />
                )}
                <div className="flex gap-2">
                    <button onClick={onCancel} className="btn-modal-cancel flex-1">취소</button>
                    <button onClick={onConfirm} disabled={busy}
                            className="flex-1 px-4 py-2 text-sm font-bold rounded-lg bg-rose-600 text-white
                                       active:bg-rose-700 disabled:opacity-40">
                        결품 종결
                    </button>
                </div>
            </div>
        </div>
    );
}
