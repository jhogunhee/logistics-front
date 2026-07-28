import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileInput, Package, Plus, RotateCcw, Save, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import ProdPickerModal from '@/components/common/ProdPickerModal';
import VendorPickerModal from '@/components/common/VendorPickerModal';
import { omsIbOrderApi } from '@/api/omsIbOrderApi';
import { TEMP_ZONE_META } from '@/api/prodApi';

// 오늘 날짜 "YYYY-MM-DD" (입고 예정일 기본값)
const todayStr = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = () => ({ vendorId: '', expctDt: todayStr(), lines: [] });

const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400';

/** 마스터 영역 필드 (라벨 위 / 입력 아래) */
const Field = ({ label, required, hint, children }) => (
    <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-slate-500 flex items-center gap-0.5">
            {label}
            {required && <span className="text-red-500 font-black">*</span>}
        </label>
        {children}
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </div>
);

export default function InboundOrder() {
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    // null이면 닫힘 / 'add'면 다중 추가 / 숫자면 그 인덱스 라인의 상품 교체
    const [pickerFor, setPickerFor] = useState(null);
    const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
    const navigate = useNavigate();

    // 선택된 벤더는 코드/명까지 폼에 담아둔다 (표시용). 저장 시엔 vendorId만 보낸다.
    const pickVendor = (v) => setForm(prev => ({
        ...prev,
        vendorId: v.vendorId,
        vndrCd: v.vndrCd,
        vndrNm: v.vndrNm,
    }));

    // 라인은 선택 시점의 상품 마스터 정보를 그대로 담는다 (표시용). 저장 시엔 prodId/수량만 보낸다.
    const addLines = (prods) => {
        setForm(prev => ({
            ...prev,
            lines: [...prev.lines, ...prods.map(s => ({ ...s, orderQty: '' }))],
        }));
    };

    const replaceLineProd = (idx, prod) => {
        setForm(prev => ({
            ...prev,
            lines: prev.lines.map((l, i) => (i === idx ? { ...prod, orderQty: l.orderQty } : l)),
        }));
    };

    const setQty = (idx, orderQty) => {
        setForm(prev => ({
            ...prev,
            lines: prev.lines.map((l, i) => (i === idx ? { ...l, orderQty } : l)),
        }));
    };

    const removeLine = (idx) => setForm(prev => ({
        ...prev,
        lines: prev.lines.filter((_, i) => i !== idx),
    }));

    const totalQty = form.lines.reduce((sum, l) => sum + (Number(l.orderQty) || 0), 0);

    // 팝업에서 이미 담긴 상품을 비활성 처리하기 위한 목록.
    // 라인 교체 모드에선 그 라인 자신은 제외해야 "같은 상품 다시 고르기"가 막히지 않는다.
    const excludeIds = form.lines
        .filter((_, i) => i !== pickerFor)
        .map(l => l.prodId);

    const handleSave = async () => {
        if (!form.vendorId) { toast.error('벤더는 필수입니다.'); return; }
        if (!form.expctDt) { toast.error('입고 예정일은 필수입니다.'); return; }
        if (form.lines.length === 0) { toast.error('발주 상품을 1건 이상 담아주세요.'); return; }
        for (const l of form.lines) {
            if (!(Number(l.orderQty) > 0)) {
                toast.error(`${l.prodNm} 의 발주 수량을 입력하세요.`);
                return;
            }
        }

        setSaving(true);
        try {
            await omsIbOrderApi.create({
                vendorId: Number(form.vendorId),
                expctDt: form.expctDt,
                lines: form.lines.map(l => ({ prodId: l.prodId, orderQty: Number(l.orderQty) })),
            });
            toast.success('입고주문을 등록했습니다. 확정은 관리 화면에서 진행하세요.');
            navigate('/oms/inbound-orders');
        } catch (e) {
            toast.error(e.message || '등록에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <FileInput size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">입고주문</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    벤더 발주 등록 — 확정하면 입고예정(ASN)이 자동 생성됩니다
                </span>
            </div>

            {/* ── 마스터: 주문 정보 ───────────────────────────────── */}
            <section className="border border-slate-200 rounded-xl shrink-0">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 rounded-t-xl">
                    <span className="text-xs font-bold text-slate-600">주문 정보</span>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                    <Field label="주문번호" hint="등록 시 서버가 채번합니다">
                        <input
                            type="text"
                            value="PO-YYYYMMDD-NNN"
                            disabled
                            className={inputCls + ' bg-slate-50 text-slate-400 cursor-not-allowed'}
                        />
                    </Field>
                    {/* 상품과 같은 팝업 방식으로 통일 — 한 폼 안에서 선택 UI가 갈리지 않게 한다 */}
                    <Field
                        label="벤더"
                        required
                        hint={form.vndrCd ? `벤더 코드 ${form.vndrCd}` : '거래중인 벤더만 선택할 수 있습니다'}>
                        <button
                            onClick={() => setVendorPickerOpen(true)}
                            className={inputCls + ' flex items-center justify-between gap-2 text-left hover:border-indigo-300'}>
                            <span className={`truncate ${form.vndrNm ? 'text-slate-700' : 'text-slate-400'}`}>
                                {form.vndrNm || '벤더 선택'}
                            </span>
                            <Search size={13} className="shrink-0 text-slate-400" />
                        </button>
                    </Field>
                    <Field label="입고 예정일" required hint="확정 시 생성될 입고번호(IB-)의 채번 기준일">
                        <input
                            type="date"
                            value={form.expctDt}
                            onChange={(e) => setForm(prev => ({ ...prev, expctDt: e.target.value }))}
                            className={inputCls}
                        />
                    </Field>
                </div>
            </section>

            {/* ── 디테일: 발주 상품 ───────────────────────────────── */}
            <section className="flex-1 min-h-0 flex flex-col border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <Package size={14} className="text-slate-500" />
                        <span className="text-xs font-bold text-slate-600">발주 상품</span>
                        <span className="text-[11px] text-slate-400">
                            {form.lines.length}건 · 총 {totalQty.toLocaleString()}개
                        </span>
                    </div>
                    <button
                        onClick={() => setPickerFor('add')}
                        className="flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-indigo-600 hover:border-indigo-300 transition-colors">
                        <Plus size={13} /> 상품 추가
                    </button>
                </div>

                {/* 컬럼 헤더 — 아래 행들과 같은 폭 규칙을 공유한다 */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-500 shrink-0">
                    <span className="w-10 shrink-0">No.</span>
                    <span className="w-36 shrink-0">상품 코드</span>
                    <span className="flex-1 min-w-0">상품명</span>
                    <span className="w-28 shrink-0 text-center">온도대</span>
                    <span className="w-24 shrink-0 text-right">유통기한</span>
                    <span className="w-36 shrink-0 text-right">발주 수량</span>
                    <span className="w-16 shrink-0" />
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
                    {form.lines.length === 0 && (
                        <div className="py-16 flex flex-col items-center gap-3 text-sm text-slate-400">
                            <Package size={22} className="text-slate-300" />
                            담긴 상품이 없습니다
                            <button
                                onClick={() => setPickerFor('add')}
                                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700">
                                <Search size={13} /> 상품 찾기
                            </button>
                        </div>
                    )}
                    {form.lines.map((line, idx) => {
                        const tz = TEMP_ZONE_META[line.tempZone];
                        return (
                            <div key={line.prodId} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50/70">
                                <span className="w-10 shrink-0 text-xs text-slate-400">{idx + 1}</span>
                                <span className="w-36 shrink-0 text-sm font-medium text-slate-700">{line.prodCd}</span>
                                <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{line.prodNm}</span>
                                <span className="w-28 shrink-0 flex justify-center">
                                    {tz && (
                                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${tz.badge}`}>
                                            {tz.label} {line.tempZone}
                                        </span>
                                    )}
                                </span>
                                <span className="w-24 shrink-0 text-right text-sm text-slate-600">
                                    {line.shelfLifeDays == null
                                        ? <span className="text-slate-400">미관리</span>
                                        : `${line.shelfLifeDays}일`}
                                </span>
                                <input
                                    type="number"
                                    min="1"
                                    value={line.orderQty}
                                    onChange={(e) => setQty(idx, e.target.value)}
                                    placeholder="수량"
                                    className="w-36 shrink-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                                />
                                <span className="w-16 shrink-0 flex justify-center gap-1">
                                    <button
                                        onClick={() => setPickerFor(idx)}
                                        title="상품 바꾸기"
                                        className="text-slate-300 hover:text-indigo-600">
                                        <Search size={14} />
                                    </button>
                                    <button
                                        onClick={() => removeLine(idx)}
                                        title="라인 삭제"
                                        className="text-slate-300 hover:text-red-500">
                                        <Trash2 size={15} />
                                    </button>
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* 합계 */}
                <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs font-bold text-slate-600 shrink-0">
                    <span className="flex-1 text-right">합계</span>
                    <span className="w-36 shrink-0 text-right">{totalQty.toLocaleString()}</span>
                    <span className="w-16 shrink-0" />
                </div>
            </section>

            {/* 액션 */}
            <div className="flex gap-2 justify-end shrink-0">
                <button
                    onClick={() => setForm(EMPTY_FORM())}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                    <RotateCcw size={14} /> 초기화
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 shadow-md active:scale-95 transition-all">
                    <Save size={14} /> {saving ? '등록 중…' : '등록'}
                </button>
            </div>

            <VendorPickerModal
                open={vendorPickerOpen}
                onClose={() => setVendorPickerOpen(false)}
                onSelect={pickVendor}
            />

            {/* 상품 선택 팝업 — 추가는 다중, 라인 교체는 단일 */}
            <ProdPickerModal
                open={pickerFor !== null}
                multiple={pickerFor === 'add'}
                excludeIds={excludeIds}
                onClose={() => setPickerFor(null)}
                onSelect={(picked) => {
                    if (pickerFor === 'add') addLines(picked);
                    else replaceLineProd(pickerFor, picked);
                }}
            />
        </div>
    );
}
