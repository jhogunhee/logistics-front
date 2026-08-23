import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertTriangle, ArrowRight, ArrowUpRight, Box, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight,
    ClipboardCheck, History, PackageCheck, PackageOpen, RefreshCw, Send, ShoppingCart, Truck, Waves,
} from 'lucide-react';

import { ibOrderApi } from '@/api/ibOrderApi';
import { putawayApi } from '@/api/putawayApi';
import { outbOrderApi } from '@/api/outbOrderApi';
import { outbPikngApi } from '@/api/outbPikngApi';
import { invApi } from '@/api/invApi';
import { invHistApi } from '@/api/invHistApi';
import { ASN_PRGR_META, OUTB_STATUS_META, TEMP_ZONE_META, TX_TYPE_META } from '@/constants/badgeMeta';
import { fmtDt, num, todayStr, ymd } from '@/utils/format';

// 파이프라인 단계색 — 단계마다 다른 색이 아니라 한 색(indigo)의 명도 계단이다. 단계는 「종류」가 아니라
// 「얼마나 진행됐나」라서 진할수록 뒤 단계로 읽히게 했다. 5단계가 전부 2:1 이상 대비를 지키는 계단은
// 400부터 시작해야 해서 첫 단계가 연보라다.
const STAGE_RAMP = ['bg-indigo-300', 'bg-indigo-400', 'bg-indigo-500', 'bg-indigo-700', 'bg-indigo-900'];

// 분포는 저장 상태(3값)가 아니라 진행 5단계 파생값(prgr)으로 그린다 — 저장 상태로는
// 검수·적치·확정대기가 전부 「입고중」 한 칸에 뭉쳐 분포라 할 게 없다
const INB_STAGES = ['SCHEDULED', 'RECEIVING', 'PTAWY_DRCT', 'PTAWY_CMPL', 'CONFIRMED'];
// 출고는 저장 상태 자체가 진행 5단계라 입고의 prgr 같은 파생값이 따로 없다
const OUTB_STAGES = ['CREATED', 'ALLOCATED', 'PICKING', 'PICKED', 'SHIPPED'];

const ZONE_ORDER = ['DRY', 'CHL', 'FRZ'];

// 재고 구성 3분류 — 가용/예약/보류는 순서가 아니라 종류라 서로 다른 색.
const INV_PARTS = [
    { key: 'avalQty', label: '가용', bar: 'bg-indigo-500', dot: 'bg-indigo-500' },
    { key: 'alocQty', label: '예약', bar: 'bg-amber-400', dot: 'bg-amber-400' },
    { key: 'hldQty', label: '보류', bar: 'bg-rose-500', dot: 'bg-rose-500' },
];

const EXPIRY_WATCH_DAYS = 30;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

// 'YYYY-MM' 단위 — 대시보드 조회 범위는 달력 한 달이다
const monthOf = (ymdStr) => String(ymdStr).slice(0, 7);
const shiftMonth = (month, n) => {
    const [y, m] = month.split('-').map(Number);
    return monthOf(ymd(new Date(y, m - 1 + n, 1)));
};
const monthDays = (month) => {
    const [y, m] = month.split('-').map(Number);
    const n = new Date(y, m, 0).getDate();
    return Array.from({ length: n }, (_, i) => ymd(new Date(y, m - 1, i + 1)));
};
const monthRange = (month) => {
    const days = monthDays(month);
    return { dateFrom: days[0], dateTo: days[days.length - 1] };
};
const monthLabel = (month) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월`;

const sum = (arr, pick) => arr.reduce((s, x) => s + Number(pick(x) ?? 0), 0);
const count = (arr, pred) => arr.filter(pred).length;
const pct = (n, total) => (total > 0 ? (n / total) * 100 : 0);

// 'YYYY-MM-DD' → 로컬 자정 Date. new Date('YYYY-MM-DD')는 UTC 자정이라 KST에서 하루가 민다
const parseYmd = (s) => {
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
};
const daysUntil = (ymdStr) => Math.round((parseYmd(ymdStr) - parseYmd(todayStr())) / 86_400_000);

// 축 눈금용 깔끔한 최댓값 (1·2·5 × 10^n)
const niceMax = (v) => {
    if (v <= 0) return 10;
    const mag = 10 ** Math.floor(Math.log10(v));
    const f = v / mag;
    const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return step * mag;
};

// 선택 월의 일자별 입고(RECEIVE)·출고(SHIP) 수량 — KPI 스파크라인과 일별 차트가 같은 행을 쓴다
const dailyFlow = (hist, month) => monthDays(month).map(d => {
    const ofDay = hist.filter(h => String(h.createdAt).slice(0, 10) === d);
    return {
        date: d,
        in: sum(ofDay.filter(h => h.txTyp === 'RECEIVE'), h => h.qty),
        out: Math.abs(sum(ofDay.filter(h => h.txTyp === 'SHIP'), h => h.qty)),
    };
});

const EMPTY = { asns: [], putawayPending: [], outbOrders: [], pickingWaves: [], inv: [], hist: [] };

// 여섯 API를 한 번에 — 하나가 실패해도 나머지는 그린다 (실패한 것만 빈 목록)
const loadAll = async (month) => {
    const range = monthRange(month);
    const results = await Promise.allSettled([
        ibOrderApi.list(range),
        putawayApi.lines(),
        outbOrderApi.list(range),
        outbPikngApi.pickingWaves(),
        invApi.list(),
        invHistApi.list(range),
    ]);
    const pick = (i) => (results[i].status === 'fulfilled' ? results[i].value : []);
    return {
        asns: pick(0), putawayPending: pick(1), outbOrders: pick(2),
        pickingWaves: pick(3), inv: pick(4), hist: pick(5),
    };
};

export default function Dashboard() {
    const [month, setMonth] = useState(() => monthOf(todayStr()));
    const [data, setData] = useState(EMPTY);
    const [loading, setLoading] = useState(true);
    const [updatedAt, setUpdatedAt] = useState(null);

    const today = todayStr();
    const { asns, putawayPending, outbOrders, pickingWaves, inv, hist } = data;

    const isCurrentMonth = month === monthOf(today);
    const monthNo = Number(month.slice(5, 7));
    const onHand = sum(inv, r => r.onHandQty);
    const avail = sum(inv, r => r.avalQty);
    const expiring = inv
        .filter(r => r.expiryDt && Number(r.onHandQty) > 0 && daysUntil(r.expiryDt) <= EXPIRY_WATCH_DAYS)
        .sort((a, b) => parseYmd(a.expiryDt) - parseYmd(b.expiryDt));
    const openPickTasks = sum(pickingWaves, w => w.openTaskCount);
    const pickRemain = sum(pickingWaves, w => w.remainQty);
    const attentionCount = expiring.length + openPickTasks + putawayPending.length;
    const flow = dailyFlow(hist, month);
    const asnDone = count(asns, a => a.prgr === 'CONFIRMED');
    const outbDone = count(outbOrders, o => o.status === 'SHIPPED');

    const apply = useCallback((loaded) => {
        setData(loaded);
        setUpdatedAt(new Date());
        setLoading(false);
    }, []);

    useEffect(() => { loadAll(month).then(apply); }, [month, apply]);

    const handleRefresh = () => {
        setLoading(true);
        loadAll(month).then(apply);
    };

    const handleMonthChange = (next) => {
        if (next === month) return;
        setLoading(true);
        setMonth(next);
    };

    return (
        <div className={`flex flex-col gap-5 transition-opacity duration-300 ${loading && updatedAt ? 'opacity-60' : ''}`}>
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <p className="text-[11px] font-semibold tracking-wider text-indigo-500 uppercase">Overview</p>
                    <h2 className="text-xl font-bold text-slate-800 leading-tight mt-0.5">대시보드</h2>
                    <p className="text-xs text-slate-400 mt-1">
                        {isCurrentMonth
                            ? `오늘 ${today} (${DOW[parseYmd(today).getDay()]}) · 입고·출고는 이번 달 예정분`
                            : `${monthLabel(month)} 입고·출고 예정분 · 재고는 현재 기준`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm p-0.5">
                        <button type="button" onClick={() => handleMonthChange(shiftMonth(month, -1))}
                                className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-50" aria-label="이전 달">
                            <ChevronLeft size={15} />
                        </button>
                        <span className="px-2 text-sm font-bold text-slate-700 tabular-nums min-w-[96px] text-center">{monthLabel(month)}</span>
                        <button type="button" onClick={() => handleMonthChange(shiftMonth(month, 1))}
                                className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-50" aria-label="다음 달">
                            <ChevronRight size={15} />
                        </button>
                        {!isCurrentMonth && (
                            <button type="button" onClick={() => handleMonthChange(monthOf(today))}
                                    className="ml-0.5 px-2.5 py-1.5 rounded-md text-[12px] font-bold text-indigo-600 hover:bg-indigo-50">
                                이번 달
                            </button>
                        )}
                    </div>
                    <button type="button" onClick={handleRefresh} disabled={loading} className="btn-ghost shadow-sm">
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        {updatedAt ? `${String(updatedAt.getHours()).padStart(2, '0')}:${String(updatedAt.getMinutes()).padStart(2, '0')} 갱신` : '갱신'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    to="/inbound/asn" icon={Truck} tone="indigo"
                    title={`${monthNo}월 입고예정`} value={asns.length} unit="건"
                    sub={`${num(sum(asns, a => a.totalExpctQty))}개 예정`}
                    meter={{ value: pct(asnDone, asns.length), label: `확정 ${num(asnDone)}/${num(asns.length)}` }}
                    spark={flow.map(r => r.in)} sparkLabel="일별 입고 실적"
                />
                <StatCard
                    to="/outbound/order" icon={Send} tone="violet"
                    title={`${monthNo}월 출고예정`} value={outbOrders.length} unit="건"
                    sub={`${num(sum(outbOrders, o => o.totalOrderQty))}개 예정`}
                    meter={{ value: pct(outbDone, outbOrders.length), label: `출고확정 ${num(outbDone)}/${num(outbOrders.length)}` }}
                    spark={flow.map(r => r.out)} sparkLabel="일별 출고 실적"
                />
                <StatCard
                    to="/stock/status" icon={Box} tone="emerald"
                    title="가용재고" value={avail} unit="개"
                    sub={`보유 ${num(onHand)}개 중`}
                    meter={{ value: pct(avail, onHand), label: '가용률' }}
                    facts={[
                        { label: '예약', value: sum(inv, r => r.alocQty), dot: 'bg-amber-400' },
                        { label: '보류', value: sum(inv, r => r.hldQty), dot: 'bg-rose-500' },
                    ]}
                />
                <AttentionCard
                    total={attentionCount}
                    items={[
                        { to: '/stock/status', label: '유통기한 임박', value: expiring.length, unit: 'Lot' },
                        { to: '/outbound/picking', label: '미마감 피킹', value: openPickTasks, unit: '건' },
                        { to: '/inbound/putaway', label: '적치 대기', value: putawayPending.length, unit: 'Lot' },
                    ]}
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Panel title="입고 진행" icon={Truck} to="/inbound/asn" hint={`${num(asns.length)}건`}>
                    <Pipeline
                        items={asns} stages={INB_STAGES} statusOf={a => a.prgr} meta={ASN_PRGR_META}
                        todos={[
                            { to: '/inbound/receiving', icon: ClipboardCheck, label: '검수 대기', value: count(asns, a => a.prgr === 'SCHEDULED'), unit: '건' },
                            { to: '/inbound/putaway', icon: PackageOpen, label: '적치 대기', value: putawayPending.length, unit: 'Lot' },
                            { to: '/inbound/confirm', icon: CheckCircle2, label: '확정 대기', value: count(asns, a => a.prgr === 'PTAWY_CMPL'), unit: '건' },
                        ]}
                    />
                </Panel>
                <Panel title="출고 진행" icon={Send} to="/outbound/order" hint={`${num(outbOrders.length)}건`}>
                    <Pipeline
                        items={outbOrders} stages={OUTB_STAGES} statusOf={o => o.status} meta={OUTB_STATUS_META}
                        todos={[
                            { to: '/outbound/wave', icon: Waves, label: '미편성', value: count(outbOrders, o => !o.wavId && o.status !== 'SHIPPED'), unit: '건' },
                            { to: '/outbound/picking', icon: ShoppingCart, label: '피킹 잔량', value: pickRemain, unit: '개', warn: openPickTasks > 0 },
                            { to: '/outbound/shipping', icon: PackageCheck, label: '출하 대기', value: count(outbOrders, o => o.status === 'PICKED'), unit: '건' },
                        ]}
                    />
                </Panel>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                <div className="xl:col-span-3">
                    <Panel title="재고 구성" icon={Box} to="/stock/status" hint={`현재 보유 ${num(onHand)}개`}>
                        <InventoryComposition inv={inv} />
                    </Panel>
                </div>
                <div className="xl:col-span-2">
                    <Panel title="유통기한 임박" icon={CalendarClock} to="/stock/status" hint={`${EXPIRY_WATCH_DAYS}일 이내 · ${num(expiring.length)}Lot`}>
                        <ExpiryWatch items={expiring} />
                    </Panel>
                </div>
            </div>

            <Panel title={`${monthLabel(month)} 일별 입출고`} icon={History} hint="재고이력 기준">
                <MonthlyFlow rows={flow} today={isCurrentMonth ? today : null} />
            </Panel>

            <Panel title={`${monthLabel(month)} 재고이력`} icon={History} to="/stock/history" hint="최근 8건">
                <RecentHistory items={hist.slice(0, 8)} />
            </Panel>
        </div>
    );
}

const TONE = {
    indigo: { icon: 'bg-indigo-50 text-indigo-600', meter: 'bg-indigo-500', spark: '#6366f1', ring: 'hover:border-indigo-300' },
    violet: { icon: 'bg-violet-50 text-violet-600', meter: 'bg-violet-500', spark: '#8b5cf6', ring: 'hover:border-violet-300' },
    emerald: { icon: 'bg-emerald-50 text-emerald-600', meter: 'bg-emerald-500', spark: '#10b981', ring: 'hover:border-emerald-300' },
};

const CARD_BASE = 'rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)]';
const CARD = `bg-white border-slate-200 ${CARD_BASE}`;

const StatCard = ({ to, icon: Icon, tone = 'indigo', title, value, unit, sub, meter, spark, sparkLabel, facts }) => {
    const t = TONE[tone];
    const body = (
        <>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-500">{title}</p>
                    <p className="mt-1.5 text-[30px] leading-none font-bold text-slate-800 tabular-nums tracking-tight">
                        {num(value)}<span className="ml-1 text-sm font-semibold text-slate-400">{unit}</span>
                    </p>
                    {sub && <p className="mt-1.5 text-[11px] text-slate-400 truncate">{sub}</p>}
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.icon}`}>
                    {Icon && <Icon size={19} />}
                </div>
            </div>

            {spark && <Sparkline values={spark} color={t.spark} label={sparkLabel} />}
            {facts && (
                <div className="mt-3 flex items-center gap-4">
                    {facts.map(f => (
                        <div key={f.label} className="flex items-center gap-1.5 text-[11px]">
                            <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} />
                            <span className="text-slate-400">{f.label}</span>
                            <span className="font-bold text-slate-600 tabular-nums">{num(f.value)}</span>
                        </div>
                    ))}
                </div>
            )}

            {meter && (
                <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <span className="text-slate-400">{meter.label}</span>
                        <span className="font-bold text-slate-600 tabular-nums">{Math.round(meter.value)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full transition-[width] duration-500 ${t.meter}`} style={{ width: `${meter.value}%` }} />
                    </div>
                </div>
            )}
        </>
    );
    const cls = `block ${CARD} p-5 transition-colors h-full`;
    return to
        ? <Link to={to} className={`${cls} ${t.ring}`}>{body}</Link>
        : <div className={cls}>{body}</div>;
};

/** KPI 카드 속 일별 추이 — 축·눈금 없이 모양만. 값은 카드 숫자가 말하고 이건 리듬만 보여준다 */
const Sparkline = ({ values, color, label }) => {
    const W = 200;
    const H = 36;
    const max = Math.max(...values, 1);
    const n = values.length;
    const gap = 1.5;
    const bw = (W - gap * (n - 1)) / n;
    const hasAny = values.some(v => v > 0);
    return (
        <div className="mt-3" title={label}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-9" aria-label={label}>
                {values.map((v, i) => {
                    const h = hasAny ? Math.max((v / max) * H, v > 0 ? 2 : 0) : 0;
                    return (
                        <rect key={i} x={i * (bw + gap)} y={H - Math.max(h, 1.5)} width={bw} height={Math.max(h, 1.5)}
                              rx={0.8} fill={color} opacity={v > 0 ? 0.9 : 0.15} />
                    );
                })}
            </svg>
        </div>
    );
};

/** 확인 필요 — 경고를 받는 카드라 나머지와 달리 어둡게. 0건이면 같은 틀에서 초록 체크로 잠잠해진다 */
const AttentionCard = ({ total, items }) => {
    const calm = total === 0;
    return (
        <div className={`${CARD_BASE} p-5 h-full relative overflow-hidden ${calm ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-900'}`}>
            {!calm && (
                <div className="pointer-events-none absolute -right-10 -top-10 w-36 h-36 rounded-full bg-amber-400/15 blur-2xl" />
            )}
            <div className="flex items-start justify-between gap-3 relative">
                <div>
                    <p className={`text-xs font-semibold ${calm ? 'text-slate-500' : 'text-slate-400'}`}>확인 필요</p>
                    <p className={`mt-1.5 text-[30px] leading-none font-bold tabular-nums tracking-tight ${calm ? 'text-slate-800' : 'text-white'}`}>
                        {num(total)}<span className={`ml-1 text-sm font-semibold ${calm ? 'text-slate-400' : 'text-slate-500'}`}>건</span>
                    </p>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${calm ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-400/20 text-amber-300'}`}>
                    {calm ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}
                </div>
            </div>
            <div className={`mt-4 flex flex-col divide-y ${calm ? 'divide-slate-100' : 'divide-white/10'}`}>
                {items.map(it => (
                    <Link key={it.label} to={it.to}
                          className={`group flex items-center justify-between py-1.5 text-[12px] ${calm ? 'text-slate-500 hover:text-indigo-600' : 'text-slate-300 hover:text-white'}`}>
                        <span className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${it.value > 0 ? (calm ? 'bg-slate-300' : 'bg-amber-400') : (calm ? 'bg-slate-200' : 'bg-white/20')}`} />
                            {it.label}
                        </span>
                        <span className="flex items-center gap-1 tabular-nums">
                            <span className={`font-bold ${it.value > 0 ? (calm ? 'text-slate-700' : 'text-white') : (calm ? 'text-slate-300' : 'text-slate-600')}`}>{num(it.value)}</span>
                            <span className={calm ? 'text-slate-400' : 'text-slate-500'}>{it.unit}</span>
                            <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
};

const Panel = ({ title, icon: Icon, to, hint, children }) => (
    <div className={`${CARD} p-5 flex flex-col gap-4 h-full`}>
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
                {Icon && (
                    <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
                        <Icon size={14} />
                    </span>
                )}
                <h3 className="text-sm font-bold text-slate-800">{title}</h3>
                {hint && <span className="text-[11px] text-slate-400 pl-2 border-l border-slate-200">{hint}</span>}
            </div>
            {to && (
                <Link to={to} className="flex items-center gap-0.5 text-[11px] font-semibold text-slate-400 hover:text-indigo-600">
                    바로가기 <ArrowRight size={12} />
                </Link>
            )}
        </div>
        {children}
    </div>
);

const EmptyNote = ({ children }) => (
    <p className="text-sm text-slate-400 text-center py-8">{children}</p>
);

/** 완료율 원형 게이지 */
const Ring = ({ value, size = 84, stroke = 8 }) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#4f46e5" strokeWidth={stroke}
                        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)}
                        className="transition-[stroke-dashoffset] duration-700" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-slate-800 tabular-nums leading-none">{Math.round(value)}<span className="text-[10px] text-slate-400 ml-px">%</span></span>
            </div>
        </div>
    );
};

/** 완료율 링 + 단계 스테퍼(적층 막대 겸 단계별 건수) + 작업 대기 바로가기 */
const Pipeline = ({ items, stages, statusOf, meta, todos }) => {
    const total = items.length;
    const counts = stages.map((s, i) => ({ status: s, count: count(items, x => statusOf(x) === s), color: STAGE_RAMP[i] }));
    const done = counts[counts.length - 1].count;
    const inFlight = total - done - counts[0].count;

    return (
        <div className="flex flex-col gap-4">
            {total === 0 ? (
                <EmptyNote>기간 내 예정 건이 없습니다.</EmptyNote>
            ) : (
                <div className="flex items-center gap-5">
                    <Ring value={pct(done, total)} />
                    <div className="flex-1 min-w-0 flex flex-col gap-3">
                        <div className="flex items-baseline gap-3 text-xs">
                            <span className="text-slate-400">완료 <b className="text-slate-700 tabular-nums">{num(done)}</b> / {num(total)}건</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-400">진행중 <b className="text-slate-700 tabular-nums">{num(inFlight)}</b></span>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-400">대기 <b className="text-slate-700 tabular-nums">{num(counts[0].count)}</b></span>
                        </div>
                        <div className="flex h-2 gap-[2px] rounded-full overflow-hidden bg-slate-100">
                            {counts.filter(c => c.count > 0).map(c => (
                                <div
                                    key={c.status}
                                    className={`${c.color} transition-[width] duration-500`}
                                    style={{ width: `${pct(c.count, total)}%` }}
                                    title={`${meta[c.status].label} ${num(c.count)}건`}
                                />
                            ))}
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                            {counts.map(c => (
                                <div key={c.status} className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5 border-t-2 border-transparent relative overflow-hidden">
                                    <span className={`absolute top-0 left-0 right-0 h-[3px] ${c.count > 0 ? c.color : 'bg-slate-200'}`} />
                                    <p className="text-[10px] text-slate-400 truncate">{meta[c.status].label}</p>
                                    <p className={`text-sm font-bold leading-tight tabular-nums ${c.count > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                                        {num(c.count)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
                {todos.map(t => (
                    <Link
                        key={t.label} to={t.to}
                        className={`group rounded-xl px-3 py-2.5 flex items-center gap-2.5 border transition-colors
                            ${t.warn ? 'bg-amber-50 border-amber-100 hover:border-amber-300' : 'bg-white border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/40'}`}
                    >
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${t.warn ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600'}`}>
                            <t.icon size={14} />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[10px] text-slate-400 truncate">{t.label}</p>
                            <p className={`text-sm font-bold leading-tight tabular-nums ${t.value > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                                {num(t.value)}<span className="ml-0.5 text-[10px] font-medium text-slate-400">{t.unit}</span>
                            </p>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
};

/** 온도대별 가용/예약/보류 적층 가로막대 + 구성 요약 + 스테이징 체류 */
const InventoryComposition = ({ inv }) => {
    if (inv.length === 0) return <EmptyNote>재고가 없습니다.</EmptyNote>;

    const zones = ZONE_ORDER.map(z => {
        const rows = inv.filter(r => r.tmpZon === z);
        return { zone: z, onHand: sum(rows, r => r.onHandQty), parts: INV_PARTS.map(p => sum(rows, r => r[p.key])) };
    });
    const maxOnHand = Math.max(...zones.map(z => z.onHand), 1);
    const total = sum(inv, r => r.onHandQty);
    const staged = sum(inv.filter(r => r.locTyp === 'STAGE'), r => r.onHandQty);
    const partTotals = INV_PARTS.map((p, i) => sum(zones, z => z.parts[i]));

    return (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_200px] gap-6">
            <div className="flex flex-col justify-center gap-3.5">
                {zones.map(z => (
                    <div key={z.zone} className="grid grid-cols-[52px_1fr_72px] items-center gap-3">
                        <span className={`justify-self-start text-[11px] px-2 py-0.5 rounded-full font-bold ${TEMP_ZONE_META[z.zone].badge}`}>
                            {TEMP_ZONE_META[z.zone].label}
                        </span>
                        <div className="flex h-7 gap-[2px]" title={INV_PARTS.map((p, i) => `${p.label} ${num(z.parts[i])}`).join(' · ')}>
                            {z.onHand === 0
                                ? <div className="h-full w-full rounded-md bg-slate-100" />
                                : INV_PARTS.map((p, i) => z.parts[i] > 0 && (
                                    <div
                                        key={p.key}
                                        className={`h-full ${p.bar} first:rounded-l-md last:rounded-r-md transition-[width] duration-500`}
                                        style={{ width: `${pct(z.parts[i], maxOnHand)}%` }}
                                    />
                                ))}
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold text-slate-700 tabular-nums leading-tight">{num(z.onHand)}</p>
                            <p className="text-[10px] text-slate-400 tabular-nums">{Math.round(pct(z.onHand, total))}%</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-2 md:border-l md:border-slate-100 md:pl-6">
                {INV_PARTS.map((p, i) => (
                    <div key={p.key} className="flex-1 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                        <span className="flex items-center gap-2 text-xs text-slate-500">
                            <span className={`w-2 h-2 rounded-full ${p.dot}`} />{p.label}
                        </span>
                        <span className="text-right tabular-nums">
                            <b className="block text-sm text-slate-700 leading-tight">{num(partTotals[i])}</b>
                            <span className="text-[10px] text-slate-400">{Math.round(pct(partTotals[i], total))}%</span>
                        </span>
                    </div>
                ))}
                <div className="flex-1 flex flex-col justify-center rounded-xl border border-dashed border-slate-200 px-3 py-2" title="RCV-STAGE · SHIP-STAGE에 머무는 수량">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-500">스테이징 체류</span>
                        <span className="tabular-nums"><b className="text-slate-700">{num(staged)}</b> <span className="text-slate-400">({Math.round(pct(staged, total))}%)</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-slate-400" style={{ width: `${pct(staged, total)}%` }} />
                    </div>
                </div>
            </div>
        </div>
    );
};

const ExpiryWatch = ({ items }) => {
    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
                <span className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center"><CheckCircle2 size={20} /></span>
                <p className="text-sm">{EXPIRY_WATCH_DAYS}일 이내 만료 Lot이 없습니다.</p>
            </div>
        );
    }
    const shown = items.slice(0, 6);
    return (
        <div className="flex flex-col">
            {shown.map(r => {
                const d = daysUntil(r.expiryDt);
                const tone = d < 0 ? 'bg-rose-500 text-white' : d <= 7 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700';
                return (
                    <div key={r.invId} className="flex items-center gap-3 text-xs py-2 border-b border-slate-50 last:border-0">
                        <span className={`shrink-0 w-12 text-center py-1 rounded-md font-bold tabular-nums ${tone}`}>
                            {d < 0 ? '만료' : d === 0 ? 'D-day' : `D-${d}`}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-700 truncate">{r.prodNm}</p>
                            <p className="text-slate-400 truncate mt-0.5">{r.lotNo} · {r.locCd}</p>
                        </div>
                        <span className="shrink-0 font-bold text-slate-700 tabular-nums">{num(r.onHandQty)}<span className="ml-0.5 text-[10px] font-medium text-slate-400">개</span></span>
                    </div>
                );
            })}
            {items.length > shown.length && (
                <Link to="/stock/status" className="mt-2 text-[11px] text-slate-400 hover:text-indigo-600 text-right">
                    외 {num(items.length - shown.length)}건 더보기
                </Link>
            )}
        </div>
    );
};

const FLOW_SERIES = [
    { key: 'in', label: '입고', fill: '#6366f1' },
    { key: 'out', label: '출고', fill: '#14b8a6' },
];

// 컨테이너 실제 폭 — viewBox 확대로 글자가 같이 커지지 않게 픽셀 좌표로 그린다.
// 정수로 내림해 스크롤바 생성/소멸로 소수점 폭이 흔들려도 재렌더가 튀지 않게 한다
const useWidth = () => {
    const ref = useRef(null);
    const [w, setW] = useState(0);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(([e]) => setW(prev => {
            const next = Math.floor(e.contentRect.width);
            return next === prev ? prev : next;
        }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, w];
};

/** 선택 월의 일자별 입고(RECEIVE)·출고(SHIP) 수량 묶음 세로막대 — SVG 직접 그림 */
const MonthlyFlow = ({ rows, today }) => {
    const [hover, setHover] = useState(null);
    const [ref, W] = useWidth();

    const yMax = niceMax(Math.max(...rows.flatMap(r => [r.in, r.out])));
    const totalIn = sum(rows, r => r.in);
    const totalOut = sum(rows, r => r.out);
    const activeDays = count(rows, r => r.in + r.out > 0);

    const H = 200;
    const PAD = { top: 10, right: 8, bottom: 24, left: 44 };
    const plotW = Math.max(W - PAD.left - PAD.right, 0);
    const plotH = H - PAD.top - PAD.bottom;
    const slot = rows.length ? plotW / rows.length : 0;
    const barW = Math.max(2, Math.min(10, (slot - 6) / 2));
    const y = (v) => PAD.top + plotH - (v / yMax) * plotH;
    const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1].map(f => yMax * f);
    const todayNo = today ? rows.findIndex(r => r.date === today) + 1 : 0;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-5 flex-wrap">
                {FLOW_SERIES.map(s => (
                    <div key={s.key} className="flex items-center gap-1.5 text-xs">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.fill }} />
                        <span className="text-slate-500">{s.label}</span>
                        <span className="font-bold text-slate-700 tabular-nums">{num(s.key === 'in' ? totalIn : totalOut)}</span>
                    </div>
                ))}
                {activeDays > 0 && (
                    <span className="text-[11px] text-slate-400 pl-3 border-l border-slate-200">
                        실적일 {num(activeDays)}일 · 일평균 입고 {num(Math.round(totalIn / activeDays))} · 출고 {num(Math.round(totalOut / activeDays))}
                    </span>
                )}
                {totalIn + totalOut === 0 && <span className="text-xs text-slate-400">이 달 입출고 실적이 없습니다.</span>}
            </div>
            <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
                {W > 0 && (
                    <svg width={W} height={H} className="block">
                        {ticks.map(t => (
                            <g key={t}>
                                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#f1f5f9" strokeWidth="1" />
                                <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle"
                                      fill="#94a3b8" fontSize="10" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {num(t)}
                                </text>
                            </g>
                        ))}
                        {rows.map((r, i) => {
                            const x0 = PAD.left + slot * i;
                            const cx = x0 + slot / 2;
                            const dayNo = i + 1;
                            const isToday = r.date === today;
                            const isHover = hover === i;
                            // 날짜 라벨은 1·5·10·…일과 오늘만 — 31개를 다 쓰면 겹친다.
                            // 오늘 바로 옆 날짜도 뺀다 — 좁은 폭에서 「20일」과 「오늘」이 포개진다
                            const showLabel = isToday || ((dayNo === 1 || dayNo % 5 === 0) && Math.abs(dayNo - todayNo) > 1);
                            return (
                                <g key={r.date}>
                                    {(isToday || isHover) && (
                                        <rect x={x0} y={PAD.top} width={slot} height={plotH} rx={3}
                                              fill={isHover ? '#f8fafc' : '#eef2ff'} />
                                    )}
                                    {FLOW_SERIES.map((s, si) => {
                                        const v = r[s.key];
                                        if (v <= 0) return null;
                                        const bx = cx + (si === 0 ? -barW - 1 : 1);
                                        const top = y(v);
                                        const h = Math.max(PAD.top + plotH - top, 0);
                                        const dim = hover != null && !isHover;
                                        const rad = Math.min(3, h, barW / 2);
                                        return (
                                            <path
                                                key={s.key}
                                                d={`M${bx},${top + h} v${-(h - rad)} a${rad},${rad} 0 0 1 ${rad},${-rad} h${barW - 2 * rad} a${rad},${rad} 0 0 1 ${rad},${rad} v${h - rad} z`}
                                                fill={s.fill}
                                                opacity={dim ? 0.3 : 1}
                                                className="transition-opacity"
                                            />
                                        );
                                    })}
                                    {showLabel && (
                                        <text x={cx} y={H - 6} textAnchor="middle" fontSize="10"
                                              fill={isToday ? '#4f46e5' : '#94a3b8'} fontWeight={isToday ? 700 : 400}>
                                            {isToday ? '오늘' : `${dayNo}일`}
                                        </text>
                                    )}
                                    <rect x={x0} y={PAD.top} width={slot} height={plotH + PAD.bottom} fill="transparent"
                                          onMouseEnter={() => setHover(i)} />
                                </g>
                            );
                        })}
                    </svg>
                )}
                {hover != null && W > 0 && (
                    <div
                        className="pointer-events-none absolute top-1 bg-slate-900 text-white rounded-lg px-3 py-2 text-xs shadow-xl"
                        style={{ left: Math.min(PAD.left + slot * (hover + 0.5) + 8, W - 130) }}
                    >
                        <p className="text-slate-400 mb-1">{rows[hover].date} ({DOW[parseYmd(rows[hover].date).getDay()]})</p>
                        {FLOW_SERIES.map(s => (
                            <p key={s.key} className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-sm" style={{ background: s.fill }} />
                                <span className="text-slate-300 w-6">{s.label}</span>
                                <span className="font-bold tabular-nums">{num(rows[hover][s.key])}</span>
                            </p>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const RecentHistory = ({ items }) => {
    if (items.length === 0) return <EmptyNote>이력이 없습니다.</EmptyNote>;
    return (
        <div className="relative">
            <span className="absolute left-[5px] top-2 bottom-2 w-px bg-slate-100" />
            <div className="flex flex-col">
                {items.map(h => {
                    const meta = TX_TYPE_META[h.txTyp];
                    const loc = h.fromLocCd && h.toLocCd ? `${h.fromLocCd} → ${h.toLocCd}` : h.locCd;
                    const minus = h.qty < 0;
                    return (
                        <div key={h.invHistId} className="flex items-center gap-3 text-xs py-2 pl-5 relative">
                            <span className={`absolute left-[2px] w-[7px] h-[7px] rounded-full ring-2 ring-white ${minus ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                            <span className={`shrink-0 w-16 text-center px-2 py-0.5 rounded-full font-bold ${meta?.badge ?? 'bg-slate-100 text-slate-500'}`}>
                                {meta?.label ?? h.txTyp}
                            </span>
                            <span className="font-medium text-slate-700 truncate flex-1 min-w-0">
                                <span className="hidden md:inline text-slate-400 mr-1.5 font-mono text-[11px]">{h.prodCd}</span>{h.prodNm}
                            </span>
                            <span className="hidden sm:block text-slate-400 shrink-0 truncate max-w-[200px] font-mono text-[11px]">{loc}</span>
                            <span className={`font-bold shrink-0 w-16 text-right tabular-nums ${minus ? 'text-rose-500' : 'text-emerald-600'}`}>
                                {h.qty > 0 ? `+${num(h.qty)}` : num(h.qty)}
                            </span>
                            <span className="text-slate-400 shrink-0 text-right tabular-nums">{fmtDt(h.createdAt).slice(5)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
