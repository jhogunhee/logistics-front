import { useEffect, useState } from 'react';
import { Search, Truck, X } from 'lucide-react';

import { outbOrderApi } from '@/api/outbOrderApi';
import { num } from '@/utils/format';

/**
 * 원 출고 선택 팝업 — 반품주문의 라인 미리채움 출처. 점포의 출고확정(SHIPPED) 문서만 보여준다.
 * @param storeId  점포 id (필수 — 없으면 목록이 비어 있다)
 * @param onSelect 선택 확정 콜백. 출고 헤더 객체 하나를 넘긴다 (라인은 호출자가 outbOrderApi.lines로 받는다)
 */
export default function OutbOrderPickerModal({ open, storeId, onClose, onSelect }) {
    // null=조회 중 / []=조회했지만 없음 — 초기값을 []로 두면 로딩과 진짜 빈 목록을 구분할 수 없다
    const [orders, setOrders] = useState(null);
    const [keyword, setKeyword] = useState('');

    useEffect(() => {
        if (!open || !storeId) return;
        let ignore = false;
        (async () => {
            setOrders(null);
            try {
                const data = await outbOrderApi.list({ storeId, status: 'SHIPPED' });
                if (!ignore) setOrders(data);
            } catch {
                if (!ignore) setOrders([]); // 실패 토스트는 axios 인터셉터가 띄운다
            }
        })();
        return () => { ignore = true; };
    }, [open, storeId]);

    if (!open) return null;
    const kw = keyword.trim().toLowerCase();
    const filtered = orders === null ? null : (kw ? orders.filter(o => o.outbNo.toLowerCase().includes(kw)) : orders);

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-[560px] max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                    <Truck size={16} className="text-indigo-600" />
                    <span className="font-bold text-slate-800">원 출고 선택</span>
                    <span className="text-xs text-slate-400">출고확정된 문서만 · 고르면 라인이 들어옵니다</span>
                    <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600"><X size={16} /></button>
                </div>
                <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-2">
                    <Search size={13} className="text-slate-400" />
                    <input autoFocus value={keyword} onChange={(e) => setKeyword(e.target.value)}
                           placeholder="출고번호" className="flex-1 text-sm outline-none" />
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                    {filtered === null && (
                        <div className="py-10 text-center text-sm text-slate-400">불러오는 중…</div>
                    )}
                    {filtered !== null && filtered.length === 0 && (
                        <div className="py-10 text-center text-sm text-slate-400">출고확정된 문서가 없습니다</div>
                    )}
                    {filtered?.map(o => (
                        <button key={o.outbOrderId} onClick={() => { onSelect(o); onClose(); }}
                                className="w-full px-5 py-2.5 flex items-center gap-4 text-left hover:bg-indigo-50/60">
                            <span className="w-40 font-medium text-slate-700">{o.outbNo}</span>
                            <span className="w-24 text-sm text-slate-500">{o.expctDe}</span>
                            <span className="text-sm text-slate-500">라인 {num(o.lineCount)} · 수량 {num(o.totalOrderQty)} EA</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
