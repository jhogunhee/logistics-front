import { useState } from 'react';

import StockLotChngExec from './StockLotChngExec';
import StockLotChngAcrst from './StockLotChngAcrst';

const TABS = [
    { key: 'exec', label: '로트변경' },
    { key: 'acrst', label: '변경 실적' },
];

/**
 * 재고 로트변경 (사이드 메뉴 1개). 수량을 지정한 Lot 속성정정 —
 * 「이 로케이션의 이 재고 중 N개는 제조일자가 X였다」를 원 Lot에서 N개를 빼
 * (상품+입고일자+X) 배치의 Lot으로 넣는 것으로 처리한다 (있으면 병합, 없으면 채번=분할).
 *
 * 재고 속성변경(전량·Lot번호 유지·재고 무이동)과 별개 조작이다 — 여기는 재고가 움직이고
 * (ADJUST 2행) 새 Lot 번호가 발생한다. 전량 정정·재고 0 Lot 정정·라벨 유지가 필요하면
 * 재고 속성변경 화면이 맡는다.
 */
export default function StockLotChng() {
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
                {tab === 'exec' && <StockLotChngExec />}
                {tab === 'acrst' && <StockLotChngAcrst />}
            </div>
        </div>
    );
}
