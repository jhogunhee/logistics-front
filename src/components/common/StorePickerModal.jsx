import { useEffect, useMemo, useState } from 'react';
import { Store, Search, X } from 'lucide-react';

import { storeApi } from '@/api/storeApi';

/**
 * 점포(납품처) 선택 팝업.
 *
 * 목록은 처음 열 때 한 번만 받아오고 검색은 클라이언트에서 건다 — 마스터라 건수가 적고
 * 자주 바뀌지 않아서, 타이핑마다 서버를 때리는 것보다 즉시 반응하는 쪽이 낫다
 * (벤더 선택 팝업과 같은 방식).
 *
 * @param open     열림 여부
 * @param onClose  닫기
 * @param onSelect 선택 확정 콜백. 점포 객체 하나를 넘긴다
 */
export default function StorePickerModal({ open, onClose, onSelect }) {
    const [stores, setStores] = useState(null); // null = 아직 안 받아옴
    const [keyword, setKeyword] = useState('');

    useEffect(() => {
        if (!open) return;
        setKeyword('');
        if (stores !== null) return;

        let ignore = false;
        storeApi.list().then(data => { if (!ignore) setStores(data); });
        return () => { ignore = true; };
    }, [open]);

    const filtered = useMemo(() => {
        if (!stores) return [];
        const kw = keyword.trim().toLowerCase();
        if (!kw) return stores;
        return stores.filter(s =>
            s.storeCd.toLowerCase().includes(kw) ||
            s.storeNm.toLowerCase().includes(kw)
        );
    }, [stores, keyword]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/20" onMouseDown={onClose}>
            <div
                className="bg-white rounded-2xl shadow-xl w-[640px] max-h-[80vh] flex flex-col"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Store size={16} className="text-indigo-600" />
                        <h3 className="text-base font-bold text-slate-800">납품처 선택</h3>
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
                            placeholder="점포 코드 · 점포명으로 검색"
                            autoFocus
                            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                        />
                    </div>
                </div>

                {/* 컬럼 헤더 */}
                <div className="flex items-center gap-3 px-6 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-500 shrink-0">
                    <span className="w-28 shrink-0">점포 코드</span>
                    <span className="flex-1 min-w-0">점포명</span>
                    <span className="w-32 shrink-0 text-right" title="이 점포로 출고할 때 잔여 유통기한이 이 비율 미만인 Lot은 할당에서 빠집니다">
                        납품 잔여수명
                    </span>
                </div>

                {/* 목록 */}
                <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
                    {stores === null && (
                        <div className="py-16 text-center text-sm text-slate-400">불러오는 중…</div>
                    )}
                    {stores !== null && filtered.length === 0 && (
                        <div className="py-16 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                            <Search size={20} className="text-slate-300" />
                            조건에 맞는 점포가 없습니다
                        </div>
                    )}
                    {filtered.map(s => (
                        <div
                            key={s.storeId}
                            onClick={() => { onSelect(s); onClose(); }}
                            className="flex items-center gap-3 px-6 py-2 cursor-pointer hover:bg-slate-50"
                        >
                            <span className="w-28 shrink-0 text-sm font-medium text-slate-700">{s.storeCd}</span>
                            <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{s.storeNm}</span>
                            <span className="w-32 shrink-0 text-right text-sm text-slate-500">{s.outbLifeRate}%</span>
                        </div>
                    ))}
                </div>

                {/* 푸터 */}
                <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200">
                    <span className="text-xs text-slate-400">점포 {filtered.length}건</span>
                    <button onClick={onClose} className="btn-modal-cancel">
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}
