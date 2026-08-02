import { useState } from 'react';

import StockMoveOrder from './StockMoveOrder';
import StockMoveTaskList from './StockMoveTaskList';

const TABS = [
    { key: 'order', label: '이동지시등록' },
    { key: 'tasks', label: '이동지시 관리' },
];

/**
 * 재고 이동 (사이드 메뉴 1개). 이동은 지시(예약) → 확정(실물 MOVE) 2단계지만
 * 메뉴는 하나로 묶고 탭으로 오간다. 탭 전환 시 컴포넌트가 다시 마운트되므로
 * 등록 직후 관리 탭으로 넘어가면 방금 등록한 지시가 바로 조회된다.
 */
export default function StockMove() {
    const [tab, setTab] = useState('order');

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
                {tab === 'order' ? <StockMoveOrder /> : <StockMoveTaskList />}
            </div>
        </div>
    );
}
