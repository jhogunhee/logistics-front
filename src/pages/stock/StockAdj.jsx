import { useState } from 'react';

import StockAdjExec from './StockAdjExec';
import StockAdjAcrst from './StockAdjAcrst';

const TABS = [
    { key: 'exec', label: '재고조정' },
    { key: 'acrst', label: '조정 실적' },
];

/**
 * 재고조정 (사이드 메뉴 1개). 장부와 실물이 맞는 상태에서 둘을 함께 증감시키는 처분 —
 * 불량 반품 폐기·견본출고가 여기고, 되돌리는 것도 반대 부호 조정 1건이다.
 *
 * 재고조사와 갈리는 지점은 「실물이 그 자리에 있느냐」다. 조사는 장부와 실물이 어긋났을 때
 * 세어본 값으로 장부를 맞추고(조정수량이 파생), 조정은 어긋난 것이 없는데 둘을 함께 줄인다
 * (조정수량이 입력값). 실물이 있는데 실사수량 0으로 적으면 거짓 기록이라 경로를 나눈다.
 */
export default function StockAdj() {
    const [tab, setTab] = useState('exec');

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
                {tab === 'exec' && <StockAdjExec />}
                {tab === 'acrst' && <StockAdjAcrst />}
            </div>
        </div>
    );
}
