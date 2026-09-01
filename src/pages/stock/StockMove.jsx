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
 *
 * <b>탭을 자동으로 넘기지는 않는다.</b> 등록 후에도 이어서 더 낼 수 있어야 해서
 * 등록 화면이 재고를 다시 불러오게 두고, 관리 탭으로 가는 것은 사람이 고른다
 * (등록 화면이 띄우는 안내 줄의 버튼이 `onGoTasks`를 부른다).
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
                {tab === 'order'
                    ? <StockMoveOrder onGoTasks={() => setTab('tasks')} />
                    : <StockMoveTaskList />}
            </div>
        </div>
    );
}
