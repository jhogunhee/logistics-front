import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Layers, MapPin, RefreshCw, SkipForward } from 'lucide-react';
import toast from 'react-hot-toast';

import { putawayApi } from '@/api/putawayApi';
import { useScanFlow } from '@/hooks/useScanFlow';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { fmtDe, num } from '@/utils/format';
import { okFeedback } from '@/utils/scanFeedback';
import { Badge } from '@/components/common/Badge';
import { QtyStepper } from '@/components/mobile/QtyStepper';
import { ScanRow } from '@/components/mobile/ScanRow';
import { StatBox } from '@/components/mobile/StatBox';
import { StepChips } from '@/components/mobile/StepChips';

/**
 * 적치 단계 — 피킹과 순서가 반대다. 스테이지에서 <b>맞는 물건을 집는 확인(상품·Lot)이 먼저</b>이고,
 * 지시된 자리에 도착했다는 확인(로케이션)이 마지막이다.
 */
const STEPS = [
    { key: 'PROD', label: '상품' },
    { key: 'LOT', label: 'Lot' },
    { key: 'LOC', label: '로케이션' },
    { key: 'QTY', label: '수량' },
];

/** 단계별 대조 대상 — 무엇과 맞춰 보고 틀리면 뭐라고 알릴지. 단계 진행 자체는 useScanFlow가 한다 */
const MATCHERS = {
    PROD: { of: t => t.prodCd, fail: t => `상품이 다릅니다 — ${t.prodCd} ${t.prodNm}` },
    LOT: { of: t => t.lotNo, fail: t => `Lot이 다릅니다 — ${t.lotNo} (유통기한 ${fmtDe(t.expiryDt) || '미관리'})` },
    LOC: { of: t => t.toLocCd, fail: t => `로케이션이 다릅니다 — ${t.toLocCd} 위치로 가세요` },
};

const LOC_KEY = 'mputaway.locKw';

/**
 * 적치 실행 (PDA — /m). 웹 적치 화면과 같은 API를 쓰되, RF 표준대로 <b>한 번에 한 지시</b>를
 * 서버 순서(유통기한 임박순 = FEFO) 그대로 소진한다. 지시 발행·로케이션 변경·취소는 웹 화면의
 * 몫이고 이 화면은 실행만 한다 — 지시받은 자리에 못 넣는 상황도 웹에서 지시를 고친 뒤 재조회한다.
 */
export default function MobilePutaway() {
    const [tasks, setTasks] = useState([]);
    const [locKw, setLocKw] = useState(() => sessionStorage.getItem(LOC_KEY) ?? '');
    const [qty, setQty] = useState('');
    const [busy, setBusy] = useState(false);
    const qtyRef = useRef(null);

    // 서버가 DIRECTED만, 유통기한 임박순으로 준다 — 이 순서가 곧 작업 순서(FEFO)다
    const filtered = useMemo(() => {
        const kw = locKw.trim().toLowerCase();
        return kw ? tasks.filter(t => (t.toLocCd ?? '').toLowerCase().includes(kw)) : tasks;
    }, [tasks, locKw]);

    const { task, queue, step, scanVal, setScanVal, scanRef, handleScan, pass, skip, goTo, stay } = useScanFlow({
        steps: STEPS,
        queue: filtered,
        idOf: t => t.putawayTaskId,
        matchers: MATCHERS,
        onReachTerminal: (t) => setQty(String(t.remainingQty)),
        terminalRef: qtyRef,
    });

    const remainTotal = useMemo(() => queue.reduce((s, t) => s + t.remainingQty, 0), [queue]);

    const fetchTasks = () => putawayApi.tasks({ status: 'DIRECTED' }).then(setTasks);

    const changeLocKw = (v) => {
        setLocKw(v);
        sessionStorage.setItem(LOC_KEY, v);
    };

    useEffect(() => {
        fetchTasks().catch(() => {});
    }, []);

    /** 실행 뒤 재조회 — 같은 지시에 잔여가 남으면 그 자리에 머물고, 닫혔으면 맨 위(FEFO)로 돌아간다 */
    const afterAction = async (prev) => {
        const fresh = await putawayApi.tasks({ status: 'DIRECTED' });
        setTasks(fresh);
        const cur = fresh.find(t => t.putawayTaskId === prev.putawayTaskId);
        if (cur && cur.remainingQty > 0) {
            stay(cur);
            return;
        }
        goTo(null); // 큐 맨 앞 — 건너뛴 지시는 뒤로 밀려 있어 다시 걸리지 않는다
    };

    // ── 적치 실행 ─────────────────────────────────────────────
    const handleExecClick = () => {
        const n = Number(qty);
        if (!(n >= 1) || n > task.remainingQty) {
            toast.error(`적치수량은 1 이상, 잔여(${num(task.remainingQty)}) 이하여야 합니다.`);
            return;
        }
        doExec(n);
    };

    const doExec = async (n) => {
        if (busy) return; // Enter 연타로 같은 실행이 두 번 나가는 것을 막는다
        setBusy(true);
        try {
            await putawayApi.execute(task.putawayTaskId, n);
            okFeedback();
            toast.success(`${num(n)}개를 ${task.toLocCd}에 적치했습니다`);
            // 재조회 실패는 인터셉터가 알린다 — 여기서 삼키지 않으면 성공한 적치가 실패 토스트로 둔갑한다
            await afterAction(task).catch(() => {});
        } catch (e) {
            toast.error(e.message || '적치에 실패했습니다.');
        } finally {
            setBusy(false);
        }
    };

    // ── 상단바 (빈 화면과 공유) ────────────────────────────────
    const topBar = (
        <div className="flex items-center gap-1 shrink-0">
            <Link to="/m" aria-label="작업 선택으로"
                  className="p-1.5 -ml-1.5 rounded-lg text-slate-500 active:bg-slate-200">
                <ChevronLeft size={20} />
            </Link>
            <Layers size={16} className="text-indigo-600" />
            <span className="font-bold text-slate-800 text-sm">적치</span>
            <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
                남은 지시 {queue.length}건 · {num(remainTotal)}개
            </span>
        </div>
    );

    // ── 빈 화면 (실행할 지시 없음) ────────────────────────────
    if (!task) {
        const filteredOut = tasks.length > 0; // 구역 필터가 다 걸러낸 경우
        return (
            <div className="flex flex-col h-full">
                {topBar}
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
                    <CheckCircle2 size={48} className={filteredOut ? 'text-amber-400' : 'text-emerald-500'} />
                    <p className="text-sm font-bold text-slate-700">
                        {filteredOut
                            ? `구역 「${locKw.trim()}」에 남은 지시가 없습니다 — 다른 구역 ${tasks.length}건`
                            : '실행할 적치지시가 없습니다'}
                    </p>
                    {!filteredOut && (
                        <p className="text-xs text-slate-500">지시 발행은 데스크톱 「적치지시」 화면에서 합니다</p>
                    )}
                    <div className="flex gap-2 mt-2">
                        {filteredOut && (
                            <button onClick={() => changeLocKw('')} className="btn-ghost py-2.5">필터 해제</button>
                        )}
                        <button onClick={() => fetchTasks().catch(() => {})} className="btn-ghost py-2.5">
                            <RefreshCw size={13} /> 다시 조회
                        </button>
                        <Link to="/m" className="btn-primary py-2.5">작업 선택</Link>
                    </div>
                </div>
            </div>
        );
    }

    // ── 적치 화면 ─────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-3 h-full">
            {topBar}

            {/* 구역 필터 — 적치 구역을 나눠 붙일 때 내 구역(대상 로케이션) 지시만 받는다 */}
            <div className="relative shrink-0">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    value={locKw}
                    onChange={(e) => changeLocKw(e.target.value)}
                    placeholder="구역 필터 — 예: DRY-A (내 구역 지시만)"
                    className="input-base w-full pl-9 py-2.5"
                />
            </div>

            <StepChips steps={STEPS} current={step} />

            {/* 지시 카드 — 집는 것(상품·Lot)이 위, 가는 곳(로케이션)이 아래. 단계 순서와 같다 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shrink-0">
                <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600 shrink-0">
                        RCV-STAGE
                    </span>
                    <span className="text-slate-400 truncate">{task.ibNo}</span>
                    <span className="ml-auto shrink-0">
                        <Badge meta={TEMP_ZONE_META} value={task.tmpZon} />
                    </span>
                </div>

                {/* 적치지시 응답에는 상품 이미지가 없다 (웹 적치 화면도 텍스트만) — 썸네일 없이 크게 적는다 */}
                <div className={`rounded-xl px-3 py-2.5
                    ${step === 'PROD' ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-50'}`}>
                    <p className="font-bold text-slate-800 text-lg leading-snug">{task.prodNm}</p>
                    <p className="text-xs text-slate-500">{task.prodCd}</p>
                </div>

                <div className={`flex items-center gap-2 rounded-xl px-3 py-2
                    ${step === 'LOT' ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-50'}`}>
                    <span className="text-xs font-bold text-slate-400 shrink-0">Lot</span>
                    <span className="font-bold text-slate-700 truncate">{task.lotNo}</span>
                    <span className="ml-auto text-xs text-slate-500 shrink-0">
                        {task.expiryDt ? `유통기한 ${fmtDe(task.expiryDt)}` : '유통기한 미관리'}
                    </span>
                </div>

                <div className={`flex items-center gap-2 rounded-xl px-3 py-3
                    ${step === 'LOC' ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-50'}`}>
                    <MapPin size={22} className="text-indigo-600 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[11px] text-slate-400 leading-none mb-1">대상 로케이션</p>
                        <p className="text-3xl font-black tracking-wide text-slate-800 truncate leading-none">
                            {task.toLocCd}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center">
                    <StatBox label="지시" value={num(task.drctQty)} />
                    <StatBox label="완료" value={num(task.cmplQty)} tone={task.cmplQty > 0 ? 'text-emerald-600' : ''} />
                    <StatBox label="잔여" value={num(task.remainingQty)} tone="text-amber-600" big />
                </div>
            </div>

            {/* 단계별 입력 — PROD·LOT·LOC은 스캔, QTY는 수량 확정 */}
            {step !== 'QTY' ? (
                <ScanRow
                    ref={scanRef} value={scanVal} onChange={setScanVal} onCommit={handleScan} onSkip={pass}
                    placeholder={step === 'PROD' ? '상품 바코드 스캔'
                        : step === 'LOT' ? 'Lot 바코드 스캔' : '대상 로케이션 스캔'}
                />
            ) : (
                <div className="flex flex-col gap-2 shrink-0">
                    <QtyStepper ref={qtyRef} qty={qty} onChange={setQty} onSubmit={handleExecClick} max={task.remainingQty} />
                    <button onClick={handleExecClick} disabled={busy}
                            className="btn-primary justify-center py-3.5 text-base rounded-xl">
                        <Layers size={18} /> 적치 확인
                    </button>
                </div>
            )}

            {/* 하단 보조 동작 — 결품 종결 같은 예외 출구가 없다. 자리 문제는 웹에서 지시를 고친다 */}
            <div className="mt-auto flex flex-col gap-1.5 shrink-0">
                <button onClick={skip} className="btn-ghost justify-center py-3">
                    <SkipForward size={14} /> 건너뛰기
                </button>
                <p className="text-[11px] text-slate-400 text-center">
                    지시받은 자리에 못 넣으면 데스크톱 「적치」 화면에서 로케이션 변경 후 다시 조회하세요
                </p>
            </div>
        </div>
    );
}
