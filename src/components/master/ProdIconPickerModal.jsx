import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, Sparkles, X } from 'lucide-react';

import { PROD_ICONS, PROD_ICON_PREFIX, recommendIcons, searchIcons } from '@/constants/prodIcons';

/**
 * 상품 아이콘 고르기.
 *
 * 셀렉트가 아니라 격자로 보여주는 이유 — 아이콘은 이름이 아니라 생김새로 고르는 것이다.
 * 「우유·유제품」이라는 글자만 보고 고르면 저장한 뒤에야 무엇이 그려질지 알게 된다.
 *
 * 목록이 40개 남짓이라 셋을 함께 둔다 —
 * **추천**(상품명에서 뽑아 맨 위에, 대개 여기서 끝난다) · **검색**(낱말로 좁히기) ·
 * **품목군 격자**(둘 다 안 맞을 때 훑기).
 *
 * @param value    현재 값 (`emoji:🥛`) — 고른 것에 체크 표시가 붙는다
 * @param prodNm   상품명 — 추천의 입력
 * @param onPick   아이콘을 고름 (`emoji:🥛`을 넘긴다)
 * @param onClose  닫기 (배경 클릭 · Esc · 닫기 버튼)
 */
export default function ProdIconPickerModal({ value, prodNm, onPick, onClose }) {
    const [query, setQuery] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    // 열자마자 타이핑할 수 있게 — 추천이 맞으면 그냥 클릭하면 되고, 아니면 바로 검색으로 넘어간다
    useEffect(() => { inputRef.current?.focus(); }, []);

    const found = useMemo(() => searchIcons(query), [query]);
    const recommended = useMemo(() => recommendIcons(prodNm), [prodNm]);

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20"
             onMouseDown={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-[44rem] max-h-[72vh] flex flex-col"
                 onMouseDown={(e) => e.stopPropagation()}>

                <div className="px-6 py-4 border-b border-slate-200 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-800">아이콘 선택</h3>
                        {prodNm && <span className="text-xs text-slate-400 truncate">{prodNm}</span>}
                        <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="우유 · 라면 · 치즈 …"
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200
                                       focus:border-indigo-400 focus:outline-none"
                        />
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-auto px-6 py-4 flex flex-col gap-4">
                    {/* 추천 — 검색 중에는 접는다. 검색은 「추천이 안 맞았다」는 뜻이라 자리를 비켜주는 게 맞다 */}
                    {!found && recommended.length > 0 && (
                        <Section
                            title={<span className="flex items-center gap-1">
                                <Sparkles size={11} /> 상품명에서 추천
                            </span>}
                            items={recommended} value={value} onPick={onPick} />
                    )}

                    {found
                        ? (found.length > 0
                            ? <Section title={`검색 결과 ${found.length}개`} items={found} value={value} onPick={onPick} />
                            : <p className="text-sm text-slate-400 py-8 text-center">
                                  맞는 아이콘이 없습니다. 다른 낱말로 찾아보세요.
                              </p>)
                        : PROD_ICONS.map(({ group, items }) => (
                            <Section key={group} title={group} items={items} value={value} onPick={onPick} />
                        ))}
                </div>
            </div>
        </div>
    );
}

const Section = ({ title, items, value, onPick }) => (
    <section className="flex flex-col gap-2">
        <h4 className="text-[11px] font-bold text-slate-400 tracking-wider">{title}</h4>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(6.5rem, 1fr))' }}>
            {items.map(({ ch, label }) => {
                const val = PROD_ICON_PREFIX + ch;
                const picked = value === val;
                return (
                    <button key={ch} onClick={() => onPick(val)} title={label}
                            className={`relative flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border
                                transition-colors ${picked
                                    ? 'border-indigo-500 bg-indigo-50'
                                    : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}>
                        {picked && <Check size={12} className="absolute top-1 right-1 text-indigo-600" />}
                        <span className="text-2xl leading-none select-none">{ch}</span>
                        <span className={`text-[11px] leading-tight text-center ${picked
                            ? 'text-indigo-700 font-medium' : 'text-slate-500'}`}>
                            {label}
                        </span>
                    </button>
                );
            })}
        </div>
    </section>
);
