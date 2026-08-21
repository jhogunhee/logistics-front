import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertTriangle, ArrowRight, Box, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck,
    History, PackageCheck, PackageOpen, RefreshCw, Send, ShoppingCart, Truck, Waves,
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
const STAGE_RAMP = ['bg-indigo-400', 'bg-indigo-500', 'bg-indigo-700', 'bg-indigo-900', 'bg-indigo-950'];

// 분포는 저장 상태(3값)가 아니라 진행 5단계 파생값(prgr)으로 그린다 — 저장 상태로는
// 검수·적치·확정대기가 전부 「입고중」 한 칸에 뭉쳐 분포라 할 게 없다
const INB_STAGES = ['SCHEDULED', 'RECEIVING', 'PTAWY_DRCT', 'PTAWY_CMPL', 'CONFIRMED'];
// 출고는 저장 상태 자체가 진행 5단계라 입고의 prgr 같은 파생값이 따로 없다
const OUTB_STAGES = ['CREATED', 'ALLOCATED', 'PICKING', 'PICKED', 'SHIPPED'];

const ZONE_ORDER = ['DRY', 'CHL', 'FRZ'];

// 재고 구성 3분류 — 가용/예약/보류는 순서가 아니라 종류라 서로 다른 색.
const INV_PARTS = [
    { key: 'avalQty', label: '가용', bar: 'bg-indigo-500', dot: 'bg-indigo-500' },
    { key: 'alocQty', label: '예약', bar: 'bg-amber-500', dot: 'bg-amber-500' },
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
    const onHand = sum(inv, r => r.onHandQty);
    const avail = sum(inv, r => r.avalQty);
    const expiring = inv
        .filter(r => r.expiryDt && Number(r.onHandQty) > 0 && daysUntil(r.expiryDt) <= EXPIRY_WATCH_DAYS)
        .sort((a, b) => parseYmd(a.expiryDt) - parseYmd(b.expiryDt));
    const openPickTasks = sum(pickingWaves, w => w.openTaskCount);
    const pickRemain = sum(pickingWaves, w => w.remainQty);
    const attentionCount = expiring.length + openPickTasks + putawayPending.length;

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
        <div className={`flex flex-col gap-5 transition-opacity ${loading && updatedAt ? 'opacity-60' : ''}`}>
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">대시보드</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {isCurrentMonth
                            ? `오늘 ${today} (${DOW[parseYmd(today).getDay()]}) · 입고·출고는 이번 달 예정분`
                            : `${monthLabel(month)} 입고·출고 예정분 · 재고는 현재 기준`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-white border border-slate-200 rounded-lg">
                        <button type="button" onClick={() => handleMonthChange(shiftMonth(month, -1))}
                                className="p-1.5 text-slate-400 hover:text-indigo-600" aria-label="이전 달">
                            <ChevronLeft size={15} />
                        </button>
                        <span className="px-2 text-sm font-bold text-slate-700 tabular-nums min-w-[96px] text-center">{monthLabel(month)}</span>
                        <button type="button" onClick={() => handleMonthChange(shiftMonth(month, 1))}
                                className="p-1.5 text-slate-400 hover:text-indigo-600" aria-label="다음 달">
                            <ChevronRight size={15} />
                        </button>
                    </div>
                    {!isCurrentMonth && (
                        <button type="button" onClick={() => handleMonthChange(monthOf(today))} className="btn-ghost">이번 달</button>
                    )}
                    <button type="button" onClick={handleRefresh} disabled={loading} className="btn-ghost">
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        {updatedAt ? `${String(updatedAt.getHours()).padStart(2, '0')}:${String(updatedAt.getMinutes()).padStart(2, '0')} 갱신` : '갱신'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    to="/inbound/asn" icon={Truck} tone="indigo"
                    title={`${Number(month.slice(5, 7))}월 입고예정`} value={asns.length} unit="건"
                    sub={`${num(sum(asns, a => a.totalExpctQty))}개 · 확정 ${num(count(asns, a => a.prgr === 'CONFIRMED'))}건`}
                    meter={pct(count(asns, a => a.prgr === 'CONFIRMED'), asns.length)}
                />
                <StatCard
                    to="/outbound/order" icon={Send} tone="indigo"
                    title={`${Number(month.slice(5, 7))}월 출고예정`} value={outbOrders.length} unit="건"
                    sub={`${num(sum(outbOrders, o => o.totalOrderQty))}개 · 출고확정 ${num(count(outbOrders, o => o.status === 'SHIPPED'))}건`}
                    meter={pct(count(outbOrders, o => o.status === 'SHIPPED'), outbOrders.length)}
                />
                <StatCard
                    to="/stock/status" icon={Box} tone="emerald"
                    title="가용재고" value={avail} unit="개"
                    sub={`보유 ${num(onHand)} · 예약 ${num(sum(inv, r => r.alocQty))} · 보류 ${num(sum(inv, r => r.hldQty))}`}
                    meter={pct(avail, onHand)}
                />
                <StatCard
                    icon={AlertTriangle} tone={attentionCount > 0 ? 'amber' : 'slate'}
                    title="확인 필요" value={attentionCount} unit="건"
                    sub={`유통기한 임박 ${num(expiring.length)} · 미마감 피킹 ${num(openPickTasks)} · 적치대기 ${num(putawayPending.length)}`}
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel title="재고 구성" icon={Box} to="/stock/status" hint={`현재 보유 ${num(onHand)}개`}>
                    <InventoryComposition inv={inv} />
                </Panel>
                <Panel title="유통기한 임박" icon={CalendarClock} hint={`${EXPIRY_WATCH_DAYS}일 이내`}>
                    <ExpiryWatch items={expiring} />
                </Panel>
            </div>

            <Panel title={`${monthLabel(month)} 일별 입출고`} icon={History} hint="재고이력 기준">
                <MonthlyFlow hist={hist} month={month} today={isCurrentMonth ? today : null} />
            </Panel>

            <Panel title={`${monthLabel(month)} 재고이력`} icon={History} to="/stock/history" hint="최근 8건">
                <RecentHistory items={hist.slice(0, 8)} />
            </Panel>
        </div>
    );
}

const TONE = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-500',
};
const METER_TONE = { indigo: 'bg-indigo-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', slate: 'bg-slate-400' };

const StatCard = ({ to, icon: Icon, tone = 'indigo', title, value, unit, sub, meter }) => {
    const body = (
        <>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">{title}</p>
                    <p className="mt-1 text-[28px] leading-none font-bold text-slate-800">
                        {num(value)}<span className="ml-1 text-sm font-semibold text-slate-400">{unit}</span>
                    </p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${TONE[tone]}`}>
                    {Icon && <Icon size={20} />}
                </div>
            </div>
            {sub && <p className="mt-3 text-[11px] text-slate-400 truncate">{sub}</p>}
            {meter != null && (
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${METER_TONE[tone]}`} style={{ width: `${meter}%` }} />
                </div>
            )}
        </>
    );
    const cls = 'block bg-white rounded-xl border border-slate-200 p-5 transition-colors';
    return to
        ? <Link to={to} className={`${cls} hover:border-indigo-300`}>{body}</Link>
        : <div className={cls}>{body}</div>;
};

const Panel = ({ title, icon: Icon, to, hint, children }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4 h-full">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                {Icon && <Icon size={15} className="text-slate-400" />}
                <h3 className="text-sm font-bold text-slate-700">{title}</h3>
                {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
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

/** 진행 단계 분포(적층 막대) + 단계별 건수 + 작업 대기 바로가기 */
const Pipeline = ({ items, stages, statusOf, meta, todos }) => {
    const total = items.length;
    const counts = stages.map((s, i) => ({ status: s, count: count(items, x => statusOf(x) === s), color: STAGE_RAMP[i] }));
    const done = counts[counts.length - 1].count;

    return (
        <div className="flex flex-col gap-4">
            {total === 0 ? (
                <EmptyNote>기간 내 예정 건이 없습니다.</EmptyNote>
            ) : (
                <>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-800">{Math.round(pct(done, total))}%</span>
                        <span className="text-xs text-slate-400">완료 {num(done)} / {num(total)}건</span>
                    </div>
                    <div className="flex h-2.5 gap-[2px] rounded-full overflow-hidden bg-slate-100">
                        {counts.filter(c => c.count > 0).map(c => (
                            <div
                                key={c.status}
                                className={`${c.color} transition-[width]`}
                                style={{ width: `${pct(c.count, total)}%` }}
                                title={`${meta[c.status].label} ${num(c.count)}건`}
                            />
                        ))}
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                        {counts.map((c, i) => (
                            <div key={c.status} className="flex items-center gap-1.5 min-w-0">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${c.color}`} />
                                <div className="min-w-0">
                                    <p className="text-[11px] text-slate-400 truncate">{meta[c.status].label}</p>
                                    <p className={`text-sm font-bold leading-tight ${c.count > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                                        {num(c.count)}
                                    </p>
                                </div>
                                {i < counts.length - 1 && <ArrowRight size={11} className="ml-auto mr-2 text-slate-200 shrink-0" />}
                            </div>
                        ))}
                    </div>
                </>
            )}

            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
                {todos.map(t => (
                    <Link
                        key={t.label} to={t.to}
                        className={`rounded-lg px-3 py-2 flex items-center gap-2 transition-colors
                            ${t.warn ? 'bg-amber-50 hover:bg-amber-100' : 'bg-slate-50 hover:bg-indigo-50'}`}
                    >
                        <t.icon size={14} className={t.warn ? 'text-amber-600' : 'text-slate-400'} />
                        <div className="min-w-0">
                            <p className="text-[10px] text-slate-400 truncate">{t.label}</p>
                            <p className={`text-sm font-bold leading-tight ${t.value > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                                {num(t.value)}<span className="ml-0.5 text-[10px] font-medium text-slate-400">{t.unit}</span>
                            </p>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
};

/** 온도대별 가용/예약/보류 적층 가로막대 + 스테이징 체류 비율 */
const InventoryComposition = ({ inv }) => {
    if (inv.length === 0) return <EmptyNote>재고가 없습니다.</EmptyNote>;

    const zones = ZONE_ORDER.map(z => {
        const rows = inv.filter(r => r.tmpZon === z);
        return { zone: z, onHand: sum(rows, r => r.onHandQty), parts: INV_PARTS.map(p => sum(rows, r => r[p.key])) };
    });
    const maxOnHand = Math.max(...zones.map(z => z.onHand), 1);
    const total = sum(inv, r => r.onHandQty);
    const staged = sum(inv.filter(r => r.locTyp === 'STAGE'), r => r.onHandQty);

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
                {zones.map(z => (
                    <div key={z.zone} className="grid grid-cols-[48px_1fr_64px] items-center gap-3">
                        <span className={`justify-self-start text-[11px] px-2 py-0.5 rounded-full font-bold ${TEMP_ZONE_META[z.zone].badge}`}>
                            {TEMP_ZONE_META[z.zone].label}
                        </span>
                        <div className="flex h-6 gap-[2px]" title={INV_PARTS.map((p, i) => `${p.label} ${num(z.parts[i])}`).join(' · ')}>
                            {z.onHand === 0
                                ? <div className="h-full w-full rounded bg-slate-100" />
                                : INV_PARTS.map((p, i) => z.parts[i] > 0 && (
                                    <div
                                        key={p.key}
                                        className={`h-full ${p.bar} first:rounded-l last:rounded-r`}
                                        style={{ width: `${pct(z.parts[i], maxOnHand)}%` }}
                                    />
                                ))}
                        </div>
                        <span className="text-sm font-bold text-slate-700 text-right tabular-nums">{num(z.onHand)}</span>
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-4">
                    {INV_PARTS.map((p, i) => (
                        <div key={p.key} className="flex items-center gap-1.5 text-xs">
                            <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                            <span className="text-slate-500">{p.label}</span>
                            <span className="font-bold text-slate-700">{num(sum(zones, z => z.parts[i]))}</span>
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-2 text-xs" title="RCV-STAGE · SHIP-STAGE에 머무는 수량">
                    <span className="text-slate-500">스테이징 체류</span>
                    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-slate-400" style={{ width: `${pct(staged, total)}%` }} />
                    </div>
                    <span className="font-bold text-slate-700">{num(staged)}</span>
                    <span className="text-slate-400">({Math.round(pct(staged, total))}%)</span>
                </div>
            </div>
        </div>
    );
};

const ExpiryWatch = ({ items }) => {
    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
                <CheckCircle2 size={22} className="text-emerald-500" />
                <p className="text-sm">{EXPIRY_WATCH_DAYS}일 이내 만료 Lot이 없습니다.</p>
            </div>
        );
    }
    const shown = items.slice(0, 6);
    return (
        <div className="flex flex-col gap-2">
            {shown.map(r => {
                const d = daysUntil(r.expiryDt);
                const tone = d < 0 ? 'bg-rose-100 text-rose-700' : d <= 7 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700';
                return (
                    <div key={r.invId} className="flex items-center gap-3 text-xs">
                        <span className={`shrink-0 w-12 text-center px-1.5 py-0.5 rounded-md font-bold tabular-nums ${tone}`}>
                            {d < 0 ? '만료' : d === 0 ? 'D-day' : `D-${d}`}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-700 truncate">{r.prodNm}</p>
                            <p className="text-slate-400 truncate">{r.lotNo} · {r.locCd}</p>
                        </div>
                        <span className="shrink-0 font-bold text-slate-700 tabular-nums">{num(r.onHandQty)}</span>
                    </div>
                );
            })}
            {items.length > shown.length && (
                <Link to="/stock/status" className="text-[11px] text-slate-400 hover:text-indigo-600 text-right">
                    외 {num(items.length - shown.length)}건 더보기
                </Link>
            )}
        </div>
    );
};

const FLOW_SERIES = [
    { key: 'in', label: '입고', fill: '#6366f1', txTyp: 'RECEIVE' },
    { key: 'out', label: '출고', fill: '#f43f5e', txTyp: 'SHIP' },
];

/** 선택 월의 일자별 입고(RECEIVE)·출고(SHIP) 수량 묶음 세로막대 — SVG 직접 그림 */
const MonthlyFlow = ({ hist, month, today }) => {
    const [hover, setHover] = useState(null);

    const days = monthDays(month);
    const rows = days.map(d => {
        const ofDay = hist.filter(h => String(h.createdAt).slice(0, 10) === d);
        return {
            date: d,
            in: sum(ofDay.filter(h => h.txTyp === 'RECEIVE'), h => h.qty),
            out: Math.abs(sum(ofDay.filter(h => h.txTyp === 'SHIP'), h => h.qty)),
        };
    });
    const yMax = niceMax(Math.max(...rows.flatMap(r => [r.in, r.out])));
    const totalIn = sum(rows, r => r.in);
    const totalOut = sum(rows, r => r.out);

    // 고정 좌표계(900×190)에 그리고 viewBox로 맞춘다 — 컨테이너 폭을 재서 state로 돌리면
    // 스크롤바 생성/소멸과 맞물려 폭이 진동할 수 있다. 900은 전체 폭 카드와 비슷해 글자가 1:1로 보인다
    const W = 900;
    const H = 190;
    const PAD = { top: 8, right: 4, bottom: 22, left: 44 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const slot = plotW / days.length;
    const barW = Math.min(10, (slot - 6) / 2);
    const y = (v) => PAD.top + plotH - (v / yMax) * plotH;
    const ticks = [0, 0.5, 1].map(f => yMax * f);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
                {FLOW_SERIES.map(s => (
                    <div key={s.key} className="flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full" style={{ background: s.fill }} />
                        <span className="text-slate-500">{s.label}</span>
                        <span className="font-bold text-slate-700">{num(s.key === 'in' ? totalIn : totalOut)}</span>
                    </div>
                ))}
                {totalIn + totalOut === 0 && <span className="text-xs text-slate-400">이 달 입출고 실적이 없습니다.</span>}
            </div>
            <div className="relative w-full" onMouseLeave={() => setHover(null)}>
                <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto">
                    {ticks.map(t => (
                        <g key={t}>
                            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#f1f5f9" strokeWidth="1" />
                            <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle"
                                  className="fill-slate-400" fontSize="10" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {num(t)}
                            </text>
                        </g>
                    ))}
                    {rows.map((r, i) => {
                        const x0 = PAD.left + slot * i;
                        const cx = x0 + slot / 2;
                        const dayNo = i + 1;
                        const isToday = r.date === today;
                        // 날짜 라벨은 1·5·10·…일과 오늘만 — 31개를 다 쓰면 겹친다
                        const showLabel = isToday || dayNo === 1 || dayNo % 5 === 0;
                        return (
                            <g key={r.date}>
                                {isToday && <rect x={x0} y={PAD.top} width={slot} height={plotH} fill="#eef2ff" />}
                                {FLOW_SERIES.map((s, si) => {
                                    const v = r[s.key];
                                    if (v <= 0) return null;
                                    const bx = cx + (si === 0 ? -barW - 1 : 1);
                                    const top = y(v);
                                    const h = Math.max(PAD.top + plotH - top, 0);
                                    const dim = hover != null && hover !== i;
                                    const rad = Math.min(4, h, barW / 2);
                                    return (
                                        <path
                                            key={s.key}
                                            d={`M${bx},${top + h} v${-(h - rad)} a${rad},${rad} 0 0 1 ${rad},${-rad} h${barW - 2 * rad} a${rad},${rad} 0 0 1 ${rad},${rad} v${h - rad} z`}
                                            fill={s.fill}
                                            opacity={dim ? 0.35 : 1}
                                        />
                                    );
                                })}
                                {showLabel && (
                                    <text x={cx} y={H - 6} textAnchor="middle" fontSize="10"
                                          className={isToday ? 'fill-indigo-600 font-bold' : 'fill-slate-400'}>
                                        {isToday ? '오늘' : `${dayNo}일`}
                                    </text>
                                )}
                                <rect x={x0} y={PAD.top} width={slot} height={plotH + PAD.bottom} fill="transparent"
                                      onMouseEnter={() => setHover(i)} />
                            </g>
                        );
                    })}
                </svg>
                {hover != null && (
                    <div
                        className="pointer-events-none absolute top-1 bg-slate-800 text-white rounded-lg px-3 py-2 text-xs shadow-lg"
                        style={{ left: `${Math.min((PAD.left + slot * (hover + 0.5)) / W, 0.86) * 100}%` }}
                    >
                        <p className="text-slate-300 mb-1">{rows[hover].date} ({DOW[parseYmd(rows[hover].date).getDay()]})</p>
                        {FLOW_SERIES.map(s => (
                            <p key={s.key} className="flex items-center gap-2">
                                <span className="w-3 h-0.5 rounded" style={{ background: s.fill }} />
                                <span className="font-bold tabular-nums">{num(rows[hover][s.key])}</span>
                                <span className="text-slate-300">{s.label}</span>
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
        <div className="flex flex-col divide-y divide-slate-50">
            {items.map(h => {
                const meta = TX_TYPE_META[h.txTyp];
                const loc = h.fromLocCd && h.toLocCd ? `${h.fromLocCd} → ${h.toLocCd}` : h.locCd;
                return (
                    <div key={h.invHistId} className="flex items-center gap-3 text-xs py-1.5">
                        <span className={`shrink-0 w-16 text-center px-2 py-0.5 rounded-full font-bold ${meta?.badge ?? 'bg-slate-100 text-slate-500'}`}>
                            {meta?.label ?? h.txTyp}
                        </span>
                        <span className="font-medium text-slate-700 truncate flex-1 min-w-0">
                            <span className="text-slate-400 mr-1.5">{h.prodCd}</span>{h.prodNm}
                        </span>
                        <span className="text-slate-400 shrink-0 truncate max-w-[180px]">{loc}</span>
                        <span className={`font-bold shrink-0 w-14 text-right tabular-nums ${h.qty < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                            {h.qty > 0 ? `+${num(h.qty)}` : num(h.qty)}
                        </span>
                        <span className="text-slate-400 shrink-0 w-24 text-right tabular-nums">{fmtDt(h.createdAt).slice(5)}</span>
                    </div>
                );
            })}
        </div>
    );
};
