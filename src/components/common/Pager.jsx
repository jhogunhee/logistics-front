import { ChevronLeft, ChevronRight } from 'lucide-react';

import { num } from '@/utils/format';

/**
 * 서버 페이징 페이저 — 「총 N건」 + ‹ 1 … 4 5 6 … N ›.
 * 기존 화면의 건수 표시 줄(text-xs text-slate-500)이 서 있던 자리에 그대로 들어간다.
 * 1페이지뿐이면 버튼을 그리지 않는다 — 건수만 남아 지금과 똑같이 보인다.
 *
 * @param label     건수 앞에 붙는 말 (예: 「보류 등록」) — 없으면 「총 N건」
 * @param onChange  페이지 번호를 받아 재조회하는 콜백
 */
export default function Pager({ page, size, totCnt, onChange, label }) {
    const last = Math.max(1, Math.ceil((totCnt ?? 0) / size));
    const pages = pageWindow(page, last);

    return (
        <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
            <span>{label ? `${label} ` : ''}총 {num(totCnt ?? 0)}건</span>
            {last > 1 && (
                <div className="flex items-center gap-0.5">
                    <PageBtn disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="이전 페이지">
                        <ChevronLeft size={13} />
                    </PageBtn>
                    {pages.map((p, i) => (
                        p === '…'
                            ? <span key={`gap-${i}`} className="px-1 text-slate-300">…</span>
                            : (
                                <PageBtn key={p} active={p === page} onClick={() => p !== page && onChange(p)}>
                                    {num(p)}
                                </PageBtn>
                            )
                    ))}
                    <PageBtn disabled={page >= last} onClick={() => onChange(page + 1)} aria-label="다음 페이지">
                        <ChevronRight size={13} />
                    </PageBtn>
                </div>
            )}
        </div>
    );
}

function PageBtn({ active, disabled, onClick, children, ...rest }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={`min-w-[26px] h-6 px-1.5 rounded-md text-[11px] tabular-nums transition-colors
                ${active ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}
                disabled:opacity-30 disabled:hover:bg-transparent`}
            {...rest}
        >
            {children}
        </button>
    );
}

// 현재 페이지 ±2를 보여주고 양끝(1, 마지막)은 항상 남긴다. 건너뛴 구간은 「…」 하나로 접는다.
function pageWindow(page, last) {
    const set = new Set([1, last]);
    for (let p = page - 2; p <= page + 2; p++) {
        if (p >= 1 && p <= last) set.add(p);
    }
    const sorted = [...set].sort((a, b) => a - b);
    const out = [];
    sorted.forEach((p, i) => {
        if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
        out.push(p);
    });
    return out;
}
