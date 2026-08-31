import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { daysAheadStr, todayStr, ymd } from '@/utils/format';
import DropdownSelect from './DropdownSelect';
import DatePicker from './DatePicker';
import ProdPickerModal from './ProdPickerModal';
import LocPickerModal from './LocPickerModal';
import StorePickerModal from './StorePickerModal';
import PartnerPickerModal from './PartnerPickerModal';

const SearchBarCtx = createContext(null);

// 응답이 빨라도 버튼 변화가 보이게 스피너를 이만큼은 유지한다
const MIN_BUSY_MS = 350;

export default function SearchBar({ onSearch, cond, setCond, label = '검색', children }) {
    const [busy, setBusy] = useState(false);

    // 결과가 이전과 같으면 화면이 그대로라 조회가 됐는지 알 수 없다 —
    // 조회 중 스피너가 「방금 다녀왔다」를 남긴다
    const runSearch = async () => {
        if (busy) return;
        setBusy(true);
        const startedAt = Date.now();
        try {
            await Promise.resolve(onSearch?.());
        } catch {
            // 조회 실패 토스트는 axios 응답 인터셉터가 띄운다
        } finally {
            const rest = MIN_BUSY_MS - (Date.now() - startedAt);
            if (rest > 0) await new Promise(r => setTimeout(r, rest));
            setBusy(false);
        }
    };

    return (
        <SearchBarCtx.Provider value={{ onSearch: runSearch, cond, setCond }}>
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
                    onClick={runSearch}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 shrink-0 disabled:bg-indigo-400 disabled:cursor-wait disabled:active:scale-100"
                >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
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
 * 검색 조건 상품 코드 (SearchBar의 cond[name]에 바인딩 · Enter로 조회)
 *
 * 직접 타이핑(부분일치 검색)과 돋보기 팝업 선택을 병행한다 — 코드를 아는 사용자는
 * 그냥 치고, 모르면 팝업에서 골라 채운다. 팝업 선택은 정확한 코드 하나를 넣을 뿐이라
 * 서버 검색 API(contains)는 그대로 통한다.
 */
export function SearchProd({ name = 'prodCd', label = '상품', placeholder = 'PROD-0001', required, wide = true }) {
    const { cond, setCond, onSearch } = useContext(SearchBarCtx);
    const [pickerOpen, setPickerOpen] = useState(false);
    // 팝업에서 고른 상품 — 화면에는 명칭을 보여주고 검색키는 코드(cond[name])로 나간다.
    // cond의 코드가 이 상품의 코드와 같을 때만 유효로 판정해, 조건이 다른 경로로 바뀌어도 표시가 어긋나지 않는다
    const [picked, setPicked] = useState(null);
    const isPicked = picked != null && cond[name] === picked.prodCd;
    const setValue = (v) => setCond(prev => ({ ...prev, [name]: v }));
    return (
        <SearchItem label={label} required={required} wide={wide}>
            <div className="relative">
                <input
                    type="text"
                    value={isPicked ? picked.prodNm : cond[name]}
                    title={isPicked ? picked.prodCd : undefined}
                    onChange={(e) => {
                        // 명칭이 표시된 상태에서 타이핑하면 선택을 풀고 빈 코드 입력으로 돌아간다
                        if (isPicked) {
                            setPicked(null);
                            setValue('');
                            return;
                        }
                        setValue(e.target.value);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                    placeholder={placeholder}
                    className={`w-full input-base pr-12 ${isPicked ? 'text-indigo-700 font-medium' : ''}`}
                />
                <div className="absolute inset-y-0 right-2 flex items-center gap-0.5">
                    {cond[name] && (
                        <button
                            type="button"
                            onClick={() => { setPicked(null); setValue(''); }}
                            title="지우기"
                            className="p-0.5 text-slate-300 hover:text-slate-500">
                            <X size={13} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        title="상품 팝업에서 선택"
                        className="p-0.5 text-slate-400 hover:text-indigo-600">
                        <Search size={14} />
                    </button>
                </div>
            </div>
            <ProdPickerModal
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onSelect={(p) => {
                    setPicked({ prodCd: p.prodCd, prodNm: p.prodNm });
                    setValue(p.prodCd);
                }}
            />
        </SearchItem>
    );
}

/**
 * 검색 조건 로케이션 (SearchBar의 cond[name]에 바인딩 · Enter로 조회)
 *
 * 직접 타이핑과 돋보기 팝업 선택을 병행한다 — 로케이션 코드는 존-열-단-칸 체계라
 * 앞부분 타이핑(부분일치)이 유효하고, 팝업 선택은 정확한 코드를 채울 뿐이라
 * 서버 검색(contains)은 그대로 통한다. 상품(SearchProd)과 같은 패턴.
 */
export function SearchLoc({ name = 'locCd', label = '로케이션', placeholder = 'DRY-A-01-01', required, wide }) {
    const { cond, setCond, onSearch } = useContext(SearchBarCtx);
    const [pickerOpen, setPickerOpen] = useState(false);
    const setValue = (v) => setCond(prev => ({ ...prev, [name]: v }));
    return (
        <SearchItem label={label} required={required} wide={wide}>
            <div className="relative">
                <input
                    type="text"
                    value={cond[name]}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                    placeholder={placeholder}
                    className="w-full input-base pr-12"
                />
                <div className="absolute inset-y-0 right-2 flex items-center gap-0.5">
                    {cond[name] && (
                        <button
                            type="button"
                            onClick={() => setValue('')}
                            title="지우기"
                            className="p-0.5 text-slate-300 hover:text-slate-500">
                            <X size={13} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        title="로케이션 팝업에서 선택"
                        className="p-0.5 text-slate-400 hover:text-indigo-600">
                        <Search size={14} />
                    </button>
                </div>
            </div>
            <LocPickerModal
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onSelect={(l) => setValue(l.locCd)}
            />
        </SearchItem>
    );
}

/**
 * 검색 조건 점포 (SearchBar의 cond[name]에 바인딩).
 *
 * <b>자유 입력이 없는 팝업 전용이다</b> — 조건이 storeId 정확일치라 코드를 치게 하면
 * 오타가 그대로 「결과 없음」이 된다. 코드·점포명 검색은 팝업 안에서 한다
 * (입고예정의 벤더 선택과 같은 방식).
 *
 * cond에 두 키를 쓴다 — <code>name</code>은 서버로 가는 storeId,
 * <code>nmName</code>은 버튼에 보일 점포명이다(표시 전용).
 */
export function SearchStore({ name = 'storeId', nmName = 'storeNm', label = '점포', required, wide }) {
    const { cond, setCond } = useContext(SearchBarCtx);
    const [pickerOpen, setPickerOpen] = useState(false);
    const picked = cond[nmName];
    return (
        <SearchItem label={label} required={required} wide={wide}>
            <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-left flex items-center justify-between gap-2 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400">
                <span className={`truncate ${picked ? 'text-slate-700' : 'text-slate-400'}`}>
                    {picked || '전체'}
                </span>
                {picked
                    ? <X
                        size={13}
                        title="점포 조건 지우기"
                        className="shrink-0 text-slate-400 hover:text-slate-600"
                        onClick={(e) => { e.stopPropagation(); setCond(prev => ({ ...prev, [name]: '', [nmName]: '' })); }}
                      />
                    : <Search size={13} className="shrink-0 text-slate-400" />}
            </button>
            <StorePickerModal
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onSelect={(st) => setCond(prev => ({ ...prev, [name]: st.storeId, [nmName]: st.storeNm }))}
            />
        </SearchItem>
    );
}

/**
 * 검색 조건 선택 (SearchBar의 cond[name]에 바인딩)
 *
 * `multiple`을 주면 여러 값을 함께 고를 수 있고 cond[name]이 배열이 된다 —
 * 상태처럼 「지시 + 진행중」을 같이 보는 조건에 쓴다. 빈 배열이 전체다.
 */
/**
 * 상대처(벤더 · 점포) 조건. 값은 <b>이름 문자열</b>이다 — 서버가 벤더명·점포명을 한 조건으로
 * 훑기 때문에(`vndrNm contains … or storeNm contains …`) 고른 이름을 그대로 검색어로 쓴다.
 * {@link SearchStore}가 id를 넘기는 것과 다른 이유가 이것이다.
 */
export function SearchPartner({ name = 'vndrNm', label = '상대처', required, wide }) {
    const { cond, setCond } = useContext(SearchBarCtx);
    const [pickerOpen, setPickerOpen] = useState(false);
    const picked = cond[name];
    return (
        <SearchItem label={label} required={required} wide={wide}>
            <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-left flex items-center justify-between gap-2 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400">
                <span className={`truncate ${picked ? 'text-slate-700' : 'text-slate-400'}`}>
                    {picked || '전체'}
                </span>
                {picked
                    ? <X
                        size={13}
                        title="상대처 조건 지우기"
                        className="shrink-0 text-slate-400 hover:text-slate-600"
                        onClick={(e) => { e.stopPropagation(); setCond(prev => ({ ...prev, [name]: '' })); }}
                      />
                    : <Search size={13} className="shrink-0 text-slate-400" />}
            </button>
            <PartnerPickerModal
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onSelect={(pt) => setCond(prev => ({ ...prev, [name]: pt.name }))}
            />
        </SearchItem>
    );
}

export function SearchSelect({ name, label, options, placeholder = '전체', multiple, required, wide }) {
    const { cond, setCond } = useContext(SearchBarCtx);
    return (
        <SearchItem label={label} required={required} wide={wide}>
            <DropdownSelect
                value={cond[name]}
                onChange={(v) => setCond(prev => ({ ...prev, [name]: v }))}
                options={options}
                placeholder={placeholder}
                multiple={multiple}
            />
        </SearchItem>
    );
}

const monthRange = (offset) => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    return [ymd(first), ymd(last)];
};

const DATE_PRESETS = [
    { key: 'today', label: '오늘', short: '오늘', range: () => [todayStr(), todayStr()] },
    { key: 'yesterday', label: '어제', short: '어제', range: () => [daysAheadStr(-1), daysAheadStr(-1)] },
    { key: 'last7', label: '최근 7일', short: '7일', range: () => [daysAheadStr(-6), todayStr()] },
    { key: 'last30', label: '최근 30일', short: '30일', range: () => [daysAheadStr(-29), todayStr()] },
    { key: 'thisMonth', label: '이번 달', short: '이달', range: () => monthRange(0) },
    { key: 'lastMonth', label: '지난달', short: '지난달', range: () => monthRange(-1) },
    { key: 'next7', label: '향후 7일', short: '+7일', range: () => [todayStr(), daysAheadStr(6)] },
];

/**
 * 기간 빠른 선택. SearchDateRange의 `~` 자리에 들어가 폭을 더 쓰지 않는다.
 * 목록은 DropdownSelect와 같이 포털로 띄우고, 외부 클릭·스크롤·리사이즈에 닫는다.
 */
function DateRangePresets({ from, to, onPick }) {
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState(null);
    const triggerRef = useRef(null);
    const listRef = useRef(null);

    const active = DATE_PRESETS.find(p => {
        const [f, t] = p.range();
        return f === from && t === to;
    });

    const LIST_MAX_HEIGHT = 260;
    const updateCoords = () => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUpward = spaceBelow < LIST_MAX_HEIGHT && spaceAbove > spaceBelow;
        setCoords(openUpward
            ? { bottom: window.innerHeight - rect.top + 4, left: rect.left }
            : { top: rect.bottom + 4, left: rect.left });
    };

    useEffect(() => {
        if (!open) return;
        const onClickOutside = (e) => {
            if (triggerRef.current?.contains(e.target)) return;
            if (listRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        const onScroll = (e) => {
            if (listRef.current?.contains(e.target)) return;
            setOpen(false);
        };
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

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                title="기간 빠른 선택"
                onClick={() => {
                    if (open) { setOpen(false); return; }
                    updateCoords();
                    setOpen(true);
                }}
                className={`shrink-0 flex items-center gap-0.5 px-1 py-1 rounded text-xs hover:bg-slate-100 ${
                    active ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}
            >
                <span>{active ? active.short : '~'}</span>
                <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && coords && createPortal(
                <div
                    ref={listRef}
                    style={{ position: 'fixed', ...coords }}
                    className="z-50 w-28 bg-white border border-slate-200 rounded-lg shadow-lg py-1"
                >
                    {DATE_PRESETS.map(p => (
                        <button
                            key={p.key}
                            type="button"
                            onClick={() => {
                                const [f, t] = p.range();
                                onPick(f, t);
                                setOpen(false);
                            }}
                            className={`w-full px-3 py-1.5 text-sm text-left transition-colors ${
                                active?.key === p.key
                                    ? 'text-indigo-600 font-bold'
                                    : 'text-slate-700 font-medium hover:bg-slate-50'}`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}

/**
 * 검색 조건 날짜 범위 (SearchBar의 cond[from] ~ cond[to]에 바인딩)
 *
 * 가운데 `~`는 기간 빠른 선택 버튼이다 (오늘·최근 7일·이번 달 등).
 * 프리셋이 맞지 않는 기간 조건은 `presets={false}`로 끄면 `~` 텍스트로 돌아간다.
 */
export function SearchDateRange({ from, to, label, required, wide = true, presets = true }) {
    const { cond, setCond } = useContext(SearchBarCtx);
    const onChange = (name) => (v) => setCond(prev => ({ ...prev, [name]: v }));
    return (
        <SearchItem label={label} required={required} wide={wide}>
            <div className="flex items-center gap-2">
                {/* 시작일의 상한 = 종료일, 종료일의 하한 = 시작일 — 뒤집힌 기간을 달력에서 아예 못 고르게 한다 */}
                <DatePicker
                    value={cond[from]}
                    onChange={onChange(from)}
                    max={cond[to] || undefined}
                    className="flex-1 min-w-0"
                />
                {presets
                    ? <DateRangePresets
                        from={cond[from]}
                        to={cond[to]}
                        onPick={(f, t) => setCond(prev => ({ ...prev, [from]: f, [to]: t }))}
                      />
                    : <span className="text-slate-400 shrink-0">~</span>}
                <DatePicker
                    value={cond[to]}
                    onChange={onChange(to)}
                    min={cond[from] || undefined}
                    className="flex-1 min-w-0"
                />
            </div>
        </SearchItem>
    );
}