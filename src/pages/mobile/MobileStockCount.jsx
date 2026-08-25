import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, Calculator, MapPin, RefreshCw, SkipForward } from 'lucide-react';
import toast from 'react-hot-toast';

import { invStktkApi } from '@/api/invStktkApi';
import { useScanFlow } from '@/hooks/useScanFlow';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { fmtDe, fmtDt, num } from '@/utils/format';
import { okFeedback } from '@/utils/scanFeedback';
import { Badge } from '@/components/common/Badge';
import { QtyStepper } from '@/components/mobile/QtyStepper';
import { ScanRow } from '@/components/mobile/ScanRow';
import { StepChips } from '@/components/mobile/StepChips';

/** 카운트 단계 — 자리에 가서(로케이션) 무엇인지 확인하고(상품·Lot) 실물을 센다(수량) */
const STEPS = [
    { key: 'LOC', label: '로케이션' },
    { key: 'PROD', label: '상품' },
    { key: 'LOT', label: 'Lot' },
    { key: 'QTY', label: '수량' },
];

/** 단계별 대조 대상 — 무엇과 맞춰 보고 틀리면 뭐라고 알릴지. 단계 진행 자체는 useScanFlow가 한다 */
const MATCHERS = {
    LOC: { of: l => l.locCd, fail: l => `로케이션이 다릅니다 — ${l.locCd} 위치로 가세요` },
    PROD: { of: l => l.prodCd, fail: l => `상품이 다릅니다 — ${l.prodCd} ${l.prodNm}` },
    LOT: { of: l => l.lotNo, fail: l => `Lot이 다릅니다 — ${l.lotNo} (유통기한 ${fmtDe(l.expiryDt) || '미관리'})` },
};

/** 진행 위치 복원용 sessionStorage 키 — 새로고침해도 세던 조사로 돌아온다 */
const STKTK_KEY = 'mstktk.id';

/**
 * 재고조사 카운트 입력 (PDA — /m). 조사 생성·라인 추가/삭제·차이 검토·확정은 웹 화면의 몫이고
 * 이 화면은 미조사 라인을 로케이션 순으로 돌며 실물 수량을 입력하는 것만 한다.
 *
 * <b>블라인드 카운트</b> — 전산수량을 보여주지 않고 기본값도 채우지 않는다. 보여주면 세지 않고
 * 그대로 적게 되어 실사의 의미가 없어진다(상용 RF의 blind count와 같은 원칙). 0도 정상 입력이다
 * (실물 없음 — 미입력과 다르다).
 */
export default function MobileStockCount() {
    const [stktks, setStktks] = useState([]);
    const [stktk, setStktk] = useState(null);        // 선택 조사 헤더 (없으면 조사 목록 화면)
    const [lines, setLines] = useState([]);
    const [qty, setQty] = useState('');
    const [busy, setBusy] = useState(false);
    const qtyRef = useRef(null);

    // 미조사 라인만, 로케이션 순 = 동선 순 (같은 로케이션 안에서는 상품 순)
    const uncounted = useMemo(() => lines
        .filter(l => l.stktkQty == null)
        .sort((a, b) => (a.locCd ?? '').localeCompare(b.locCd ?? '') || (a.prodCd ?? '').localeCompare(b.prodCd ?? '')),
    [lines]);

    const {
        task: line, queue, step, scanVal, setScanVal, scanRef, handleScan, pass, skip, goTo, clear,
    } = useScanFlow({
        steps: STEPS,
        queue: uncounted,
        idOf: l => l.lnId,
        matchers: MATCHERS,
        onReachTerminal: () => setQty(''), // 블라인드 — 전산수량은 물론 기본값도 채우지 않는다
        terminalRef: qtyRef,
        skipEmptyMsg: '건너뛸 다음 라인이 없습니다.',
    });

    const countedCnt = lines.length - queue.length;

    const fetchStktks = () => invStktkApi.list({ status: 'CREATED' }).then(setStktks);

    const openStktk = async (head) => {
        const detail = await invStktkApi.detail(head.invStktkId).catch(() => null);
        if (!detail) return;
        sessionStorage.setItem(STKTK_KEY, String(head.invStktkId));
        setStktk(head);
        setLines(detail.lines);
        clear();
    };

    const backToList = () => {
        sessionStorage.removeItem(STKTK_KEY);
        setStktk(null);
        setLines([]);
        clear();
        fetchStktks().catch(() => {});
    };

    // 최초 조회 + 진행 위치 복원
    useEffect(() => {
        (async () => {
            const list = await invStktkApi.list({ status: 'CREATED' }).catch(() => null);
            if (!list) return;
            setStktks(list);
            const saved = Number(sessionStorage.getItem(STKTK_KEY));
            const head = list.find(x => x.invStktkId === saved);
            if (head) await openStktk(head);
        })();
        // 마운트 1회 — openStktk는 의존성으로 넣지 않는다 (매 렌더 새 함수라 넣으면 조회가 반복된다)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── 카운트 저장 ───────────────────────────────────────────
    const handleSaveClick = () => {
        if (qty.trim() === '') {
            toast.error('실물 수량을 입력하세요 — 실물이 없으면 0입니다.');
            return;
        }
        doSave(Number(qty));
    };

    const doSave = async (n) => {
        if (busy) return; // Enter 연타로 같은 카운트가 두 번 저장되는 것을 막는다
        setBusy(true);
        try {
            // 사유는 건드리지 않는다 — 차이 사유는 차이를 아는 쪽(웹의 검토·확정)이 채운다
            await invStktkApi.saveLines(stktk.invStktkId, [{
                lnId: line.lnId, stktkQty: n, rsnCd: line.rsnCd ?? null, rsnDscr: line.rsnDscr ?? null,
            }]);
            okFeedback();
            toast.success(`${line.locCd} · ${line.prodNm} — ${num(n)}개 기록`);
            const detail = await invStktkApi.detail(stktk.invStktkId);
            setLines(detail.lines);
            goTo(null); // 다음 미조사 라인(로케이션 순) — 건너뛴 라인은 뒤로 밀려 있다
        } catch (e) {
            toast.error(e.message || '카운트 저장에 실패했습니다.');
        } finally {
            setBusy(false);
        }
    };

    // ── 조사 목록 ─────────────────────────────────────────────
    if (!stktk) {
        return (
            <div className="flex flex-col gap-3 h-full">
                <div className="flex items-center gap-2">
                    <Calculator size={18} className="text-indigo-600" />
                    <h2 className="text-lg font-bold text-slate-800">재고조사</h2>
                    <span className="text-xs text-slate-400 mt-0.5">진행 중인 조사</span>
                    <button onClick={() => fetchStktks().catch(() => {})} className="btn-ghost ml-auto">
                        <RefreshCw size={13} /> 새로고침
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                    {stktks.length === 0 && (
                        <p className="text-sm text-slate-400 text-center mt-12">
                            진행 중인 조사가 없습니다 — 조사 생성은 데스크톱 「재고조사」 화면에서 합니다
                        </p>
                    )}
                    {stktks.map(s => <StktkCard key={s.invStktkId} stktk={s} onOpen={() => openStktk(s)} />)}
                </div>
            </div>
        );
    }

    // ── 완료 화면 (미조사 라인 없음) ──────────────────────────
    if (!line) {
        return (
            <div className="flex flex-col h-full">
                <CountTopBar stktk={stktk} countedCnt={countedCnt} total={lines.length} onBack={backToList} />
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
                    <CheckCircle2 size={48} className="text-emerald-500" />
                    <p className="text-sm font-bold text-slate-700">이 조사의 카운트가 모두 끝났습니다</p>
                    <p className="text-xs text-slate-500">차이 검토·조정사유 입력·확정은 데스크톱 「재고조사」 화면에서 합니다</p>
                    <div className="flex gap-2 mt-2">
                        <button onClick={() => openStktk(stktk)} className="btn-ghost py-2.5">
                            <RefreshCw size={13} /> 다시 조회
                        </button>
                        <button onClick={backToList} className="btn-primary py-2.5">조사 목록</button>
                    </div>
                </div>
            </div>
        );
    }

    // ── 카운트 화면 ───────────────────────────────────────────
    return (
        <div className="flex flex-col gap-3 h-full">
            <CountTopBar stktk={stktk} countedCnt={countedCnt} total={lines.length} onBack={backToList} />

            <StepChips steps={STEPS} current={step} />

            {/* 라인 카드 — 전산수량은 어디에도 없다 (블라인드) */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shrink-0">
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 truncate">{stktk.stktkNo}</span>
                    <span className="ml-auto shrink-0">
                        <Badge meta={TEMP_ZONE_META} value={line.tmpZon} />
                    </span>
                </div>

                <div className={`flex items-center gap-2 rounded-xl px-3 py-3
                    ${step === 'LOC' ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-50'}`}>
                    <MapPin size={22} className="text-indigo-600 shrink-0" />
                    <span className="text-3xl font-black tracking-wide text-slate-800 truncate">{line.locCd}</span>
                </div>

                <div className={`rounded-xl px-3 py-2.5
                    ${step === 'PROD' ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-50'}`}>
                    <p className="font-bold text-slate-800 text-lg leading-snug">{line.prodNm}</p>
                    <p className="text-xs text-slate-500">{line.prodCd}</p>
                </div>

                <div className={`flex items-center gap-2 rounded-xl px-3 py-2
                    ${step === 'LOT' ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-50'}`}>
                    <span className="text-xs font-bold text-slate-400 shrink-0">Lot</span>
                    <span className="font-bold text-slate-700 truncate">{line.lotNo}</span>
                    <span className="ml-auto text-xs text-slate-500 shrink-0">
                        {line.expiryDt ? `유통기한 ${fmtDe(line.expiryDt)}` : '유통기한 미관리'}
                    </span>
                </div>

                {step === 'QTY' && (
                    <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                        이 자리의 <b>이 Lot 실물을 전부 세서</b> 입력하세요 — 실물이 없으면 0입니다
                    </p>
                )}
            </div>

            {/* 단계별 입력 — LOC·PROD·LOT은 스캔, QTY는 실물 수량 입력 */}
            {step !== 'QTY' ? (
                <ScanRow
                    ref={scanRef} value={scanVal} onChange={setScanVal} onCommit={handleScan} onSkip={pass}
                    placeholder={step === 'LOC' ? '로케이션 스캔'
                        : step === 'PROD' ? '상품 바코드 스캔' : 'Lot 바코드 스캔'}
                />
            ) : (
                <div className="flex flex-col gap-2 shrink-0">
                    {/* min 0 — 실물 없음(0)이 정상 입력이라 실행 화면들의 하한 1과 다르다 */}
                    <QtyStepper ref={qtyRef} qty={qty} onChange={setQty} onSubmit={handleSaveClick}
                                min={0} placeholder="실물 수량" />
                    <button onClick={handleSaveClick} disabled={busy}
                            className="btn-primary justify-center py-3.5 text-base rounded-xl">
                        <Calculator size={18} /> 카운트 저장
                    </button>
                </div>
            )}

            {/* 하단 보조 동작 — 장부에 없는 실물 발견·잘못 센 라인 되돌리기는 웹 몫이다 */}
            <div className="mt-auto flex flex-col gap-1.5 shrink-0">
                <button onClick={skip} className="btn-ghost justify-center py-3">
                    <SkipForward size={14} /> 건너뛰기
                </button>
                <p className="text-[11px] text-slate-400 text-center">
                    장부에 없는 실물을 발견했거나 잘못 센 라인은 데스크톱 「재고조사」 화면에서 처리하세요
                </p>
            </div>
        </div>
    );
}

/** 카운트·완료 화면 공통 상단바 — 뒤로가기 + 조사번호 + 진행 집계 */
function CountTopBar({ stktk, countedCnt, total, onBack }) {
    return (
        <div className="flex items-center gap-1 shrink-0">
            <button onClick={onBack} aria-label="조사 목록으로"
                    className="p-1.5 -ml-1.5 rounded-lg text-slate-500 active:bg-slate-200">
                <ChevronLeft size={20} />
            </button>
            <span className="font-bold text-slate-800 text-sm truncate">{stktk.stktkNo}</span>
            <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
                조사 {countedCnt} / {total}건
            </span>
        </div>
    );
}

/** 조사 목록 카드 — 범위(존/로케이션/상품)와 진행도를 보여준다 */
function StktkCard({ stktk, onOpen }) {
    const scope = [stktk.zonCd && `존 ${stktk.zonCd}`, stktk.locCd, stktk.prodCd]
        .filter(Boolean).join(' · ') || '전체 보관 로케이션';
    const pct = stktk.lnCnt > 0 ? Math.round((stktk.cntdCnt / stktk.lnCnt) * 100) : 0;
    return (
        <button onClick={onOpen}
                className="text-left bg-white border border-slate-200 rounded-xl p-4 active:bg-indigo-50 transition-colors shrink-0">
            <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 truncate">{stktk.stktkNo}</span>
                <span className="ml-auto text-xs font-bold text-amber-600 shrink-0">
                    미조사 {num(stktk.lnCnt - stktk.cntdCnt)}건
                </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                <span className="truncate">{scope}</span>
                <span className="ml-auto shrink-0">{fmtDt(stktk.createdAt)}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
            </div>
        </button>
    );
}
