import { useEffect, useMemo, useState } from 'react';
import { Check, Package, Search, X } from 'lucide-react';

import DropdownSelect from '@/components/common/DropdownSelect';
import { eaQtyPerInbUomOf, prodApi } from '@/api/prodApi';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { num } from '@/utils/format';

const TEMP_ZONE_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(TEMP_ZONE_META).map(([value, m]) => ({ value, label: `${m.label} ${value}` })),
];

/**
 * 상품의 단위 구성. 부르는 화면의 작업 단위를 보여준다 — 발주(입고주문)는 입고단위,
 * 출고주문은 출고단위. 환산수량은 어느 쪽이든 낱개(EA) 기준이다.
 *
 * 작업단위가 낱개 그 자체면(×1) 화살표 없이 단위 하나만 보여준다 —
 * 전부 "EA → EA ×1"로 그리면 정작 환산이 있는 상품이 눈에 안 띈다.
 */
const UomFlow = ({ prod, uomRole }) => {
    const uomCd = uomRole === 'outb' ? prod.outbUomCd : prod.inbUomCd;
    const eaQty = uomRole === 'outb'
        ? (prod.uoms?.find(u => u.uomCd === prod.outbUomCd)?.eaQty ?? 1)
        : eaQtyPerInbUomOf(prod);
    return (
        <span className="flex items-center justify-center gap-1 text-[11px]">
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">{uomCd}</span>
            {eaQty > 1 && (
                <>
                    <span className="text-slate-300">→</span>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-bold">EA</span>
                    <span className="text-slate-400">×{num(eaQty)}</span>
                </>
            )}
        </span>
    );
};

/**
 * 상품 선택 팝업.
 *
 * 목록은 처음 열 때 한 번만 받아오고 검색은 클라이언트에서 건다 — 마스터라 건수가 적고
 * 자주 바뀌지 않아서, 타이핑마다 서버를 때리는 것보다 즉시 반응하는 쪽이 낫다.
 *
 * @param open        열림 여부
 * @param onClose     닫기
 * @param onSelect    선택 확정 콜백. multiple이면 상품 배열, 아니면 상품 객체 하나
 * @param multiple    true면 체크박스 다중 선택 (여러 라인을 한 번에 추가할 때)
 * @param excludeIds  이미 담긴 prodId 목록 — 중복 선택을 막기 위해 비활성 표시한다
 * @param uomRole     단위 컬럼에 보여줄 작업 단위. 'inb'(기본, 발주) | 'outb'(출고주문)
 */
export default function ProdPickerModal({ open, onClose, onSelect, multiple = false, excludeIds = [], uomRole = 'inb' }) {
    const [prods, setProds] = useState(null); // null = 아직 안 받아옴

    // 목록은 처음 열 때 한 번만 받아온다
    useEffect(() => {
        if (!open || prods !== null) return;
        let ignore = false;
        prodApi.list().then(data => { if (!ignore) setProds(data); });
        return () => { ignore = true; };
    }, [open, prods]);

    if (!open) return null;
    return (
        <ProdPickerBody
            prods={prods}
            onClose={onClose}
            onSelect={onSelect}
            multiple={multiple}
            excludeIds={excludeIds}
            uomRole={uomRole}
        />
    );
}

// 닫히면 언마운트되므로 검색 조건·체크 상태는 열 때마다 새로 시작한다
function ProdPickerBody({ prods, onClose, onSelect, multiple, excludeIds, uomRole }) {
    const [cond, setCond] = useState({ prodCd: '', prodNm: '', tmpZon: '' });
    const [checked, setChecked] = useState(new Set());

    const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);

    const filtered = useMemo(() => {
        if (!prods) return [];
        const cd = cond.prodCd.trim().toLowerCase();
        const nm = cond.prodNm.trim().toLowerCase();
        return prods.filter(s =>
            (!cd || s.prodCd.toLowerCase().includes(cd)) &&
            (!nm || s.prodNm.toLowerCase().includes(nm)) &&
            (!cond.tmpZon || s.tmpZon === cond.tmpZon)
        );
    }, [prods, cond]);

    const toggle = (prodId) => {
        setChecked(prev => {
            const next = new Set(prev);
            if (next.has(prodId)) next.delete(prodId); else next.add(prodId);
            return next;
        });
    };

    const pickSingle = (prod) => {
        if (excluded.has(prod.prodId)) return;
        onSelect(prod);
        onClose();
    };

    const confirmMultiple = () => {
        onSelect(prods.filter(s => checked.has(s.prodId)));
        onClose();
    };

    const selectableCount = filtered.filter(s => !excluded.has(s.prodId)).length;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/20" onMouseDown={onClose}>
            <div
                className="bg-white rounded-2xl shadow-xl w-[840px] max-w-[calc(100vw-2rem)] max-h-[80vh] flex flex-col"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Package size={16} className="text-indigo-600" />
                        <h3 className="text-base font-bold text-slate-800">상품 선택</h3>
                        <span className="text-xs text-slate-400">
                            {multiple ? '여러 건을 체크해 한 번에 담을 수 있습니다' : '행을 클릭하면 선택됩니다'}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                {/* 검색 조건 */}
                <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 grid grid-cols-3 gap-4">
                    <label className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 w-16 shrink-0">상품 코드</span>
                        <input
                            type="text"
                            value={cond.prodCd}
                            onChange={(e) => setCond(prev => ({ ...prev, prodCd: e.target.value }))}
                            placeholder="PROD-0001"
                            className="flex-1 min-w-0 input-base py-1.5"
                        />
                    </label>
                    <label className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 w-14 shrink-0">상품명</span>
                        <input
                            type="text"
                            value={cond.prodNm}
                            onChange={(e) => setCond(prev => ({ ...prev, prodNm: e.target.value }))}
                            placeholder="우유"
                            autoFocus
                            className="flex-1 min-w-0 input-base py-1.5"
                        />
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 w-14 shrink-0">온도대</span>
                        <div className="flex-1 min-w-0">
                            <DropdownSelect
                                value={cond.tmpZon}
                                onChange={(v) => setCond(prev => ({ ...prev, tmpZon: v }))}
                                options={TEMP_ZONE_OPTIONS}
                                placeholder="전체"
                            />
                        </div>
                    </div>
                </div>

                {/* 목록 — 컬럼 헤더는 스크롤 컨테이너 안에 sticky로 둔다.
                    밖에 두면 스크롤바가 생길 때 행 영역만 좁아져 헤더와 어긋난다 */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="sticky top-0 z-10 bg-white flex items-center gap-3 px-6 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-500">
                        {multiple && <span className="w-6 shrink-0" />}
                        <span className="w-32 shrink-0">상품 코드</span>
                        <span className="flex-1 min-w-0">상품명</span>
                        <span className="w-24 shrink-0 text-center">온도대</span>
                        <span className="w-20 shrink-0 text-right">유통기한</span>
                        <span className="w-44 shrink-0 text-center">{uomRole === 'outb' ? '단위 (주문 → 낱개)' : '단위 (발주 → 낱개)'}</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                    {prods === null && (
                        <div className="py-16 text-center text-sm text-slate-400">불러오는 중…</div>
                    )}
                    {prods !== null && filtered.length === 0 && (
                        <div className="py-16 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                            <Search size={20} className="text-slate-300" />
                            조건에 맞는 상품이 없습니다
                        </div>
                    )}
                    {filtered.map(s => {
                        const tz = TEMP_ZONE_META[s.tmpZon];
                        const isExcluded = excluded.has(s.prodId);
                        const isChecked = checked.has(s.prodId);
                        return (
                            <div
                                key={s.prodId}
                                onClick={() => {
                                    if (isExcluded) return;
                                    multiple ? toggle(s.prodId) : pickSingle(s);
                                }}
                                title={isExcluded ? '이미 담긴 상품입니다' : undefined}
                                className={`flex items-center gap-3 px-6 py-2 ${
                                    isExcluded
                                        ? 'opacity-40 cursor-not-allowed'
                                        : `cursor-pointer ${isChecked ? 'bg-indigo-50' : 'hover:bg-slate-50'}`
                                }`}
                            >
                                {multiple && (
                                    <span className={`w-6 shrink-0 flex items-center justify-center h-4 rounded border ${
                                        isChecked ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'
                                    }`}>
                                        {isChecked && <Check size={11} className="text-white" strokeWidth={3} />}
                                    </span>
                                )}
                                <span className="w-32 shrink-0 text-sm font-medium text-slate-700">{s.prodCd}</span>
                                <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{s.prodNm}</span>
                                <span className="w-24 shrink-0 flex justify-center">
                                    {tz && (
                                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${tz.badge}`}>
                                            {tz.label} {s.tmpZon}
                                        </span>
                                    )}
                                </span>
                                <span className="w-20 shrink-0 text-right text-sm text-slate-600">
                                    {s.shelfLifeDays == null
                                        ? <span className="text-slate-400">미관리</span>
                                        : `${s.shelfLifeDays}일`}
                                </span>
                                <span className="w-44 shrink-0">
                                    <UomFlow prod={s} uomRole={uomRole} />
                                </span>
                            </div>
                        );
                    })}
                    </div>
                </div>

                {/* 푸터 */}
                <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200">
                    <span className="text-xs text-slate-400">
                        {num(selectableCount)}건 선택 가능
                        {multiple && checked.size > 0 && ` · ${checked.size}건 선택됨`}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="btn-modal-cancel">
                            닫기
                        </button>
                        {multiple && (
                            <button
                                onClick={confirmMultiple}
                                disabled={checked.size === 0}
                                className="btn-modal-primary disabled:opacity-40">
                                담기 {checked.size > 0 && `(${checked.size})`}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}