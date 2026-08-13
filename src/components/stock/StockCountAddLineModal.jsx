import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';

import DropdownSelect from '@/components/common/DropdownSelect';
import ProdPickerModal from '@/components/common/ProdPickerModal';
import { invStktkApi } from '@/api/invStktkApi';
import { locApi } from '@/api/locApi';
import { lotApi } from '@/api/lotApi';

/**
 * 조사 라인 수동 추가 팝업.
 *
 * 보관 로케이션·Lot 목록은 이 팝업이 직접 조회한다 — 상세 화면이 진입할 때마다 미리 받아두면
 * 열지도 않을 팝업을 위해 매번 조회하게 된다.
 *
 * 부모가 열릴 때만 마운트하므로 입력값 초기화 코드가 따로 필요 없다.
 *
 * @param stktkId  대상 조사
 * @param onClose  닫기
 * @param onSaved  추가 성공 콜백 (상세 재조회)
 */
export default function StockCountAddLineModal({ stktkId, onClose, onSaved }) {
    const [form, setForm] = useState({ prod: null, locId: '', lotId: '' });
    const [lots, setLots] = useState([]);
    const [storageLocs, setStorageLocs] = useState([]);
    const [prodPickerOpen, setProdPickerOpen] = useState(false);

    useEffect(() => {
        let ignore = false;
        locApi.list({ locTyp: 'STORAGE' }).then(locs => { if (!ignore) setStorageLocs(locs); });
        return () => { ignore = true; };
    }, []);

    const pickProd = async (prod) => {
        setForm(prev => ({ ...prev, prod, lotId: '' }));
        setProdPickerOpen(false);
        setLots(await lotApi.listByProd(prod.prodId));
    };

    const doAdd = async () => {
        if (!form.prod || !form.locId || !form.lotId) {
            toast.error('상품·로케이션·Lot을 모두 선택하세요.');
            return;
        }
        try {
            await invStktkApi.addLine(stktkId, {
                prodId: form.prod.prodId,
                locId: Number(form.locId),
                lotId: Number(form.lotId),
            });
            toast.success('조사 라인을 추가했습니다.');
            onClose();
            onSaved();
        } catch (e) {
            toast.error(e.message || '라인 추가에 실패했습니다.');
        }
    };

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20"
                 onMouseDown={onClose}>
                <div className="bg-white rounded-2xl shadow-xl p-6 w-[460px] flex flex-col gap-4"
                     onMouseDown={(e) => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-slate-800">조사 라인 추가</h3>
                    <p className="text-xs text-slate-500">
                        장부에 없는 재고를 실사에서 발견했을 때 씁니다. 해당 재고 행이 없으면 전산수량 0으로 담기고,
                        확정 시 (+)조정으로 재고가 새로 생성됩니다. <b>Lot은 이미 있는 것 중에서만</b> 고를 수 있습니다 —
                        Lot 생성은 검수의 소관입니다.
                    </p>

                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <label className="text-xs font-bold text-slate-500 w-20 shrink-0">상품 <span className="text-rose-500">*</span></label>
                            <div className="flex-1 flex items-center gap-2">
                                <span className="text-sm text-slate-700 truncate flex-1">
                                    {form.prod
                                        ? <>{form.prod.prodCd} <span className="text-slate-400">{form.prod.prodNm}</span></>
                                        : <span className="text-slate-400">선택하세요</span>}
                                </span>
                                <button
                                    onClick={() => setProdPickerOpen(true)}
                                    className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">
                                    <Search size={14} />
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="text-xs font-bold text-slate-500 w-20 shrink-0">로케이션 <span className="text-rose-500">*</span></label>
                            <div className="flex-1">
                                <DropdownSelect
                                    value={form.locId}
                                    onChange={(v) => setForm(prev => ({ ...prev, locId: v }))}
                                    options={storageLocs.map(l => ({ value: String(l.locId), label: `${l.locCd} (${l.zonCd})` }))}
                                    placeholder="보관 로케이션 선택"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="text-xs font-bold text-slate-500 w-20 shrink-0">Lot <span className="text-rose-500">*</span></label>
                            <div className="flex-1">
                                <DropdownSelect
                                    value={form.lotId}
                                    onChange={(v) => setForm(prev => ({ ...prev, lotId: v }))}
                                    options={lots.map(l => ({
                                        value: String(l.lotId),
                                        label: `${l.lotNo}${l.expiryDt ? ` (유통기한 ${l.expiryDt})` : ''}`,
                                    }))}
                                    placeholder={form.prod ? 'Lot 선택' : '상품을 먼저 선택하세요'}
                                    disabled={!form.prod}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                        <button onClick={onClose} className="btn-modal-cancel">취소</button>
                        <button onClick={doAdd} className="btn-modal-primary">추가</button>
                    </div>
                </div>
            </div>

            <ProdPickerModal
                open={prodPickerOpen}
                onClose={() => setProdPickerOpen(false)}
                onSelect={pickProd}
            />
        </>
    );
}
