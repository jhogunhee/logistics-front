import React from 'react';
import { Search } from "lucide-react";

export default function SearchBar({ onSearch, label, children, required }) {
    return (
        <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 shrink-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                {label}
                {/* 필수 표시 추가 */}
                {required && <span className="text-red-500 font-black">*</span>}
            </span>

            {/* 1. 검색 조건 영역 (3컬럼 그리드) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4 flex-1">
                {children}
            </div>

            {/* 2. 구분선 */}
            <div className="h-10 w-px bg-slate-100 mx-2"></div>

            {/* 3. 조회 버튼 영역 */}
            <button
                onClick={onSearch}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 shrink-0"
            >
                <Search size={18} />
                <span>조회</span>
            </button>
        </div>
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