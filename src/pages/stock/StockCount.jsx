import { useState } from 'react';

import StockCountList from './StockCountList';
import StockCountDetail from './StockCountDetail';

/**
 * 재고조사(실사) — 사이드 메뉴 1개, 탭 2개.
 *
 * 이 화면이 재고 수량 정정의 유일한 경로다 (건별 즉시 조정 화면을 두지 않는다). 특정 재고 하나만
 * 고치고 싶으면 조사 생성에서 범위를 그 재고로 좁게 잡으면 된다.
 *
 * 조정수량 = 실사수량 − 확정시점 전산수량이라, 확정 후 전산수량은 실사수량과 정확히 일치한다.
 * 조사 중 다른 업무로 재고가 변하면 화면이 「조사 중 변동」으로 표시하고, 확정은 변동된 최신값을
 * 기준으로 조정을 건다.
 */
export default function StockCount() {
    const [tab, setTab] = useState('list');
    const [openId, setOpenId] = useState(null); // 상세 탭이 보고 있는 조사 ID

    const openDetail = (stktkId) => {
        setOpenId(stktkId);
        setTab('detail');
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 탭 */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit shrink-0">
                <button
                    onClick={() => setTab('list')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors
                        ${tab === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    조사 목록
                </button>
                <button
                    onClick={() => setTab('detail')}
                    disabled={openId == null}
                    className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors disabled:text-slate-300 disabled:cursor-not-allowed
                        ${tab === 'detail' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    실사 입력 · 확정
                </button>
            </div>

            <div className="flex-1 min-h-0">
                {tab === 'list' && <StockCountList onOpen={openDetail} />}
                {tab === 'detail' && openId != null && (
                    <StockCountDetail stktkId={openId} onBack={() => setTab('list')} />
                )}
            </div>
        </div>
    );
}
