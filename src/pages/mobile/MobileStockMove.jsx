import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, CheckCircle2, ChevronLeft, MapPin, RefreshCw, SkipForward } from 'lucide-react';
import toast from 'react-hot-toast';

import { invMovApi } from '@/api/invMovApi';
import { INV_MOV_DVSN_META } from '@/constants/badgeMeta';
import { fmtDe, num } from '@/utils/format';
import { failFeedback, okFeedback } from '@/utils/scanFeedback';
import { Badge } from '@/components/common/Badge';
import { QtyStepper } from '@/components/mobile/QtyStepper';
import { ScanRow } from '@/components/mobile/ScanRow';
import { StatBox } from '@/components/mobile/StatBox';
import { StepChips } from '@/components/mobile/StepChips';

/**
 * 이동 단계 — 출발지에서 맞는 물건을 집는 확인(출발·상품·Lot)이 앞이고,
 * 도착지에 왔다는 확인(도착)이 그 다음, 수량 확정이 마지막이다.
 */
const STEPS = [
    { key: 'FROM', label: '출발' },
    { key: 'PROD', label: '상품' },
    { key: 'LOT', label: 'Lot' },
    { key: 'TO', label: '도착' },
    { key: 'QTY', label: '수량' },
];

const LOC_KEY = 'mmove.locKw';

/**
 * PDA가 확정하는 유형 — 웹 이동지시 관리 화면과 같은 규칙(재고이동·정기보충).
 * 수시보충(RPLN)은 피킹 짝 지시라 자기 화면(웹 수시보충) 몫이다.
 */
const isWorkable = (r) => ['INV_MOV', 'SPMT'].includes(r.movDvsn) && r.status === 'DIRECTED' && r.remainingQty > 0;

/**
 * 재고이동 확정 (PDA — /m). 웹 이동지시 관리 화면과 같은 API를 쓰되, RF 표준대로
 * <b>한 번에 한 지시</b>를 소진한다. 지시 등록(예약)·잔량 취소는 웹 화면의 몫이고
 * 이 화면은 확정(실물 MOVE)만 한다.
 */
export default function MobileStockMove() {
    const [tasks, setTasks] = useState([]);
    const [curTaskId, setCurTaskId] = useState(null);
    const [locKw, setLocKw] = useState(() => sessionStorage.getItem(LOC_KEY) ?? '');
    const [step, setStep] = useState('FROM');
    const [scanVal, setScanVal] = useState('');
    const [qty, setQty] = useState('');
    const [busy, setBusy] = useState(false);
    const scanRef = useRef(null);
    const qtyRef = useRef(null);

    const workableAll = useMemo(() => tasks.filter(isWorkable), [tasks]);
    // 구역 필터는 출발 로케이션 기준 — 작업이 시작되는 곳이 작업자의 구역이다
    const queue = useMemo(() => {
        const kw = locKw.trim().toLowerCase();
        return kw ? workableAll.filter(t => (t.fromLocCd ?? '').toLowerCase().includes(kw)) : workableAll;
    }, [workableAll, locKw]);
    const remainTotal = useMemo(() => queue.reduce((s, t) => s + t.remainingQty, 0), [queue]);
    const task = queue.find(t => t.invMovTaskId === curTaskId) ?? queue[0] ?? null;

    const fetchTasks = () => invMovApi.list({ status: 'DIRECTED' }).then(setTasks);

    const changeLocKw = (v) => {
        setLocKw(v);
        sessionStorage.setItem(LOC_KEY, v);
    };

    useEffect(() => {
        fetchTasks().catch(() => {});
    }, []);

    // 단계·지시가 바뀔 때마다 입력에 포커스 — 스캐너(키보드 웨지) 입력이 바로 실리게 한다
    useEffect(() => {
        if (!task) return;
        (step === 'QTY' ? qtyRef : scanRef).current?.focus();
    }, [step, task?.invMovTaskId]);

    // ── 스캔 확인 ─────────────────────────────────────────────
    const scanFail = (msg) => {
        failFeedback();
        toast.error(msg);
        setScanVal('');
        scanRef.current?.focus();
    };

    const passStep = () => {
        okFeedback();
        setScanVal('');
        if (step === 'FROM') {
            setStep('PROD');
        } else if (step === 'PROD') {
            setStep('LOT');
        } else if (step === 'LOT') {
            setStep('TO');
        } else if (step === 'TO') {
            setQty(String(task.remainingQty));
            setStep('QTY');
        }
    };

    const handleScan = () => {
        const v = scanVal.trim().toUpperCase();
        if (!v || !task) return;
        if (step === 'FROM') {
            if (v === String(task.fromLocCd).toUpperCase()) passStep();
            else scanFail(`출발 로케이션이 다릅니다 — ${task.fromLocCd} 위치로 가세요`);
        } else if (step === 'PROD') {
            if (v === String(task.prodCd).toUpperCase()) passStep();
            else scanFail(`상품이 다릅니다 — ${task.prodCd} ${task.prodNm}`);
        } else if (step === 'LOT') {
            if (v === String(task.lotNo).toUpperCase()) passStep();
            else scanFail(`Lot이 다릅니다 — ${task.lotNo} (유통기한 ${fmtDe(task.expiryDt) || '미관리'})`);
        } else if (step === 'TO') {
            if (v === String(task.toLocCd).toUpperCase()) passStep();
            else scanFail(`도착 로케이션이 다릅니다 — ${task.toLocCd} 위치로 가세요`);
        }
    };

    const skipTask = () => {
        if (queue.length < 2) {
            toast('건너뛸 다음 지시가 없습니다.');
            return;
        }
        const i = queue.findIndex(t => t.invMovTaskId === task.invMovTaskId);
        setCurTaskId(queue[(i + 1) % queue.length].invMovTaskId);
        setStep('FROM');
        setScanVal('');
    };

    /** 확정 뒤 재조회 — 같은 지시에 잔여가 남으면 그 자리에 머물고, 닫혔으면 목록 맨 위로 돌아간다 */
    const afterAction = async (prev) => {
        const fresh = await invMovApi.list({ status: 'DIRECTED' });
        setTasks(fresh);
        const cur = fresh.find(t => t.invMovTaskId === prev.invMovTaskId);
        if (cur && isWorkable(cur)) {
            setQty(String(cur.remainingQty));
            setStep('QTY');
            return;
        }
        setCurTaskId(null); // 파생값이 목록 맨 위 지시로 떨어진다
        setStep('FROM');
        setScanVal('');
    };

    // ── 이동확정 ──────────────────────────────────────────────
    const handleExecClick = () => {
        const n = Number(qty);
        if (!(n >= 1) || n > task.remainingQty) {
            toast.error(`확정수량은 1 이상, 잔여(${num(task.remainingQty)}) 이하여야 합니다.`);
            return;
        }
        doExec(n);
    };

    const doExec = async (n) => {
        if (busy) return; // Enter 연타로 같은 확정이 두 번 나가는 것을 막는다
        setBusy(true);
        try {
            await invMovApi.confirm([{ taskId: task.invMovTaskId, qty: n }]);
            okFeedback();
            toast.success(`${num(n)}개를 ${task.toLocCd}로 이동 확정했습니다`);
            // 재조회 실패는 인터셉터가 알린다 — 여기서 삼키지 않으면 성공한 확정이 실패 토스트로 둔갑한다
            await afterAction(task).catch(() => {});
        } catch (e) {
            toast.error(e.message || '이동확정에 실패했습니다.');
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
            <ArrowLeftRight size={16} className="text-indigo-600" />
            <span className="font-bold text-slate-800 text-sm">재고이동</span>
            <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
                남은 지시 {queue.length}건 · {num(remainTotal)}개
            </span>
        </div>
    );

    // ── 빈 화면 (확정할 지시 없음) ────────────────────────────
    if (!task) {
        const filteredOut = workableAll.length > 0; // 구역 필터가 다 걸러낸 경우
        return (
            <div className="flex flex-col h-full">
                {topBar}
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
                    <CheckCircle2 size={48} className={filteredOut ? 'text-amber-400' : 'text-emerald-500'} />
                    <p className="text-sm font-bold text-slate-700">
                        {filteredOut
                            ? `구역 「${locKw.trim()}」에 남은 지시가 없습니다 — 다른 구역 ${workableAll.length}건`
                            : '확정할 이동지시가 없습니다'}
                    </p>
                    {!filteredOut && (
                        <p className="text-xs text-slate-500">지시 등록은 데스크톱 「재고 이동」 화면에서 합니다</p>
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

    // ── 이동 화면 ─────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-3 h-full">
            {topBar}

            {/* 구역 필터 — 이동 구역을 나눠 붙일 때 내 구역(출발 로케이션) 지시만 받는다 */}
            <div className="relative shrink-0">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    value={locKw}
                    onChange={(e) => changeLocKw(e.target.value)}
                    placeholder="구역 필터 — 출발 로케이션 기준 (예: DRY-A)"
                    className="input-base w-full pl-9 py-2.5"
                />
            </div>

            <StepChips steps={STEPS} current={step} />

            {/* 지시 카드 — 집는 곳(출발·상품·Lot)이 위, 가는 곳(도착)이 아래. 단계 순서와 같다 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shrink-0">
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 truncate">{task.invMovNo}</span>
                    <span className="ml-auto shrink-0">
                        <Badge meta={INV_MOV_DVSN_META} value={task.movDvsn} show="label" />
                    </span>
                </div>

                <div className={`flex items-center gap-2 rounded-xl px-3 py-3
                    ${step === 'FROM' ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-50'}`}>
                    <MapPin size={22} className="text-indigo-600 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[11px] text-slate-400 leading-none mb-1">출발 로케이션</p>
                        <p className="text-3xl font-black tracking-wide text-slate-800 truncate leading-none">
                            {task.fromLocCd}
                        </p>
                    </div>
                </div>

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
                    ${step === 'TO' ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-50'}`}>
                    <ArrowRight size={22} className="text-indigo-600 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[11px] text-slate-400 leading-none mb-1">도착 로케이션</p>
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

            {/* 단계별 입력 — FROM·PROD·LOT·TO는 스캔, QTY는 수량 확정 */}
            {step !== 'QTY' ? (
                <ScanRow
                    ref={scanRef} value={scanVal} onChange={setScanVal} onCommit={handleScan} onSkip={passStep}
                    placeholder={step === 'FROM' ? '출발 로케이션 스캔'
                        : step === 'PROD' ? '상품 바코드 스캔'
                            : step === 'LOT' ? 'Lot 바코드 스캔' : '도착 로케이션 스캔'}
                />
            ) : (
                <div className="flex flex-col gap-2 shrink-0">
                    <QtyStepper ref={qtyRef} qty={qty} onChange={setQty} onSubmit={handleExecClick} max={task.remainingQty} />
                    <button onClick={handleExecClick} disabled={busy}
                            className="btn-primary justify-center py-3.5 text-base rounded-xl">
                        <ArrowLeftRight size={18} /> 이동 확정
                    </button>
                </div>
            )}

            {/* 하단 보조 동작 — 잔량 취소는 예약을 푸는 관리 동작이라 웹 몫이다 */}
            <div className="mt-auto flex flex-col gap-1.5 shrink-0">
                <button onClick={skipTask} className="btn-ghost justify-center py-3">
                    <SkipForward size={14} /> 건너뛰기
                </button>
                <p className="text-[11px] text-slate-400 text-center">
                    이동을 무르려면(잔량 취소) 데스크톱 「재고 이동」 화면에서 처리하세요
                </p>
            </div>
        </div>
    );
}
