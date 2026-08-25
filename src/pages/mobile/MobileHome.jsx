import { Link } from 'react-router-dom';
import { ChevronRight, Layers, PackageOpen } from 'lucide-react';

/** PDA에 열린 작업 화면들 — 실행(실적을 쌓는 행위)만 올린다. 지시 발행·관리는 데스크톱 몫 */
const TASKS = [
    { to: '/m/picking', label: '피킹', desc: '출고 집품 — 보관 로케이션에서 집어 SHIP-STAGE로', icon: PackageOpen },
    { to: '/m/putaway', label: '적치', desc: '입고 적치 — RCV-STAGE에서 지시된 보관 로케이션으로', icon: Layers },
];

/** PDA 홈 — 작업 종류를 고른다. 현장 화면이라 큰 터치 카드뿐이다 */
export default function MobileHome() {
    return (
        <div className="flex flex-col gap-3 h-full">
            <h2 className="text-lg font-bold text-slate-800">작업 선택</h2>
            {TASKS.map(t => (
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
    );
}
