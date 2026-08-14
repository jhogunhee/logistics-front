import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { todayStr, ymd } from '@/utils/format';

/**
 * 공용 날짜 입력.
 *
 * `<input type="date">`를 대체한다. 네이티브는 달력 팝업을 브라우저가 그려서 CSS가 닿지 않고
 * (아이콘 색 정도가 전부다), 화면 나머지가 Tailwind indigo 톤인데 달력만 OS 위젯으로 튀었다.
 *
 * 구조는 DropdownSelect를 그대로 따른다 — 팝업을 document.body에 포털로 띄우고(카드가
 * overflow-auto라 안에 absolute로 두면 카드 스크롤이 팝업 높이만큼 늘어난다), 아래 공간이
 * 좁으면 위로 펼치고, 외부 클릭·스크롤·리사이즈에 닫는다.
 *
 * 값은 `<input type="date">`와 같은 "YYYY-MM-DD" 문자열이다. 호출부의 value/onChange 계약을
 * 바꾸지 않아야 16곳을 한 번에 갈아끼울 수 있다.
 *
 * 사용법:
 *   <DatePicker value={de} onChange={setDe} max={todayStr()} />
 *   <DatePicker value={de} onChange={setDe} variant="bare" />   // 그리드 셀 안
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

/**
 * "YYYY-MM-DD" → { y, m, d } (m은 1~12). 형식이 맞아도 실재하지 않는 날(2026-02-31)은 null이다
 * — Date가 3월 3일로 조용히 넘겨버리기 때문에 되돌려 확인한다.
 */
const parseYmd = (s) => {
    const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? '').slice(0, 10));
    if (!t) return null;
    const y = Number(t[1]), m = Number(t[2]), d = Number(t[3]);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return { y, m, d };
};

/**
 * 손으로 친 값을 "YYYY-MM-DD"로 정규화. 숫자만 뽑아 8자리면 받는다 —
 * "20260814" · "2026-08-14" · "2026.8.14"가 모두 같은 값이 된다.
 * 창고 업무는 키패드로 8자리를 치는 게 달력 클릭보다 빠른 자리가 많아 타이핑을 남겨둔다.
 */
const normalizeTyped = (raw) => {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length !== 8) return null;
    const s = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    return parseYmd(s) ? s : null;
};

/** 하루 더하기 — 문자열 in, 문자열 out (키보드 이동용) */
const addDays = (s, n) => {
    const p = parseYmd(s);
    if (!p) return s;
    return ymd(new Date(p.y, p.m - 1, p.d + n));
};

/** 달 더하기. 말일 보정 — 1/31에서 다음 달로 가면 2/28(29)로 끌어당긴다 */
const addMonths = (s, n) => {
    const p = parseYmd(s);
    if (!p) return s;
    const last = new Date(p.y, p.m - 1 + n + 1, 0).getDate();
    return ymd(new Date(p.y, p.m - 1 + n, Math.min(p.d, last)));
};

export default function DatePicker({
    value,
    onChange,
    min,
    max,
    disabled = false,
    placeholder = 'YYYY-MM-DD',
    variant = 'bordered',   // 'bordered' | 'bare'(그리드 셀)
    className = '',
    autoFocus = false,
    autoOpen = false,
    /** 달력에서 날짜를 고르거나 지워서 값이 확정된 순간 (그리드 셀 에디터가 편집을 끝내는 자리) */
    onCommit,
    /**
     * 확정 전, 타이핑 한 글자마다 정규화 결과를 흘려보낸다 — 날짜가 되면 "YYYY-MM-DD",
     * 비우면 "", 아직 날짜가 아니면 null.
     *
     * 그리드 셀 에디터가 ag-grid에 진행 중인 값을 계속 알려주기 위한 통로다. ag-grid는 Enter를
     * 자기 리스너로 먼저 처리해 편집을 끝내므로, 확정 때 한 번만 알려주면 그 시점엔 이미 옛 값을
     * 가져간 뒤다.
     */
    onDraftChange,
}) {
    const [text, setText] = useState(value ?? '');
    // autoOpen(그리드 셀)은 처음부터 열린 상태로 시작한다 — 마운트 후 effect에서 열면 한 프레임 늦다
    const [open, setOpen] = useState(autoOpen && !disabled);
    const [coords, setCoords] = useState(null);
    const [view, setView] = useState('day');        // 'day' | 'month'
    const [cursor, setCursor] = useState(() => value || todayStr()); // 보고 있는 달 + 키보드 포커스 날짜
    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const popRef = useRef(null);

    // 바깥에서 값이 바뀌면(행 전환·초기화) 입력 문자열을 맞춘다.
    // effect가 아니라 렌더 중 조정이다 — 값 하나 때문에 렌더를 두 번 돌리지 않는다
    // (React 「Adjusting state when a prop changes」).
    const [lastValue, setLastValue] = useState(value);
    if (value !== lastValue) {
        setLastValue(value);
        setText(value ?? '');
    }

    const isBlocked = (s) => (min && s < min) || (max && s > max);

    const openPicker = () => {
        if (disabled) return;
        setCursor(parseYmd(value) ? value : todayStr());
        setView('day');
        setOpen(true);
    };

    // 그리드 셀처럼 편집이 시작되자마자 포커스를 받아야 하는 자리
    useEffect(() => {
        if (autoFocus) inputRef.current?.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * 팝업 위치. 높이를 상수로 짐작하지 않고 **그려진 팝업을 실제로 잰다** — 처음엔 높이를
     * 320으로 어림했는데 실측이 285.4였고, 그 35px 차이 때문에 아래에 들어가는데도 위로
     * 뒤집히는 구간이 생겼다. 마크업을 조금만 고쳐도 상수는 다시 어긋난다.
     *
     * 그래서 팝업을 먼저 visibility:hidden으로 그려 재고, 좌표가 정해지면 보여준다.
     * useLayoutEffect라 이 왕복이 화면에 그려지기 전에 끝난다.
     *
     * 방향은 아래가 기본이고, 아래가 실제 높이보다 좁고 위가 더 넓을 때만 뒤집는다.
     * 어느 쪽이든 마지막에 뷰포트 안으로 밀어 넣어서(clamp) 잘리는 일이 없게 한다 —
     * 가로 클램프가 없어 오른쪽 끝 컬럼(유통기한 등)에서 화면 밖으로 나가던 것도 여기서 막는다.
     */
    const GAP = 4;
    useLayoutEffect(() => {
        const t = open ? containerRef.current?.getBoundingClientRect() : null;
        const p = open ? popRef.current?.getBoundingClientRect() : null;
        if (open && !(t && p)) return;   // 아직 못 재는 순간은 건너뛴다 (다음 렌더에 잡힌다)

        let next = null;
        if (t && p) {
            const spaceBelow = window.innerHeight - t.bottom;
            // 요구 높이에 GAP을 더하지 않는다 — 4px 모자란다고 뒤집으면 달력이 화면 위쪽을 통째로
            // 가린다. 조금 모자라는 정도는 아래에 둔 채 위로 밀어(아래 clamp) 해결하는 편이 낫다.
            const upward = spaceBelow < p.height && t.top > spaceBelow;
            next = {
                top: upward
                    ? Math.max(GAP, t.top - p.height - GAP)
                    : Math.min(t.bottom + GAP, window.innerHeight - p.height - GAP),
                left: Math.max(GAP, Math.min(t.left, window.innerWidth - p.width - GAP)),
            };
        }
        // 이 setState는 「그려진 것을 재서 되돌리는」 자리라 effect 밖으로 뺄 수 없다.
        setCoords(next);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onClickOutside = (e) => {
            if (containerRef.current?.contains(e.target)) return;
            if (popRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        // 스크롤되면 fixed 좌표가 어긋난다 — 재계산 대신 닫는다(DropdownSelect와 같은 판단).
        // 달력 자신은 스크롤되지 않으므로 목록처럼 예외를 둘 필요가 없다.
        const onScroll = () => setOpen(false);
        const onResize = () => setOpen(false);
        document.addEventListener('mousedown', onClickOutside);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        return () => {
            document.removeEventListener('mousedown', onClickOutside);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
        };
    }, [open]);

    // ── 값 확정 ──────────────────────────────────────────────
    const commit = (next) => {
        onChange(next);
        setText(next);
        setOpen(false);
        onCommit?.(next);
    };

    /**
     * 타이핑한 값을 확정. 못 알아듣거나 min/max 밖이면 직전 값으로 되돌린다 —
     * 공용 입력이라 토스트를 띄울 수 없고, 잘못된 값이 남아 저장으로 흘러가는 것보다 낫다.
     */
    const commitText = () => {
        const raw = text.trim();
        if (raw === '') {
            if (value) onChange('');
            return;
        }
        const norm = normalizeTyped(raw);
        if (!norm || isBlocked(norm)) {
            setText(value ?? '');
            return;
        }
        if (norm !== value) onChange(norm);
        setText(norm);
    };

    // ── 키보드 ───────────────────────────────────────────────
    const handleKeyDown = (e) => {
        // 그리드 셀 안에서 쓰일 때 방향키가 셀 이동으로 새지 않게 막는다
        if (open) e.stopPropagation();

        if (e.key === 'Escape') {
            if (open) { e.stopPropagation(); setOpen(false); }
            return;
        }
        if (!open) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                openPicker();
            } else if (e.key === 'Enter') {
                // 빈 값이라고 달력을 열지 않는다 — 지우고 Enter는 「지우기」다
                e.preventDefault();
                commitText();
            }
            return;
        }
        const move = (fn) => { e.preventDefault(); setView('day'); setCursor(fn); };
        if (e.key === 'ArrowLeft') move(c => addDays(c, -1));
        else if (e.key === 'ArrowRight') move(c => addDays(c, 1));
        else if (e.key === 'ArrowUp') move(c => addDays(c, -7));
        else if (e.key === 'ArrowDown') move(c => addDays(c, 7));
        else if (e.key === 'PageUp') move(c => addMonths(c, -1));
        else if (e.key === 'PageDown') move(c => addMonths(c, 1));
        else if (e.key === 'Enter') {
            e.preventDefault();
            // 입력창을 손댔으면 그 텍스트가 우선이다. 달력이 열려 있다는 이유로 커서 날짜를
            // 확정해 버리면, 값을 지우고 Enter를 쳐도 지워지지 않고 원래 날짜가 되돌아온다.
            const raw = text.trim();
            if (raw === '') { commit(''); return; }
            const typed = normalizeTyped(raw);
            if (!typed) { setText(value ?? ''); return; }   // 못 알아듣는 입력은 되돌린다
            if (typed !== value) {
                if (!isBlocked(typed)) commit(typed);
                return;
            }
            // 텍스트가 현재 값 그대로면 방향키로 옮긴 달력 커서를 확정한다
            if (!isBlocked(cursor)) commit(cursor);
        } else if (e.key === 'Tab') {
            setOpen(false);
        }
    };

    // ── 달력 격자 ────────────────────────────────────────────
    const cur = parseYmd(cursor) ?? parseYmd(todayStr());
    const grid = useMemo(() => {
        const start = new Date(cur.y, cur.m - 1, 1 - new Date(cur.y, cur.m - 1, 1).getDay());
        // 항상 6주(42칸)를 그린다 — 달마다 높이가 바뀌면 팝업이 덜컹거린다
        return Array.from({ length: 42 }, (_, i) => {
            const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
            return { str: ymd(d), day: d.getDate(), inMonth: d.getMonth() === cur.m - 1 };
        });
    }, [cur.y, cur.m]);

    const today = todayStr();
    const shiftMonth = (n) => setCursor(c => addMonths(c || today, n));
    const shiftYear = (n) => setCursor(c => addMonths(c || today, n * 12));

    const triggerClass = variant === 'bare'
        ? 'w-full h-full pl-2 pr-7 bg-white text-sm border-0 outline-none'
        : 'input-base w-full pr-8';

    return (
        <div ref={containerRef} className={`relative ${variant === 'bare' ? 'h-full' : ''} ${className}`}>
            <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={text}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(e) => {
                    const raw = e.target.value;
                    setText(raw);
                    if (onDraftChange) {
                        const t = raw.trim();
                        onDraftChange(t === '' ? '' : normalizeTyped(t));
                    }
                }}
                onBlur={commitText}
                onKeyDown={handleKeyDown}
                className={triggerClass + (disabled ? ' opacity-50 cursor-not-allowed' : '')}
            />
            <button
                type="button"
                tabIndex={-1}
                disabled={disabled}
                // 포커스를 입력에 붙들어 둔다 — 아이콘으로 포커스가 옮겨가면 그리드 셀에서는
                // ag-grid가 「셀을 벗어났다」고 보고 편집을 끝내 달력이 열리자마자 사라진다
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => (open ? setOpen(false) : openPicker())}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 disabled:opacity-40"
            >
                <CalendarIcon size={14} />
            </button>

            {open && createPortal(
                <div
                    ref={popRef}
                    // 좌표가 아직 없는 첫 렌더는 재기 위한 것이라 숨겨둔다 (레이아웃 이펙트가 곧 채운다)
                    style={coords
                        ? { position: 'fixed', top: coords.top, left: coords.left }
                        : { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
                    // 포커스를 입력에 붙들어 둔다 — 놓치면 ag-grid가 셀 편집을 끝내버려
                    // 팝업째 사라진다. 선택은 onClick이 처리하므로 mousedown은 필요 없다.
                    onMouseDown={(e) => e.preventDefault()}
                    className="z-50 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-1.5"
                >
                    {/* 머리 — 제목을 누르면 월 선택으로 바뀐다. 제조일자처럼 몇 달·몇 년 과거를
                        찍어야 하는 자리에서 화살표만으로는 클릭이 너무 많다 */}
                    <div className="flex items-center justify-between mb-0.5">
                        <button type="button" onClick={() => (view === 'day' ? shiftMonth(-1) : shiftYear(-1))}
                            className="p-0.5 rounded hover:bg-slate-100 text-slate-500">
                            <ChevronLeft size={16} />
                        </button>
                        <button type="button" onClick={() => setView(v => (v === 'day' ? 'month' : 'day'))}
                            className="px-2 py-0.5 rounded text-sm font-bold text-slate-700 hover:bg-slate-100">
                            {view === 'day' ? `${cur.y}년 ${cur.m}월` : `${cur.y}년`}
                        </button>
                        <button type="button" onClick={() => (view === 'day' ? shiftMonth(1) : shiftYear(1))}
                            className="p-1 rounded hover:bg-slate-100 text-slate-500">
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    {view === 'day' ? (
                        <>
                            <div className="grid grid-cols-7 mb-0.5">
                                {WEEKDAYS.map((w, i) => (
                                    <div key={w} className={`text-center text-[11px] font-bold ${
                                        i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>
                                        {w}
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7">
                                {grid.map(({ str, day, inMonth }) => {
                                    const selected = str === value;
                                    const blocked = isBlocked(str);
                                    return (
                                        <button
                                            key={str}
                                            type="button"
                                            disabled={blocked}
                                            onClick={() => commit(str)}
                                            className={`h-6 mx-auto w-6 rounded-full text-[12px] transition-colors ${
                                                selected
                                                    ? 'bg-indigo-600 text-white font-bold'
                                                    : blocked
                                                        ? 'text-slate-300 cursor-not-allowed'
                                                        : inMonth
                                                            ? 'text-slate-700 font-medium hover:bg-indigo-50'
                                                            : 'text-slate-300 hover:bg-slate-50'
                                            } ${!selected && str === today ? ' ring-1 ring-indigo-300' : ''} ${
                                                !selected && str === cursor ? ' bg-slate-100' : ''}`}
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="grid grid-cols-3 gap-0.5 py-0.5">
                            {MONTHS.map((label, i) => {
                                const isCur = i === cur.m - 1;
                                return (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => {
                                            setCursor(c => ymd(new Date(cur.y, i, Math.min(parseYmd(c)?.d ?? 1, new Date(cur.y, i + 1, 0).getDate()))));
                                            setView('day');
                                        }}
                                        className={`py-1.5 rounded-lg text-[12px] transition-colors ${
                                            isCur ? 'bg-indigo-600 text-white font-bold' : 'text-slate-700 font-medium hover:bg-indigo-50'}`}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex items-center justify-between mt-0.5 pt-0.5 border-t border-slate-100">
                        <button type="button" disabled={isBlocked(today)} onClick={() => commit(today)}
                            className="px-2 py-0.5 rounded text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:hover:bg-transparent">
                            오늘
                        </button>
                        <button type="button" onClick={() => commit('')}
                            className="px-2 py-0.5 rounded text-[11px] font-bold text-slate-400 hover:bg-slate-50">
                            지우기
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
