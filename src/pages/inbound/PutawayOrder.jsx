import { useState } from 'react';

import PutawayOrderRegister from './PutawayOrderRegister';
import PutawayTaskList from './PutawayTaskList';

const TABS = [
    { key: 'order', label: '지시 등록' },
    { key: 'tasks', label: '지시 관리' },
];

/**
 * 적치지시 (사이드 메뉴 1개). 적치는 지시(전략 배정) → 실행(실물 MOVE) 2단계지만
 * 발행과 관리는 같은 업무라 메뉴 하나에 탭으로 묶는다 (재고 이동 화면과 같은 구성).
 * 실행은 별도 화면(적치)이 맡는다 — 지시를 내리는 사람과 물건을 옮기는 사람이 다르기 때문이다.
 */
export default function PutawayOrder() {
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
                {tab === 'order' ? <PutawayOrderRegister /> : <PutawayTaskList />}
            </div>
        </div>
    );
}
