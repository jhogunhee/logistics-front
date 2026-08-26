import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';

import DropdownSelect from '@/components/common/DropdownSelect';
import ProdPickerModal from '@/components/common/ProdPickerModal';
import { locApi } from '@/api/locApi';
import { lotApi } from '@/api/lotApi';

/**
 * 조정 라인 직접 추가 팝업 — 장부에 없는 재고 조합을 (+) 조정으로 올릴 때 쓴다.
 *
 * 서버를 부르지 않고 고른 조합을 부모의 편집 그리드로 돌려준다 — 조정은 저장 즉시 발효라
 * 담기 단계에 저장할 헤더가 없다 (조사 라인 추가가 그 자리에서 서버에 붙는 것과 갈리는 지점).
 *
 * 보관 로케이션·Lot 목록은 이 팝업이 직접 조회한다 — 부모가 미리 받아두면 열지도 않을 팝업을
 * 위해 매번 조회하게 된다. 부모가 열릴 때만 마운트하므로 입력값 초기화 코드가 따로 필요 없다.
 *
 * @param onClose  닫기
 * @param onPick   { prodId, prodCd, prodNm, locId, locCd, lotId, lotNo, expiryDt } 콜백
 */
export default function StockAdjAddLineModal({ onClose, onPick }) {
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

    const doAdd = () => {
        if (!form.prod || !form.locId || !form.lotId) {
            toast.error('상품·로케이션·Lot을 모두 선택하세요.');
            return;
        }
        const loc = storageLocs.find(l => String(l.locId) === String(form.locId));
        const lot = lots.find(l => String(l.lotId) === String(form.lotId));
        onPick({
            prodId: form.prod.prodId, prodCd: form.prod.prodCd, prodNm: form.prod.prodNm,
            locId: Number(form.locId), locCd: loc?.locCd ?? '',
            lotId: Number(form.lotId), lotNo: lot?.lotNo ?? '', expiryDt: lot?.expiryDt ?? null,
        });
        onClose();
    };

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20"
                 onMouseDown={onClose}>
                <div className="bg-white rounded-2xl shadow-xl p-6 w-[460px] flex flex-col gap-4"
                     onMouseDown={(e) => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-slate-800">조정 라인 직접 추가</h3>
                    <p className="text-xs text-slate-500">
                        장부에 없는 재고 조합을 <b>(+) 조정</b>으로 올립니다 — 직전 조정을 되돌리는 것이 주 용도입니다.
                        <b> 실사에서 발견한 재고·기초재고는 재고조사</b>가 맡습니다(장부와 실물의 차이라서).
                        <b> Lot은 이미 있는 것 중에서만</b> 고를 수 있습니다 — Lot 생성은 검수의 소관입니다.
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
                        <button onClick={doAdd} className="btn-modal-primary">담기</button>
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
