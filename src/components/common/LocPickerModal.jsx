import { useEffect, useMemo, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';

import { locApi } from '@/api/locApi';
import { LOC_TYPE_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { num } from '@/utils/format';

/**
 * 로케이션 선택 팝업 (VendorPickerModal과 같은 형태).
 *
 * 목록은 처음 열 때 한 번만 받아오고 검색은 클라이언트에서 건다 — 마스터라 건수가 적고
 * 자주 바뀌지 않아서, 타이핑마다 서버를 때리는 것보다 즉시 반응하는 쪽이 낫다.
 *
 * @param open     열림 여부
 * @param onClose  닫기
 * @param onSelect 선택 확정 콜백. 로케이션 객체 하나를 넘긴다
 */
export default function LocPickerModal({ open, onClose, onSelect }) {
    const [locs, setLocs] = useState(null); // null = 아직 안 받아옴
    const [keyword, setKeyword] = useState('');

    useEffect(() => {
        if (!open) return;
        setKeyword('');
        if (locs !== null) return;

        let ignore = false;
        locApi.list().then(data => { if (!ignore) setLocs(data); });
        return () => { ignore = true; };
    }, [open]);

    const filtered = useMemo(() => {
        if (!locs) return [];
        const kw = keyword.trim().toLowerCase();
        if (!kw) return locs;
        // 코드/존 어디에 걸려도 찾히게 한다 — 코드가 존으로 시작하는 체계라 한 칸이면 충분하다
        return locs.filter(l =>
            l.locCd.toLowerCase().includes(kw) ||
            l.zonCd.toLowerCase().includes(kw)
        );
    }, [locs, keyword]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/20" onMouseDown={onClose}>
            <div
                className="bg-white rounded-2xl shadow-xl w-[720px] max-h-[80vh] flex flex-col"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-indigo-600" />
                        <h3 className="text-base font-bold text-slate-800">로케이션 선택</h3>
                        <span className="text-xs text-slate-400">행을 클릭하면 선택됩니다</span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                {/* 검색 */}
                <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            placeholder="로케이션 코드 · 존으로 검색"
                            autoFocus
                            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                        />
                    </div>
                </div>

                {/* 컬럼 헤더 */}
                <div className="flex items-center gap-3 px-6 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-500 shrink-0">
                    <span className="flex-1 min-w-0">로케이션 코드</span>
                    <span className="w-24 shrink-0">존</span>
                    <span className="w-24 shrink-0 text-center">온도대</span>
                    <span className="w-20 shrink-0 text-center">유형</span>
                    <span className="w-28 shrink-0 text-right">최대 적재 수량</span>
                </div>

                {/* 목록 */}
                <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
                    {locs === null && (
                        <div className="py-16 text-center text-sm text-slate-400">불러오는 중…</div>
                    )}
                    {locs !== null && filtered.length === 0 && (
                        <div className="py-16 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                            <Search size={20} className="text-slate-300" />
                            조건에 맞는 로케이션이 없습니다
                        </div>
                    )}
                    {filtered.map(l => {
                        const tz = TEMP_ZONE_META[l.tmpZon];
                        const lt = LOC_TYPE_META[l.locTyp];
                        return (
                            <div
                                key={l.locId}
                                onClick={() => { onSelect(l); onClose(); }}
                                className="flex items-center gap-3 px-6 py-2 cursor-pointer hover:bg-slate-50"
                            >
                                <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-700">{l.locCd}</span>
                                <span className="w-24 shrink-0 text-sm text-slate-500">{l.zonCd}</span>
                                <span className="w-24 shrink-0 flex justify-center">
                                    {tz && (
                                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${tz.badge}`}>
                                            {tz.label} {l.tmpZon}
                                        </span>
                                    )}
                                </span>
                                <span className="w-20 shrink-0 text-center text-sm text-slate-500">{lt?.label ?? l.locTyp}</span>
                                <span className="w-28 shrink-0 text-right text-sm text-slate-600 tabular-nums">
                                    {l.maxQty == null ? <span className="text-slate-400">무제한</span> : num(l.maxQty)}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* 푸터 */}
                <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200">
                    <span className="text-xs text-slate-400">
                        로케이션 {num(filtered.length)}건
                    </span>
                    <button
                        onClick={onClose}
                        className="btn-modal-cancel">
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}
