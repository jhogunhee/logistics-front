import { useEffect, useMemo, useState } from 'react';
import { Building2, Search, X } from 'lucide-react';

import { vendorApi } from '@/api/vendorApi';
import { num } from '@/utils/format';

/**
 * 벤더(납품처) 선택 팝업.
 *
 * 목록은 처음 열 때 한 번만 받아오고 검색은 클라이언트에서 건다 — 마스터라 건수가 적고
 * 자주 바뀌지 않아서, 타이핑마다 서버를 때리는 것보다 즉시 반응하는 쪽이 낫다.
 * 거래 종료(use_yn='N') 벤더는 애초에 내려받지 않는다(vendorApi.usable) — 서버도 같은 규칙으로 거부한다.
 *
 * @param open     열림 여부
 * @param onClose  닫기
 * @param onSelect 선택 확정 콜백. 벤더 객체 하나를 넘긴다
 */
export default function VendorPickerModal({ open, onClose, onSelect }) {
    const [vendors, setVendors] = useState(null); // null = 아직 안 받아옴
    const [keyword, setKeyword] = useState('');

    useEffect(() => {
        if (!open) return;
        setKeyword('');
        if (vendors !== null) return;

        let ignore = false;
        vendorApi.list().then(data => { if (!ignore) setVendors(data); });
        return () => { ignore = true; };
    }, [open]);

    const filtered = useMemo(() => {
        if (!vendors) return [];
        const kw = keyword.trim().toLowerCase();
        if (!kw) return vendors;
        // 코드/명/담당자 어디에 걸려도 찾히게 한다 — 한 칸으로 끝내는 게 실사용에 편하다
        return vendors.filter(v =>
            v.vndrCd.toLowerCase().includes(kw) ||
            v.vndrNm.toLowerCase().includes(kw) ||
            (v.picNm ?? '').toLowerCase().includes(kw)
        );
    }, [vendors, keyword]);

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
                        <Building2 size={16} className="text-indigo-600" />
                        <h3 className="text-base font-bold text-slate-800">벤더 선택</h3>
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
                            placeholder="벤더 코드 · 벤더명 · 담당자로 검색"
                            autoFocus
                            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                        />
                    </div>
                </div>

                {/* 컬럼 헤더 */}
                <div className="flex items-center gap-3 px-6 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-500 shrink-0">
                    <span className="w-28 shrink-0">벤더 코드</span>
                    <span className="flex-1 min-w-0">벤더명</span>
                    <span className="w-28 shrink-0">담당자</span>
                    <span className="w-36 shrink-0">연락처</span>
                </div>

                {/* 목록 */}
                <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
                    {vendors === null && (
                        <div className="py-16 text-center text-sm text-slate-400">불러오는 중…</div>
                    )}
                    {vendors !== null && filtered.length === 0 && (
                        <div className="py-16 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                            <Search size={20} className="text-slate-300" />
                            조건에 맞는 벤더가 없습니다
                        </div>
                    )}
                    {filtered.map(v => (
                        <div
                            key={v.vendorId}
                            onClick={() => { onSelect(v); onClose(); }}
                            className="flex items-center gap-3 px-6 py-2 cursor-pointer hover:bg-slate-50"
                        >
                            <span className="w-28 shrink-0 text-sm font-medium text-slate-700">{v.vndrCd}</span>
                            <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{v.vndrNm}</span>
                            <span className="w-28 shrink-0 text-sm text-slate-500">{v.picNm ?? '-'}</span>
                            <span className="w-36 shrink-0 text-sm text-slate-500">{v.telNo ?? '-'}</span>
                        </div>
                    ))}
                </div>

                {/* 푸터 */}
                <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200">
                    <span className="text-xs text-slate-400">
                        거래중 벤더 {num(filtered.length)}건
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