import { useEffect, useMemo, useRef, useState } from 'react';

import { MENU_ICONS } from '@/layout/menuIcons';

/**
 * 아이콘을 고르는 그리드 셀 편집기.
 *
 * {@link SelectCellEditor}(네이티브 select)를 쓰지 않는 이유 — 아이콘은 이름이 아니라 그림으로
 * 고르는 값이다. `SlidersHorizontal`·`ListTree`가 무엇인지는 목록을 봐도 알 수 없어서,
 * 42개짜리 텍스트 드롭다운은 사실상 고를 수 없는 자리가 된다.
 *
 * 저장되는 값은 언제나 이름(코드)이다 — DB의 `mnu.icon_nm`이 그 이름을 담고,
 * 프론트의 이름표(menuIcons.js)가 컴포넌트로 바꾼다.
 */
export default function IconCellEditor({ value, onValueChange, stopEditing }) {
    const [picked, setPicked] = useState(value ?? '');
    const [q, setQ] = useState('');
    const boxRef = useRef(null);
    const inputRef = useRef(null);

    // 열리자마자 검색부터 칠 수 있게 한다 — 이름을 아는 사람에겐 그게 제일 빠르다
    useEffect(() => { inputRef.current?.focus(); }, []);

    const names = useMemo(() => {
        const kw = q.trim().toLowerCase();
        return Object.keys(MENU_ICONS).filter(n => !kw || n.toLowerCase().includes(kw));
    }, [q]);

    const choose = (name) => {
        setPicked(name);
        onValueChange(name);
        stopEditing();
    };

    return (
        <div
            ref={boxRef}
            tabIndex={-1}
            className="bg-white border border-slate-300 rounded-md shadow-lg outline-none w-[320px]"
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) stopEditing(); }}
            onKeyDown={(e) => { if (e.key === 'Escape') stopEditing(); }}
        >
            <div className="p-2 border-b border-slate-100">
                <input
                    ref={inputRef}
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="아이콘 검색 (box, truck …)"
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-sm
                               placeholder:text-slate-400 focus:outline-none focus:bg-white
                               focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                />
            </div>

            <div className="grid grid-cols-7 gap-1 p-2 max-h-56 overflow-y-auto custom-scrollbar">
                {names.map((name) => {
                    const Icon = MENU_ICONS[name];
                    return (
                        <button
                            key={name}
                            type="button"
                            title={name}
                            onClick={() => choose(name)}
                            className={`h-9 flex items-center justify-center rounded transition-colors ${
                                picked === name
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'}`}
                        >
                            <Icon size={18} />
                        </button>
                    );
                })}
            </div>

            {/* 고른 것의 이름은 남겨 둔다 — 시드·문서에서 이름으로 이야기하는 값이라 확인할 수 있어야 한다 */}
            <div className="px-3 py-1.5 border-t border-slate-100 text-xs text-slate-400 font-mono truncate">
                {names.length === 0 ? '검색 결과 없음' : (picked || '아이콘을 고르세요')}
            </div>
        </div>
    );
}
