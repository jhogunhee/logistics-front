import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

/**
 * 사용법:
 *   <DropdownSelect
 *       value={selectedValue}
 *       onChange={(v) => setValue(v)}
 *       options={[
 *           { value: '',   label: '전체' },
 *           { value: 'A',  label: 'A 옵션' },
 *       ]}
 *       placeholder="선택"
 *       variant="bare"      // 'bare' | 'bordered' (기본 bordered)
 *   />
 */
export default function DropdownSelect({
    value,
    onChange,
    options,
    placeholder = '선택',
    variant = 'bordered',
    disabled = false,
    className = '',
}) {
    const [open, setOpen] = useState(false);
    const [highlightIdx, setHighlightIdx] = useState(0);
    const [coords, setCoords] = useState(null); // { top?, bottom?, left, width } — 옵션 목록을 포털로 띄우기 위한 트리거 기준 좌표
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    const listRef = useRef(null);

    const selected = options.find(o => o.value === value);
    const displayLabel = selected ? selected.label : placeholder;

    // 옵션 목록은 document.body에 포털로 띄운다 (fixed 좌표).
    // 페이지 카드가 overflow-auto라, 그 안에 absolute로 띄우면 목록 높이만큼 카드 스크롤이 늘어나 버림 — 포털로 그 문제를 완전히 피한다.
    // 트리거 아래 공간이 목록(max-h-60=240px)보다 좁고 위쪽이 더 넓으면 위로 펼친다 (화면 하단 트리거가 뷰포트 밖으로 잘리는 것 방지).
    const LIST_MAX_HEIGHT = 240;
    const updateCoords = () => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUpward = spaceBelow < LIST_MAX_HEIGHT && spaceAbove > spaceBelow;
        setCoords(openUpward
            ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width }
            : { top: rect.bottom + 4, left: rect.left, width: rect.width });
    };

    // 외부 클릭 시 닫기 (트리거 + 포털된 목록 둘 다 감안)
    useEffect(() => {
        if (!open) return;
        const onClickOutside = (e) => {
            if (containerRef.current?.contains(e.target)) return;
            if (listRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        // 스크롤/리사이즈되면 좌표가 어긋나므로 재계산 대신 닫는다 (단순하고 이 앱 규모엔 충분)
        const onScrollOrResize = () => setOpen(false);
        document.addEventListener('mousedown', onClickOutside);
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
        return () => {
            document.removeEventListener('mousedown', onClickOutside);
            window.removeEventListener('scroll', onScrollOrResize, true);
            window.removeEventListener('resize', onScrollOrResize);
        };
    }, [open]);

    // 열 때 현재 선택 항목으로 highlight + 좌표 계산
    const openList = () => {
        const idx = options.findIndex(o => o.value === value);
        setHighlightIdx(idx >= 0 ? idx : 0);
        updateCoords();
        setOpen(true);
    };

    // 키보드 네비게이션
    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) { openList(); return; }
            setHighlightIdx(i => Math.min(i + 1, options.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) { openList(); return; }
            setHighlightIdx(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (open) {
                const opt = options[highlightIdx];
                if (opt) { onChange(opt.value); setOpen(false); }
            } else {
                openList();
            }
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    const triggerClass = variant === 'bare'
        ? 'w-full flex items-center justify-between gap-2 text-sm font-bold text-slate-700 cursor-pointer focus:outline-none'
        : 'w-full flex items-center justify-between gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400';

    return (
        <div ref={containerRef} className={`relative w-full ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => !disabled && (open ? setOpen(false) : openList())}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className={triggerClass + (disabled ? ' opacity-50 cursor-not-allowed' : '')}
            >
                <span className={`truncate ${selected ? 'text-slate-700' : 'text-slate-400'}`}>
                    {displayLabel}
                </span>
                <ChevronDown size={12} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && coords && createPortal(
                <div
                    ref={listRef}
                    style={{ position: 'fixed', ...coords }}
                    className="z-50 min-w-[160px] bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto py-1"
                    role="listbox"
                >
                    {options.length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-400 text-center">옵션 없음</div>
                    )}
                    {options.map((opt, i) => {
                        const isSelected = opt.value === value;
                        const isHighlighted = highlightIdx === i;
                        return (
                            <button
                                key={opt.value === '' ? `_empty_${i}` : opt.value}
                                type="button"
                                onClick={() => { onChange(opt.value); setOpen(false); }}
                                onMouseEnter={() => setHighlightIdx(i)}
                                role="option"
                                aria-selected={isSelected}
                                className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left transition-colors ${
                                    isHighlighted
                                        ? 'bg-indigo-50 text-indigo-700 font-bold'
                                        : isSelected
                                            ? 'text-indigo-600 font-bold'
                                            : 'text-slate-700 font-medium hover:bg-slate-50'
                                }`}
                            >
                                <span className="truncate">{opt.label}</span>
                                {isSelected && <Check size={14} className="text-indigo-500 shrink-0" />}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
        </div>
    );
}
