import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, Keyboard, RefreshCw, ScanBarcode, Send } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbShmtApi } from '@/api/outbShmtApi';
import { OUTB_STATUS_META } from '@/constants/badgeMeta';
import { fmtDe, num } from '@/utils/format';
import { failFeedback, okFeedback } from '@/utils/scanFeedback';
import { Badge } from '@/components/common/Badge';

/** 진행 위치 복원용 sessionStorage 키 — 새로고침해도 보던 웨이브로 돌아온다 */
const WAV_KEY = 'mship.wavId';

/** 확정 요약 4칸 (주문/할당/피킹/결품) */
const StatBox = ({ label, value, tone = '' }) => (
    <div className="rounded-lg bg-slate-50 py-1.5 text-center">
        <p className="text-[11px] text-slate-400">{label}</p>
        <p className={`font-bold tabular-nums text-base ${tone || 'text-slate-700'}`}>{value || '0'}</p>
    </div>
);

/**
 * 출고확정 (PDA — /m). 다른 실행 화면과 달리 동선 큐가 아니라 <b>스캔 주도</b>다 — 상차하는
 * 실물의 주문 라벨을 스캔하면 그 주문이 뜨고, 확정하면 SHIP-STAGE의 실물·예약이 소진된다
 * (재고가 창고 밖으로 나가는 유일한 지점, 취소 불가). 그래서 매 확정마다 시트로 한 번 짚는다 —
 * 스캔 한 번뿐이라 피킹처럼 스캔이 확인을 대신해 주지 못한다.
 *
 * 웨이브 현황·작업중 주문 관리·일괄 확정은 웹 출고확정 화면의 몫이다.
 */
export default function MobileShipping() {
    const [waves, setWaves] = useState([]);
    const [wave, setWave] = useState(null);          // 선택 웨이브 (없으면 웨이브 목록 화면)
    const [orders, setOrders] = useState([]);
    const [scanVal, setScanVal] = useState('');
    const [manualInput, setManualInput] = useState(false);
    const [target, setTarget] = useState(null);      // 확정 시트 대상 주문
    const [busy, setBusy] = useState(false);
    const scanRef = useRef(null);

    const shippables = useMemo(() => orders.filter(o => o.shippable), [orders]);
    const workingCount = useMemo(() => orders.filter(o => !o.shippable && !o.shmtDt).length, [orders]);
    const shippedCount = useMemo(() => orders.filter(o => o.shmtDt).length, [orders]);

    const fetchWaves = () => outbShmtApi.waves().then(setWaves);

    const openWave = async (w) => {
        const list = await outbShmtApi.orders(w.wavId).catch(() => null);
        if (!list) return;
        sessionStorage.setItem(WAV_KEY, String(w.wavId));
        setWave(w);
        setOrders(list);
        setScanVal('');
        setTarget(null);
    };

    const backToWaves = () => {
        sessionStorage.removeItem(WAV_KEY);
        setWave(null);
        setOrders([]);
        setTarget(null);
        fetchWaves().catch(() => {});
    };

    // 최초 조회 + 진행 위치 복원
    useEffect(() => {
        (async () => {
            const list = await outbShmtApi.waves().catch(() => null);
            if (!list) return;
            setWaves(list);
            const saved = Number(sessionStorage.getItem(WAV_KEY));
            const w = list.find(x => x.wavId === saved);
            if (w) await openWave(w);
        })();
    }, []);

    // 시트가 닫히면 스캔 입력으로 포커스 복귀 — 연속 상차가 스캔만으로 이어지게 한다
    useEffect(() => {
        if (wave && !target) scanRef.current?.focus();
    }, [wave, target]);

    // ── 스캔 → 주문 선택 ──────────────────────────────────────
    const handleScan = () => {
        const v = scanVal.trim().toUpperCase();
        if (!v) return;
        const hit = orders.find(o => String(o.outbNo).toUpperCase() === v);
        setScanVal('');
        if (!hit) {
            failFeedback();
            toast.error(`이 웨이브에 없는 주문입니다: ${v}`);
            return;
        }
        if (hit.shmtDt) {
            failFeedback();
            toast.error(`이미 확정된 주문입니다: ${hit.outbNo}`);
            return;
        }
        if (!hit.shippable) {
            failFeedback();
            toast.error(`출고작업중 주문입니다 — 집품이 끝나야 확정할 수 있습니다: ${hit.outbNo}`);
            return;
        }
        okFeedback();
        setTarget(hit);
    };

    // 스캐너 종결자가 Enter가 아니라 Tab인 기종이 있다 — 둘 다 확인으로 받고 포커스 이동은 막는다
    const onScanKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            handleScan();
        }
    };

    const toggleManualInput = () => {
        setManualInput(m => !m);
        scanRef.current?.focus();
    };

    // ── 출고확정 ──────────────────────────────────────────────
    const doConfirm = async (order) => {
        if (busy) return; // 연타로 같은 확정이 두 번 나가는 것을 막는다 — 되돌릴 수 없는 동작이다
        setBusy(true);
        try {
            await outbShmtApi.confirm([order.outbOrderId]);
            okFeedback();
            toast.success(`${order.outbNo}를 출고확정했습니다`
                + (order.shotgeQty > 0 ? ` — 결품 ${num(order.shotgeQty)}개는 부족 출고로 닫힘` : ''));
            setTarget(null);
            // 재조회 실패는 인터셉터가 알린다 — 여기서 삼키지 않으면 성공한 확정이 실패 토스트로 둔갑한다
            await outbShmtApi.orders(wave.wavId).then(setOrders).catch(() => {});
        } catch (e) {
            toast.error(e.message || '출고확정에 실패했습니다.');
        } finally {
            setBusy(false);
        }
    };

    // ── 웨이브 목록 ───────────────────────────────────────────
    if (!wave) {
        return (
            <div className="flex flex-col gap-3 h-full">
                <div className="flex items-center gap-2">
                    <Send size={18} className="text-indigo-600" />
                    <h2 className="text-lg font-bold text-slate-800">출고확정</h2>
                    <span className="text-xs text-slate-400 mt-0.5">지시발행 웨이브</span>
                    <button onClick={() => fetchWaves().catch(() => {})} className="btn-ghost ml-auto">
                        <RefreshCw size={13} /> 새로고침
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                    {waves.length === 0 && (
                        <p className="text-sm text-slate-400 text-center mt-12">확정할 웨이브가 없습니다</p>
                    )}
                    {waves.map(w => <WaveCard key={w.wavId} wave={w} onOpen={() => openWave(w)} />)}
                </div>
            </div>
        );
    }

    // ── 상차 화면 — 스캔 입력 + 확정대상 주문 목록 ─────────────
    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex items-center gap-1 shrink-0">
                <button onClick={backToWaves} aria-label="웨이브 목록으로"
                        className="p-1.5 -ml-1.5 rounded-lg text-slate-500 active:bg-slate-200">
                    <ChevronLeft size={20} />
                </button>
                <span className="font-bold text-slate-800 text-sm truncate">{wave.wavNo}</span>
                <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
                    확정 {shippedCount} / {orders.length}건
                </span>
            </div>

            {/* 스캔 입력 — 상차하는 실물의 주문 라벨을 찍는다 */}
            <div className="flex items-center gap-2 shrink-0">
                <div className="relative flex-1">
                    <ScanBarcode size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        ref={scanRef} value={scanVal} autoFocus
                        inputMode={manualInput ? 'text' : 'none'}
                        autoComplete="off" enterKeyHint="go"
                        onChange={(e) => setScanVal(e.target.value)}
                        onKeyDown={onScanKeyDown}
                        placeholder="출고번호(주문 라벨) 스캔"
                        className="input-base w-full pl-10 py-3 text-base"
                    />
                </div>
                <button onClick={toggleManualInput} title="소프트 키보드로 직접 입력"
                        className={`btn-ghost py-3 shrink-0 ${manualInput ? 'border-indigo-300 text-indigo-600' : ''}`}>
                    <Keyboard size={15} />
                </button>
            </div>

            {workingCount > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 shrink-0">
                    출고작업중 {workingCount}건은 목록에서 빠져 있습니다 — 집품이 끝나면 다시 조회하세요
                </p>
            )}

            {/* 확정대상 주문 — 스캐너 없이도 카드를 눌러 확정할 수 있다 */}
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                {shippables.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
                        <CheckCircle2 size={48} className={workingCount > 0 ? 'text-amber-400' : 'text-emerald-500'} />
                        <p className="text-sm font-bold text-slate-700">
                            {workingCount > 0
                                ? `확정할 수 있는 주문이 없습니다 — 출고작업중 ${workingCount}건`
                                : '이 웨이브의 주문이 모두 확정됐습니다'}
                        </p>
                        <div className="flex gap-2 mt-2">
                            <button onClick={() => openWave(wave)} className="btn-ghost py-2.5">
                                <RefreshCw size={13} /> 다시 조회
                            </button>
                            <button onClick={backToWaves} className="btn-primary py-2.5">웨이브 목록</button>
                        </div>
                    </div>
                ) : shippables.map(o => (
                    <button key={o.outbOrderId} onClick={() => setTarget(o)}
                            className="text-left bg-white border border-slate-200 rounded-xl p-4 active:bg-indigo-50 transition-colors shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 truncate">{o.outbNo}</span>
                            <span className="ml-auto shrink-0">
                                <Badge meta={OUTB_STATUS_META} value={o.status} show="label" />
                            </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                            <span className="truncate">{o.storeNm}</span>
                            <span className={`ml-auto shrink-0 font-bold ${o.pikngQty > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                피킹 {num(o.pikngQty)}
                            </span>
                            {o.shotgeQty > 0 && (
                                <span className="shrink-0 font-bold text-rose-600">결품 {num(o.shotgeQty)}</span>
                            )}
                        </div>
                    </button>
                ))}
            </div>

            {/* 확정 시트 — 되돌릴 수 없는 동작이라 매번 짚는다 */}
            {target && (
                <ConfirmSheet
                    order={target}
                    busy={busy}
                    onCancel={() => setTarget(null)}
                    onConfirm={() => doConfirm(target)}
                />
            )}
        </div>
    );
}

/** 웨이브 목록 카드 — 확정대상·작업중·확정완료 집계 */
function WaveCard({ wave, onOpen }) {
    return (
        <button onClick={onOpen}
                className="text-left bg-white border border-slate-200 rounded-xl p-4 active:bg-indigo-50 transition-colors shrink-0">
            <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 truncate">{wave.wavNo}</span>
                <span className={`ml-auto text-xs font-bold shrink-0 ${wave.readyCount > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                    확정대상 {num(wave.readyCount)}
                </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                {wave.workingCount > 0 && <span className="text-amber-600 font-bold">작업중 {num(wave.workingCount)}</span>}
                <span>확정 {num(wave.shippedCount)} / {num(wave.orderCount)}건</span>
                <span className="ml-auto">{fmtDe(wave.expctDe)}</span>
            </div>
        </button>
    );
}

/** 출고확정 바텀시트 — 확정 내용(수량 4칸)과 결품·전량미출고 경고를 짚고 확정한다 */
function ConfirmSheet({ order, busy, onCancel, onConfirm }) {
    const noPick = order.pikngQty === 0; // 신규(할당 0건) — 전량 미출고로 닫힌다
    return (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end" onMouseDown={onCancel}>
            <div className="w-full bg-white rounded-t-2xl p-4 pb-6 flex flex-col gap-3"
                 onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-800 truncate">{order.outbNo}</h3>
                    <span className="ml-auto shrink-0">
                        <Badge meta={OUTB_STATUS_META} value={order.status} show="label" />
                    </span>
                </div>
                <p className="text-sm text-slate-500 truncate">{order.storeNm}</p>
                <div className="grid grid-cols-4 gap-1.5">
                    <StatBox label="주문" value={num(order.odrQty)} />
                    <StatBox label="할당" value={num(order.alocQty)} />
                    <StatBox label="피킹" value={num(order.pikngQty)} tone={order.pikngQty > 0 ? 'text-emerald-600' : ''} />
                    <StatBox label="결품" value={num(order.shotgeQty)} tone={order.shotgeQty > 0 ? 'text-rose-600' : ''} />
                </div>
                <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                    {noPick
                        ? <>집품된 것이 없는 주문입니다 — 확정하면 <b className="text-rose-600">전량 미출고</b>로 닫힙니다.</>
                        : <>피킹수량 {num(order.pikngQty)}개가 SHIP-STAGE에서 반출됩니다
                            {order.shotgeQty > 0 && <> — 결품 <b className="text-rose-600">{num(order.shotgeQty)}개</b>는 부족 출고로 닫힙니다 (백오더 없음)</>}.</>}
                    {' '}<b>되돌릴 수 없습니다.</b>
                </p>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="btn-modal-cancel flex-1">취소</button>
                    <button onClick={onConfirm} disabled={busy}
                            className={`flex-1 px-4 py-2 text-sm font-bold rounded-lg text-white disabled:opacity-40
                                ${noPick || order.shotgeQty > 0 ? 'bg-rose-600 active:bg-rose-700' : 'bg-indigo-600 active:bg-indigo-700'}`}>
                        출고확정
                    </button>
                </div>
            </div>
        </div>
    );
}
