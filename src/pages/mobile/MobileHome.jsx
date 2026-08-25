import { Link } from 'react-router-dom';
import { ArrowLeftRight, Calculator, ChevronRight, Layers, PackageOpen, Send } from 'lucide-react';

/**
 * PDA에 열린 작업 화면들 — 실행(실적을 쌓는 행위)만 올린다. 지시 발행·관리는 데스크톱 몫.
 * 배치는 데스크톱 사이드바와 같은 업무 흐름 순서(입고 → 재고 → 출고)다 — 작업자가
 * 「물건이 흐르는 순서」로 찾게 하고, 두 화면 사이를 오가도 위치 감각이 유지되게 한다.
 */
const GROUPS = [
    {
        title: '입고',
        items: [
            { to: '/m/putaway', label: '적치', desc: 'RCV-STAGE에서 지시된 보관 로케이션으로', icon: Layers },
        ],
    },
    {
        title: '재고',
        items: [
            { to: '/m/stock-move', label: '재고이동', desc: '이동지시 확정 — 출발 로케이션에서 도착 로케이션으로', icon: ArrowLeftRight },
            { to: '/m/stock-count', label: '재고조사', desc: '실사 카운트 — 블라인드 방식으로 실물 수량 입력', icon: Calculator },
        ],
    },
    {
        title: '출고',
        items: [
            { to: '/m/picking', label: '피킹', desc: '집품 — 보관 로케이션에서 집어 SHIP-STAGE로', icon: PackageOpen },
            { to: '/m/shipping', label: '출고확정', desc: '상차 — 주문 라벨을 스캔해 SHIP-STAGE 반출 확정', icon: Send },
        ],
    },
];

/** PDA 홈 — 작업 종류를 고른다. 현장 화면이라 큰 터치 카드뿐이다 */
export default function MobileHome() {
    return (
        <div className="flex flex-col gap-3 h-full overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-800">작업 선택</h2>
            {GROUPS.map(g => (
                <div key={g.title} className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-slate-400 px-1">{g.title}</p>
                    {g.items.map(t => (
                        <Link key={t.to} to={t.to}
                              className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4
                                         active:bg-indigo-50 transition-colors">
                            <span className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                <t.icon size={22} />
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className="block font-bold text-slate-800">{t.label}</span>
                                <span className="block text-xs text-slate-500 truncate">{t.desc}</span>
                            </span>
                            <ChevronRight size={18} className="text-slate-300 shrink-0" />
                        </Link>
                    ))}
                </div>
            ))}
        </div>
    );
}
