import React, { createContext, useContext } from 'react';
import { Search } from "lucide-react";

const SearchBarCtx = createContext(null);

export default function SearchBar({ onSearch, cond, setCond, label = '검색', children }) {
    return (
        <SearchBarCtx.Provider value={{ onSearch, cond, setCond }}>
            <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 shrink-0">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                    {label}
                </span>

                {/* 1. 검색 조건 영역 — 넓은 화면에선 4컬럼까지 한 줄에 배치해 줄바꿈(높이 증가)을 막는다 */}
                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-2 flex-1">
                    {children}
                </div>

                {/* 2. 구분선 */}
                <div className="h-8 w-px bg-slate-100 mx-2"></div>

                {/* 3. 조회 버튼 영역 — 입력 요소와 같은 높이(py-2)로 맞춘다 */}
                <button
                    onClick={onSearch}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 shrink-0"
                >
                    <Search size={15} />
                    <span>조회</span>
                </button>
            </div>
        </SearchBarCtx.Provider>
    );
}

/**
 * 검색 조건 개별 아이템 (명칭 | 요소)
 */
export function SearchItem({ label, required, wide, children }) {
    return (
        <div className={`flex items-center gap-3 ${wide ? 'md:col-span-2' : ''}`}>
            {/* 명칭 (Label) */}
            <span className="text-xs font-bold text-slate-500 w-20 shrink-0 border-r border-slate-100 flex items-center gap-0.5">
                {label}
                {required && <span className="text-red-500 font-black">*</span>}
            </span>
            {/* 입력 요소 (Input / Date / Select) */}
            <div className="flex-1 min-w-0">
                {children}
            </div>
        </div>
    );
}

/**
 * 검색 조건 텍스트 입력 (SearchBar의 cond[name]에 바인딩 · Enter로 조회)
 */
export function SearchText({ name, label, placeholder, required, wide }) {
    const { cond, setCond, onSearch } = useContext(SearchBarCtx);
    return (
        <SearchItem label={label} required={required} wide={wide}>
            <input
                type="text"
                value={cond[name]}
                onChange={(e) => setCond(prev => ({ ...prev, [name]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                placeholder={placeholder}
                className="w-full input-base"
            />
        </SearchItem>
    );
}

/**
 * 검색 조건 날짜 범위 (SearchBar의 cond[from] ~ cond[to]에 바인딩)
 */
export function SearchDateRange({ from, to, label, required, wide = true }) {
    const { cond, setCond } = useContext(SearchBarCtx);
    const onChange = (name) => (e) => setCond(prev => ({ ...prev, [name]: e.target.value }));
    return (
        <SearchItem label={label} required={required} wide={wide}>
            <div className="flex items-center gap-2">
                <input
                    type="date"
                    value={cond[from]}
                    onChange={onChange(from)}
                    className="flex-1 min-w-0 input-base"
                />
                <span className="text-slate-400 shrink-0">~</span>
                <input
                    type="date"
                    value={cond[to]}
                    onChange={onChange(to)}
                    className="flex-1 min-w-0 input-base"
                />
            </div>
        </SearchItem>
    );
}