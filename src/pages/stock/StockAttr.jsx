import { useState } from 'react';

import StockAttrChange from './StockAttrChange';
import StockAttrChngHist from './StockAttrChngHist';

const TABS = [
    { key: 'change', label: '속성 정정' },
    { key: 'hist', label: '변경 이력' },
];

/**
 * 재고 속성변경 (사이드 메뉴 1개). 수량이 아닌 속성만 정정한다 —
 * Lot의 제조일자·유통기한 오입력. 재고상태 전환은 「재고 보류」, 수량 정정은 「재고조사」의 일이다.
 *
 * 이 화면은 재고를 한 톨도 움직이지 않아 재고 이력 조회에 아무것도 남기지 않는다.
 * 정정의 원장은 lot_attr_chng 하나이고 그게 「변경 이력」 탭이다.
 */
export default function StockAttr() {
    const [tab, setTab] = useState('change');

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
                {tab === 'change' && <StockAttrChange />}
                {tab === 'hist' && <StockAttrChngHist />}
            </div>
        </div>
    );
}
