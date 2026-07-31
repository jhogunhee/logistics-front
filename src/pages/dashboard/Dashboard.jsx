import { useEffect, useState } from 'react';
import { Barcode, ClipboardCheck, History, PackageOpen, PackageSearch, Truck } from 'lucide-react';

import { asnApi, ASN_STATUS_META } from '@/api/asnApi';
import { putawayApi } from '@/api/putawayApi';
import { prodApi } from '@/api/prodApi';
import { invHistApi, TX_TYPE_META } from '@/api/invHistApi';

const todayStr = () => new Date().toISOString().slice(0, 10);

// ISO 일시("2026-07-16T14:03:21...") → "2026-07-16 14:03"
const formatDateTime = (v) => (v ? v.replace('T', ' ').slice(0, 16) : '');

const STATUS_ORDER = ['SCHEDULED', 'RECEIVING', 'RECEIVED', 'COMPLETED'];
const STATUS_BAR_COLOR = {
    SCHEDULED: 'bg-slate-300',
    RECEIVING: 'bg-amber-400',
    RECEIVED: 'bg-sky-400',
    COMPLETED: 'bg-emerald-400',
};

const StatCard = ({ title, value, icon: Icon, hint }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            {Icon && <Icon size={22} />}
        </div>
        <div className="min-w-0">
            <p className="text-xs text-slate-400 font-medium">{title}</p>
            <p className="text-xl font-bold text-slate-800">{value}</p>
            {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
        </div>
    </div>
);

const Panel = ({ title, action, children }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">{title}</h3>
            {action}
        </div>
        {children}
    </div>
);

const StatusDistribution = ({ asns }) => {
    const total = asns.length;
    const counts = STATUS_ORDER.map(status => ({
        status,
        count: asns.filter(a => a.status === status).length,
    }));

    if (total === 0) {
        return <p className="text-sm text-slate-400 text-center py-6">데이터가 없습니다.</p>;
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex h-3 gap-[2px] rounded-full overflow-hidden bg-slate-100">
                {counts.filter(c => c.count > 0).map(c => (
                    <div
                        key={c.status}
                        className={STATUS_BAR_COLOR[c.status]}
                        style={{ width: `${(c.count / total) * 100}%` }}
                        title={`${ASN_STATUS_META[c.status].label} ${c.count}건`}
                    />
                ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {counts.map(c => (
                    <div key={c.status} className="flex items-center gap-1.5 text-xs">
                        <span className={`w-2 h-2 rounded-full ${STATUS_BAR_COLOR[c.status]}`} />
                        <span className="text-slate-500">{ASN_STATUS_META[c.status].label}</span>
                        <span className="font-bold text-slate-700">{c.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const RecentHistory = ({ items }) => {
    if (items.length === 0) {
        return <p className="text-sm text-slate-400 text-center py-6">이력이 없습니다.</p>;
    }
    return (
        <div className="flex flex-col gap-2">
            {items.map(h => {
                const meta = TX_TYPE_META[h.txTyp];
                return (
                    <div key={h.invHistId} className="flex items-center gap-3 text-xs">
                        <span className={`shrink-0 px-2 py-0.5 rounded-full font-bold ${meta?.badge ?? 'bg-slate-100 text-slate-500'}`}>
                            {meta?.label ?? h.txTyp}
                        </span>
                        <span className="font-medium text-slate-700 truncate flex-1 min-w-0">{h.prodCd} {h.prodNm}</span>
                        <span className="text-slate-400 shrink-0">
                            {h.locCd}{h.pairedLocCd ? ` → ${h.pairedLocCd}` : ''}
                        </span>
                        <span className={`font-bold shrink-0 w-12 text-right ${h.qty < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                            {h.qty > 0 ? `+${h.qty}` : h.qty}
                        </span>
                        <span className="text-slate-400 shrink-0 w-28 text-right">{formatDateTime(h.createdAt)}</span>
                    </div>
                );
            })}
        </div>
    );
};

export default function Dashboard() {
    const [asns, setAsns] = useState([]);
    const [putawayPending, setPutawayPending] = useState([]);
    const [prodCount, setProdCount] = useState(0);
    const [recentHist, setRecentHist] = useState([]);

    useEffect(() => {
        let ignore = false;
        Promise.all([
            asnApi.list(),
            putawayApi.lines(),
            prodApi.list(),
            invHistApi.list(),
        ]).then(([asnData, putawayData, prodData, histData]) => {
            if (ignore) return;
            setAsns(asnData);
            setPutawayPending(putawayData);
            setProdCount(prodData.length);
            setRecentHist(histData.slice(0, 8));
        });
        return () => { ignore = true; };
    }, []);

    const todayAsnCount = asns.filter(a => a.expctDe === todayStr()).length;
    const receivingCount = asns.filter(a => a.status === 'RECEIVING').length;

    return (
        <div className="flex flex-col gap-5">
            <h2 className="text-lg font-bold text-slate-800">대시보드</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="금일 입고예정" value={`${todayAsnCount}건`} icon={Truck} hint={todayStr()} />
                <StatCard title="검수중" value={`${receivingCount}건`} icon={ClipboardCheck} hint="입고예정(ASN) 기준" />
                <StatCard title="적치대기 배치" value={`${putawayPending.length}건`} icon={PackageOpen} hint="RCV-STAGE 미적치" />
                <StatCard title="등록 상품" value={`${prodCount}종`} icon={Barcode} hint="마스터 기준" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel title="입고예정 상태 분포">
                    <StatusDistribution asns={asns} />
                </Panel>

                <Panel
                    title="최근 재고이력"
                    action={<History size={15} className="text-slate-300" />}
                >
                    <RecentHistory items={recentHist} />
                </Panel>
            </div>

            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-6 flex items-center gap-4 text-slate-400">
                <PackageSearch size={22} />
                <div>
                    <p className="text-sm font-bold text-slate-500">출고 프로세스 준비중</p>
                    <p className="text-xs mt-0.5">할당/피킹/출고확정이 붙으면 이 자리에 출고 현황이 표시됩니다.</p>
                </div>
            </div>
        </div>
    );
}