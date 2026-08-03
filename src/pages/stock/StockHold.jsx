import { useState } from 'react';

import StockHoldRegister from './StockHoldRegister';
import StockHoldList from './StockHoldList';
import StockHoldAcrst from './StockHoldAcrst';

const TABS = [
    { key: 'register', label: '보류등록' },
    { key: 'list', label: '보류 관리' },
    { key: 'acrst', label: '실적 조회' },
];

/**
 * 재고 보류 (사이드 메뉴 1개). 등록 즉시 발효(가용 차감)라 지시→확정 2단계가 아니고,
 * 해제는 보류 관리 탭에서 특정 건을 지목해 부분 해제한다. 등록/해제 실적은 별도 로그
 * 테이블 조회(실적 조회 탭) — 물리 이동이 아니라 재고 이력 조회에는 나오지 않는다.
 */
export default function StockHold() {
    const [tab, setTab] = useState('register');

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 탭 */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit shrink-0">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors
                            ${tab === t.key
                                ? 'bg-white text-indigo-700 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 min-h-0">
                {tab === 'register' && <StockHoldRegister />}
                {tab === 'list' && <StockHoldList />}
                {tab === 'acrst' && <StockHoldAcrst />}
            </div>
        </div>
    );
}
