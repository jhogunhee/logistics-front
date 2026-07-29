import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileInput, Package, Plus, RotateCcw, Save, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import ProdPickerModal from '@/components/common/ProdPickerModal';
import VendorPickerModal from '@/components/common/VendorPickerModal';
import { omsIbOrderApi } from '@/api/omsIbOrderApi';
import { codeApi } from '@/api/codeApi';
import { cnvrQtyOf, TEMP_ZONE_META } from '@/api/prodApi';

// 오늘 날짜 "YYYY-MM-DD" (입고 예정일 기본값)
const todayStr = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = () => ({
    vendorId: '', expctDe: todayStr(),
    odrDvsn: 'NRML',   // 컬럼 DEFAULT와 같은 값 — 대부분의 발주가 정상 건이다
    picNm: '', rmk: '',
    lines: [],
});

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
    // 경로에 id가 있으면 수정, 없으면 등록. 화면 구성이 같아 컴포넌트를 나누지 않는다.
    const { omsIbOrderId } = useParams();
    const isEdit = Boolean(omsIbOrderId);

    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(isEdit);
    const [odrDvsnCodes, setOdrDvsnCodes] = useState([]);
    // null이면 닫힘 / 'add'면 다중 추가 / 숫자면 그 인덱스 라인의 상품 교체
    const [pickerFor, setPickerFor] = useState(null);
    const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        let ignore = false;
        codeApi.list('ODR_DVSN').then(codes => { if (!ignore) setOdrDvsnCodes(codes); });
        return () => { ignore = true; };
    }, []);

    // 수정 진입 시 주문을 불러온다. 헤더는 목록 API에서, 라인은 라인 API에서 가져온다 —
    // 단건 조회 엔드포인트가 없어서 목록을 주문번호로 좁혀 한 건만 받는다.
    useEffect(() => {
        if (!isEdit) return;
        let ignore = false;
        (async () => {
            try {
                const [orders, lines] = await Promise.all([
                    omsIbOrderApi.list(),
                    omsIbOrderApi.lines(omsIbOrderId),
                ]);
                if (ignore) return;
                const order = orders.find(o => String(o.omsIbOrderId) === String(omsIbOrderId));
                if (!order) {
                    toast.error('주문을 찾을 수 없습니다.');
                    navigate('/oms/inbound-orders');
                    return;
                }
                setForm({
                    omsIbNo: order.omsIbNo,
                    status: order.status,
                    vendorId: order.vendorId,
                    vndrCd: order.vndrCd,
                    vndrNm: order.vndrNm,
                    expctDe: order.expctDe,
                    odrDvsn: order.odrDvsn ?? 'NRML',
                    picNm: order.picNm ?? '',
                    rmk: order.rmk ?? '',
                    lines: lines.map(l => ({ ...l, odrQty: l.odrQty })),
                });
            } catch (e) {
                if (!ignore) toast.error(e.message || '주문을 불러오지 못했습니다.');
            } finally {
                if (!ignore) setLoading(false);
            }
        })();
        return () => { ignore = true; };
    }, [isEdit, omsIbOrderId, navigate]);

    // 확정된 주문은 고칠 수 없다 (서버도 거부한다). 화면에서 미리 잠가 헛수고를 막는다.
    const readOnly = isEdit && form.status && form.status !== 'CREATED';

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
            lines: [...prev.lines, ...prods.map(s => ({ ...s, odrQty: '' }))],
        }));
    };

    const replaceLineProd = (idx, prod) => {
        setForm(prev => ({
            ...prev,
            lines: prev.lines.map((l, i) => (i === idx ? { ...prod, odrQty: l.odrQty } : l)),
        }));
    };

    const setQty = (idx, odrQty) => {
        setForm(prev => ({
            ...prev,
            lines: prev.lines.map((l, i) => (i === idx ? { ...l, odrQty } : l)),
        }));
    };

    const removeLine = (idx) => setForm(prev => ({
        ...prev,
        lines: prev.lines.filter((_, i) => i !== idx),
    }));

    // 발주 수량(입고단위) → 재고 수량(출고단위). 서버가 저장하는 값이 아니라 미리보기다 —
    // 실제 환산은 주문 확정 시 OmsIbOrderService.confirm()가 Prod.toOutbQty()로 한 번만 한다.
    // 여기서 같은 식을 되풀이하는 이유는 담당자가 "몇 개가 들어오는지" 입력하는 중에 봐야 하기 때문.
    const convertedQty = (line) => (Number(line.odrQty) || 0) * cnvrQtyOf(line);

    // 발주 수량은 라인마다 입고단위가 달라(BOX + EA) 더할 수 없다. 합계는 재고 단위로 환산한 쪽만 낸다.
    // 그것도 모든 라인의 출고단위가 같을 때만 — 다르면 숫자 하나로 합칠 근거가 없다.
    const totalConvQty = form.lines.reduce((sum, l) => sum + convertedQty(l), 0);
    const outbUoms = new Set(form.lines.map(l => l.outbUomCd));
    const totalUom = outbUoms.size === 1 ? [...outbUoms][0] : null;

    // 팝업에서 이미 담긴 상품을 비활성 처리하기 위한 목록.
    // 라인 교체 모드에선 그 라인 자신은 제외해야 "같은 상품 다시 고르기"가 막히지 않는다.
    const excludeIds = form.lines
        .filter((_, i) => i !== pickerFor)
        .map(l => l.prodId);

    const handleSave = async () => {
        if (readOnly) { toast.error('작성 상태의 주문만 수정할 수 있습니다.'); return; }
        if (!form.vendorId) { toast.error('벤더는 필수입니다.'); return; }
        if (!form.expctDe) { toast.error('입고 예정일은 필수입니다.'); return; }
        if (form.lines.length === 0) { toast.error('발주 상품을 1건 이상 담아주세요.'); return; }
        for (const l of form.lines) {
            if (!(Number(l.odrQty) > 0)) {
                toast.error(`${l.prodNm} 의 발주 수량을 입력하세요.`);
                return;
            }
        }

        setSaving(true);
        const payload = {
            vendorId: Number(form.vendorId),
            expctDe: form.expctDe,
            odrDvsn: form.odrDvsn,
            picNm: form.picNm?.trim() || null,
            rmk: form.rmk?.trim() || null,
            lines: form.lines.map(l => ({ prodId: l.prodId, odrQty: Number(l.odrQty) })),
        };
        try {
            if (isEdit) {
                await omsIbOrderApi.update(omsIbOrderId, payload);
                toast.success(`${form.omsIbNo} 을(를) 수정했습니다.`);
            } else {
                await omsIbOrderApi.create(payload);
                toast.success('입고주문을 등록했습니다. 확정은 관리 화면에서 진행하세요.');
            }
            navigate('/oms/inbound-orders');
        } catch (e) {
            toast.error(e.message || (isEdit ? '수정에 실패했습니다.' : '등록에 실패했습니다.'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="py-20 text-center text-sm text-slate-400">주문을 불러오는 중…</div>;
    }

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <FileInput size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">
                    {isEdit ? '입고주문 수정' : '입고주문'}
                </h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    {readOnly
                        ? '확정된 주문은 수정할 수 없습니다 — 고치려면 관리 화면에서 확정취소를 먼저 하세요'
                        : '벤더 발주 등록 — 확정하면 입고예정(ASN)이 자동 생성됩니다'}
                </span>
            </div>

            {/* ── 마스터: 주문 정보 ───────────────────────────────── */}
            <section className="border border-slate-200 rounded-xl shrink-0">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 rounded-t-xl">
                    <span className="text-xs font-bold text-slate-600">주문 정보</span>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                    <Field
                        label="주문번호"
                        hint={isEdit ? '채번된 번호는 바뀌지 않습니다 (예정일을 고쳐도 그대로)' : '등록 시 서버가 채번합니다'}>
                        <input
                            type="text"
                            value={form.omsIbNo || 'PO-YYYYMMDD-NNN'}
                            disabled
                            className={inputCls + ` bg-slate-50 cursor-not-allowed ${
                                form.omsIbNo ? 'text-slate-600 font-medium' : 'text-slate-400'}`}
                        />
                    </Field>
                    {/* 발주구분은 지금 표시·분류용이다 — 긴급이라고 적치·피킹 순서가 바뀌지는 않는다 */}
                    <Field label="발주구분" hint="분류용입니다 — 창고 작업 순서를 바꾸지는 않습니다">
                        <select
                            value={form.odrDvsn}
                            onChange={(e) => setForm(prev => ({ ...prev, odrDvsn: e.target.value }))}
                            disabled={readOnly}
                            className={inputCls + ' disabled:bg-slate-50 disabled:cursor-not-allowed'}>
                            {odrDvsnCodes.map(c => (
                                <option key={c.codeCd} value={c.codeCd}>{c.codeNm}</option>
                            ))}
                        </select>
                    </Field>
                    {/* 상품과 같은 팝업 방식으로 통일 — 한 폼 안에서 선택 UI가 갈리지 않게 한다 */}
                    <Field
                        label="벤더"
                        required
                        hint={form.vndrCd ? `벤더 코드 ${form.vndrCd}` : '거래중인 벤더만 선택할 수 있습니다'}>
                        <button
                            onClick={() => setVendorPickerOpen(true)}
                            disabled={readOnly}
                            className={inputCls + ' flex items-center justify-between gap-2 text-left hover:border-indigo-300 disabled:bg-slate-50 disabled:cursor-not-allowed'}>
                            <span className={`truncate ${form.vndrNm ? 'text-slate-700' : 'text-slate-400'}`}>
                                {form.vndrNm || '벤더 선택'}
                            </span>
                            <Search size={13} className="shrink-0 text-slate-400" />
                        </button>
                    </Field>
                    <Field label="입고 예정일" required hint="확정 시 생성될 입고번호(IB-)의 채번 기준일">
                        <input
                            type="date"
                            value={form.expctDe}
                            onChange={(e) => setForm(prev => ({ ...prev, expctDe: e.target.value }))}
                            disabled={readOnly}
                            className={inputCls + ' disabled:bg-slate-50 disabled:cursor-not-allowed'}
                        />
                    </Field>
                    <Field label="담당자" hint="발주를 낸 사람. 등록자 계정과는 별개입니다">
                        <input
                            type="text"
                            value={form.picNm}
                            onChange={(e) => setForm(prev => ({ ...prev, picNm: e.target.value }))}
                            disabled={readOnly}
                            maxLength={30}
                            placeholder="김상현"
                            className={inputCls + ' disabled:bg-slate-50 disabled:cursor-not-allowed'}
                        />
                    </Field>
                    <Field label="비고" hint="벤더 전달사항 등 (ASN으로 넘어가지 않습니다)">
                        <input
                            type="text"
                            value={form.rmk}
                            onChange={(e) => setForm(prev => ({ ...prev, rmk: e.target.value }))}
                            disabled={readOnly}
                            maxLength={200}
                            placeholder="오전 도착 요청"
                            className={inputCls + ' disabled:bg-slate-50 disabled:cursor-not-allowed'}
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
                            {form.lines.length}건
                            {totalUom && ` · 환산 ${totalConvQty.toLocaleString()} ${totalUom}`}
                            {' · 수량은 발주단위 기준입니다'}
                        </span>
                    </div>
                    <button
                        onClick={() => setPickerFor('add')}
                        disabled={readOnly}
                        className="flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-indigo-600 hover:border-indigo-300 transition-colors disabled:opacity-40 disabled:hover:border-slate-200">
                        <Plus size={13} /> 상품 추가
                    </button>
                </div>

                {/* 컬럼 헤더 — 아래 행들과 같은 폭 규칙을 공유한다 */}
                <div className="flex items-center gap-3 px-4 py-1.5 border-b border-slate-200 text-[11px] font-bold text-slate-500 shrink-0">
                    <span className="w-10 shrink-0">No.</span>
                    <span className="w-28 shrink-0">상품 코드</span>
                    <span className="flex-1 min-w-0">상품명</span>
                    <span className="w-24 shrink-0 text-center">온도대</span>
                    <span className="w-20 shrink-0 text-right">유통기한</span>
                    <span className="w-40 shrink-0 text-right">발주 수량</span>
                    <span className="w-36 shrink-0 text-right" title="확정 시 ASN에 이 수량으로 반영됩니다">
                        환산 수량 (재고)
                    </span>
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
                        const tz = TEMP_ZONE_META[line.tmpZon];
                        return (
                            <div key={line.prodId} className="flex items-center gap-3 px-4 py-1 hover:bg-slate-50/70">
                                <span className="w-10 shrink-0 text-xs text-slate-400">{idx + 1}</span>
                                <span className="w-28 shrink-0 text-sm font-medium text-slate-700">{line.prodCd}</span>
                                <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{line.prodNm}</span>
                                <span className="w-24 shrink-0 flex justify-center">
                                    {tz && (
                                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${tz.badge}`}>
                                            {tz.label} {line.tmpZon}
                                        </span>
                                    )}
                                </span>
                                <span className="w-20 shrink-0 text-right text-sm text-slate-600">
                                    {line.shelfLifeDays == null
                                        ? <span className="text-slate-400">미관리</span>
                                        : `${line.shelfLifeDays}일`}
                                </span>
                                {/* 발주 수량 — 단위는 상품이 정하므로 라벨로만 붙는다 (담당자가 고를 수 없다) */}
                                <span className="w-40 shrink-0 flex items-center gap-1.5">
                                    <input
                                        type="number"
                                        min="1"
                                        value={line.odrQty}
                                        onChange={(e) => setQty(idx, e.target.value)}
                                        disabled={readOnly}
                                        placeholder="수량"
                                        className="flex-1 min-w-0 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                                    />
                                    <span className="w-9 shrink-0 text-[11px] font-bold text-slate-500">
                                        {line.inbUomCd}
                                    </span>
                                </span>
                                {/* 환산 수량 — 읽기 전용. 환산이 없는 상품(×1)은 회색으로 눌러 둔다 */}
                                <span className="w-36 shrink-0 flex items-center justify-end gap-1.5">
                                    {Number(line.odrQty) > 0 ? (
                                        <>
                                            <span className={`text-sm font-bold tabular-nums ${
                                                cnvrQtyOf(line) > 1 ? 'text-indigo-600' : 'text-slate-500'
                                            }`}>
                                                {convertedQty(line).toLocaleString()}
                                            </span>
                                            <span className="w-9 shrink-0 text-[11px] font-bold text-slate-500 text-left">
                                                {line.outbUomCd}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-sm text-slate-300">-</span>
                                    )}
                                </span>
                                <span className="w-16 shrink-0 flex justify-center gap-1">
                                    <button
                                        onClick={() => setPickerFor(idx)}
                                        disabled={readOnly}
                                        title="상품 바꾸기"
                                        className="text-slate-300 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-300">
                                        <Search size={14} />
                                    </button>
                                    <button
                                        onClick={() => removeLine(idx)}
                                        disabled={readOnly}
                                        title="라인 삭제"
                                        className="text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-slate-300">
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
                    {/* 발주 수량 칸은 비운다 — 라인마다 발주단위가 달라 더한 값에 의미가 없다 */}
                    <span className="w-40 shrink-0" />
                    <span className="w-36 shrink-0 text-right">
                        {totalUom
                            ? `${totalConvQty.toLocaleString()} ${totalUom}`
                            : <span className="font-medium text-slate-400">재고 단위 혼재</span>}
                    </span>
                    <span className="w-16 shrink-0" />
                </div>
            </section>

            {/* 액션 */}
            <div className="flex gap-2 justify-end shrink-0">
                <button
                    onClick={() => (isEdit ? navigate('/oms/inbound-orders') : setForm(EMPTY_FORM()))}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                    {isEdit ? <><X size={14} /> 목록으로</> : <><RotateCcw size={14} /> 초기화</>}
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving || readOnly}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 shadow-md active:scale-95 transition-all">
                    <Save size={14} /> {saving
                        ? (isEdit ? '수정 중…' : '등록 중…')
                        : (isEdit ? '수정' : '등록')}
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
