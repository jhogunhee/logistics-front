import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, MapPin, PackagePlus, RefreshCw, SkipForward } from 'lucide-react';
import toast from 'react-hot-toast';

import { rplnApi } from '@/api/rplnApi';
import { fmtDe, num } from '@/utils/format';
import { failFeedback, okFeedback } from '@/utils/scanFeedback';
import { ScanRow } from '@/components/mobile/ScanRow';
import { StepChips } from '@/components/mobile/StepChips';

/**
 * 보충 단계 — 이동과 같은 순서(집는 확인 → 도착 확인)이되 수량 단계가 없다.
 * 보충은 할당분 <b>전량만</b> 확정하기 때문이다.
 */
const STEPS = [
    { key: 'FROM', label: '보관존' },
    { key: 'PROD', label: '상품' },
    { key: 'LOT', label: 'Lot' },
    { key: 'TO', label: '피킹존' },
    { key: 'CNFM', label: '확정' },
];

/** 진행 위치 복원용 sessionStorage 키 — 새로고침해도 보던 웨이브로 돌아온다 */
const WAV_KEY = 'mrpln.wavId';

/**
 * 수시보충 확정 (PDA — /m). 보충지시는 피킹지시 발행이 짝으로 만든 것이고, 이 화면은 그 지시를
 * 짝 피킹 순번 순으로 소진한다 — 확정해야 실물·예약이 보관존 → 피킹존으로 옮겨져 짝 피킹지시가
 * 실행될 수 있다. 보충 취소·재발행은 웹 수시보충·피킹지시 화면의 몫이다.
 */
export default function MobileReplenishment() {
    const [waves, setWaves] = useState([]);
    const [wave, setWave] = useState(null);          // 선택 웨이브 (없으면 웨이브 목록 화면)
    const [rows, setRows] = useState([]);
    const [curTaskId, setCurTaskId] = useState(null);
    const [step, setStep] = useState('FROM');
    const [scanVal, setScanVal] = useState('');
    const [busy, setBusy] = useState(false);
    const scanRef = useRef(null);

    const queue = useMemo(() => rows.filter(r => r.status === 'DIRECTED'), [rows]);
    const doneCount = rows.length - queue.length;
    const task = queue.find(t => t.rplnTaskId === curTaskId) ?? queue[0] ?? null;

    const fetchWaves = () => rplnApi.waves().then(setWaves);

    const openWave = async (w) => {
        const list = await rplnApi.rows(w.wavId).catch(() => null);
        if (!list) return;
        sessionStorage.setItem(WAV_KEY, String(w.wavId));
        setWave(w);
        setRows(list);
        setCurTaskId(null);
        setStep('FROM');
        setScanVal('');
    };

    const backToWaves = () => {
        sessionStorage.removeItem(WAV_KEY);
        setWave(null);
        setRows([]);
        setCurTaskId(null);
        fetchWaves().catch(() => {});
    };

    // 최초 조회 + 진행 위치 복원
    useEffect(() => {
        (async () => {
            const list = await rplnApi.waves().catch(() => null);
            if (!list) return;
            setWaves(list);
            const saved = Number(sessionStorage.getItem(WAV_KEY));
            const w = list.find(x => x.wavId === saved);
            if (w) await openWave(w);
        })();
    }, []);

    // 단계·지시가 바뀔 때마다 스캔 입력에 포커스 (확정 단계는 스캔이 없다)
    useEffect(() => {
        if (!task || step === 'CNFM') return;
        scanRef.current?.focus();
    }, [step, task?.rplnTaskId]);

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
            setStep('CNFM');
        }
    };

    const handleScan = (raw) => {
        const v = String(raw ?? '').trim().toUpperCase();
        if (!v || !task) return;
        if (step === 'FROM') {
            if (v === String(task.fromLocCd).toUpperCase()) passStep();
            else scanFail(`보관존 로케이션이 다릅니다 — ${task.fromLocCd} 위치로 가세요`);
        } else if (step === 'PROD') {
            if (v === String(task.prodCd).toUpperCase()) passStep();
            else scanFail(`상품이 다릅니다 — ${task.prodCd} ${task.prodNm}`);
        } else if (step === 'LOT') {
            if (v === String(task.lotNo).toUpperCase()) passStep();
            else scanFail(`Lot이 다릅니다 — ${task.lotNo} (유통기한 ${fmtDe(task.expiryDt) || '미관리'})`);
        } else if (step === 'TO') {
            if (v === String(task.toLocCd).toUpperCase()) passStep();
            else scanFail(`피킹존 로케이션이 다릅니다 — ${task.toLocCd} 위치로 가세요`);
        }
    };

    const skipTask = () => {
        if (queue.length < 2) {
            toast('건너뛸 다음 지시가 없습니다.');
            return;
        }
        const i = queue.findIndex(t => t.rplnTaskId === task.rplnTaskId);
        setCurTaskId(queue[(i + 1) % queue.length].rplnTaskId);
        setStep('FROM');
        setScanVal('');
    };

    // ── 보충 확정 (전량) ──────────────────────────────────────
    const doConfirm = async () => {
        if (busy) return; // 연타로 같은 확정이 두 번 나가는 것을 막는다
        setBusy(true);
        try {
            await rplnApi.confirm([task.rplnTaskId]);
            okFeedback();
            toast.success(`${task.prodNm} ${num(task.qty)}개를 ${task.toLocCd}로 보충했습니다 — 짝 피킹지시가 열립니다`);
            // 재조회 실패는 인터셉터가 알린다 — 여기서 삼키지 않으면 성공한 확정이 실패 토스트로 둔갑한다
            const prev = task;
            await rplnApi.rows(wave.wavId).then(fresh => {
                setRows(fresh);
                const opens = fresh.filter(r => r.status === 'DIRECTED');
                const next = opens.find(t => t.srtSeq > prev.srtSeq) ?? opens[0] ?? null;
                setCurTaskId(next?.rplnTaskId ?? null);
                setStep('FROM');
                setScanVal('');
            }).catch(() => {});
        } catch (e) {
            toast.error(e.message || '보충 확정에 실패했습니다.');
        } finally {
            setBusy(false);
        }
    };

    // ── 상단바 (빈 화면과 공유) ────────────────────────────────
    const topBar = (
        <div className="flex items-center gap-1 shrink-0">
            <button onClick={backToWaves} aria-label="웨이브 목록으로"
                    className="p-1.5 -ml-1.5 rounded-lg text-slate-500 active:bg-slate-200">
                <ChevronLeft size={20} />
            </button>
            <PackagePlus size={16} className="text-indigo-600" />
            <span className="font-bold text-slate-800 text-sm truncate">{wave?.wavNo}</span>
            <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
                확정 {doneCount} / {rows.length}건
            </span>
        </div>
    );

    // ── 웨이브 목록 ───────────────────────────────────────────
    if (!wave) {
        return (
            <div className="flex flex-col gap-3 h-full">
                <div className="flex items-center gap-2">
                    <PackagePlus size={18} className="text-indigo-600" />
                    <h2 className="text-lg font-bold text-slate-800">보충</h2>
                    <span className="text-xs text-slate-400 mt-0.5">보충지시가 있는 웨이브</span>
                    <button onClick={() => fetchWaves().catch(() => {})} className="btn-ghost ml-auto">
                        <RefreshCw size={13} /> 새로고침
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                    {waves.length === 0 && (
                        <p className="text-sm text-slate-400 text-center mt-12">
                            보충지시가 있는 웨이브가 없습니다 — 보충지시는 피킹지시 발행이 만듭니다
                        </p>
                    )}
                    {waves.map(w => <WaveCard key={w.wavId} wave={w} onOpen={() => openWave(w)} />)}
                </div>
            </div>
        );
    }

    // ── 완료 화면 (확정할 지시 없음) ──────────────────────────
    if (!task) {
        return (
            <div className="flex flex-col h-full">
                {topBar}
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
                    <CheckCircle2 size={48} className="text-emerald-500" />
                    <p className="text-sm font-bold text-slate-700">이 웨이브의 보충이 모두 확정됐습니다</p>
                    <p className="text-xs text-slate-500">짝 피킹지시들이 열렸습니다 — 피킹 화면에서 이어서 집품하세요</p>
                    <div className="flex gap-2 mt-2">
                        <button onClick={() => openWave(wave)} className="btn-ghost py-2.5">
                            <RefreshCw size={13} /> 다시 조회
                        </button>
                        <button onClick={backToWaves} className="btn-primary py-2.5">웨이브 목록</button>
                    </div>
                </div>
            </div>
        );
    }

    // ── 보충 화면 ─────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-3 h-full">
            {topBar}

            <StepChips steps={STEPS} current={step} />

            {/* 지시 카드 — 꺼내는 곳(보관존·상품·Lot)이 위, 넣는 곳(피킹존)이 아래 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shrink-0">
                <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600 shrink-0">
                        순번 {task.srtSeq}
                    </span>
                    <span className="text-slate-400 truncate">{task.invMovNo}</span>
                    <span className="ml-auto text-slate-500 truncate shrink-0">{task.outbNo}</span>
                </div>

                <div className={`flex items-center gap-2 rounded-xl px-3 py-3
                    ${step === 'FROM' ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-50'}`}>
                    <MapPin size={22} className="text-indigo-600 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[11px] text-slate-400 leading-none mb-1">보관존 (꺼내는 곳)</p>
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
                    <PackagePlus size={22} className="text-indigo-600 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[11px] text-slate-400 leading-none mb-1">피킹존 (넣는 곳)</p>
                        <p className="text-3xl font-black tracking-wide text-slate-800 truncate leading-none">
                            {task.toLocCd}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-slate-50">
                    <span className="text-xs font-bold text-slate-400 shrink-0">수량</span>
                    <span className="font-bold text-amber-600 tabular-nums text-lg">{num(task.qty)}개</span>
                    <span className="ml-auto text-xs text-slate-400 shrink-0">할당분 전량 — 나눠 옮길 수 없습니다</span>
                </div>
            </div>

            {/* 단계별 입력 — 확정 단계만 스캔이 없다 */}
            {step !== 'CNFM' ? (
                <ScanRow
                    ref={scanRef} value={scanVal} onChange={setScanVal} onCommit={handleScan} onSkip={passStep}
                    placeholder={step === 'FROM' ? '보관존 로케이션 스캔'
                        : step === 'PROD' ? '상품 바코드 스캔'
                            : step === 'LOT' ? 'Lot 바코드 스캔' : '피킹존 로케이션 스캔'}
                />
            ) : (
                <button onClick={doConfirm} disabled={busy}
                        className="btn-primary justify-center py-3.5 text-base rounded-xl shrink-0">
                    <PackagePlus size={18} /> 보충 확정 — 전량 {num(task.qty)}개
                </button>
            )}

            {/* 하단 보조 동작 — 취소는 웹 몫이다 */}
            <div className="mt-auto flex flex-col gap-1.5 shrink-0">
                <button onClick={skipTask} className="btn-ghost justify-center py-3">
                    <SkipForward size={14} /> 건너뛰기
                </button>
                <p className="text-[11px] text-slate-400 text-center">
                    보충을 무르려면 데스크톱 「수시보충」 화면에서 취소하세요
                </p>
            </div>
        </div>
    );
}

/** 웨이브 목록 카드 — 미확정 건수를 강조한다 */
function WaveCard({ wave, onOpen }) {
    return (
        <button onClick={onOpen}
                className="text-left bg-white border border-slate-200 rounded-xl p-4 active:bg-indigo-50 transition-colors shrink-0">
            <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 truncate">{wave.wavNo}</span>
                <span className={`ml-auto text-xs font-bold shrink-0 ${wave.openCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {wave.openCount > 0 ? `미확정 ${num(wave.openCount)}` : '완료'}
                </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                <span>보충 {num(wave.rplnCount)}건</span>
                <span className="ml-auto">{fmtDe(wave.expctDe)}</span>
            </div>
        </button>
    );
}
