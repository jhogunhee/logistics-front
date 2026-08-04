import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileOutput, Info, Package, Plus, RotateCcw, Save, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import ProdPickerModal from '@/components/common/ProdPickerModal';
import StorePickerModal from '@/components/common/StorePickerModal';
import { omsOutbOrderApi } from '@/api/omsOutbOrderApi';
import { codeApi } from '@/api/codeApi';
import { TEMP_ZONE_META } from '@/api/prodApi';
import { todayStr } from '@/utils/format';

const EMPTY_FORM = () => ({
    storeId: '', expctDe: todayStr(),
    outbTyp: 'NRML',   // 컬럼 DEFAULT와 같은 값 — 대부분의 출고가 일반출고다
    vhclFltno: '',     // 빈 값 = 배차 미정
    picNm: '', rmk: '',
    lines: [],
});

const inputCls = 'input-base w-full';

/** 마스터 영역 필드 (라벨 위 / 입력 아래) */
const Field = ({ label, required, hint, children, className = '' }) => (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
        <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
            {label}
            {required && <span className="text-red-500 font-black">*</span>}
            {/* 힌트는 아이콘 툴팁으로 — 문구 줄을 없애 마스터 영역 높이를 상품 리스트에 양보 */}
            {hint && (
                <span title={hint} className="cursor-help">
                    <Info size={12} className="text-slate-300" />
                </span>
            )}
        </label>
        {children}
    </div>
);

export default function OutboundOrder() {
    // 경로에 id가 있으면 수정, 없으면 등록. 화면 구성이 같아 컴포넌트를 나누지 않는다.
    const { omsOutbOrderId } = useParams();
    const isEdit = Boolean(omsOutbOrderId);

    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(isEdit);
    const [outbTypCodes, setOutbTypCodes] = useState([]);
    const [vhclFltnoCodes, setVhclFltnoCodes] = useState([]);
    // null이면 닫힘 / 'add'면 다중 추가 / 숫자면 그 인덱스 라인의 상품 교체
    const [pickerFor, setPickerFor] = useState(null);
    const [storePickerOpen, setStorePickerOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        let ignore = false;
        codeApi.list('OUTB_TYP').then(codes => { if (!ignore) setOutbTypCodes(codes); });
        codeApi.list('VHCL_FLTNO').then(codes => { if (!ignore) setVhclFltnoCodes(codes); });
        return () => { ignore = true; };
    }, []);

    // 수정 진입 시 주문을 불러온다. 헤더는 목록 API에서, 라인은 라인 API에서 가져온다 —
    // 단건 조회 엔드포인트가 없어서 목록을 받아 한 건만 골라낸다.
    useEffect(() => {
        if (!isEdit) return;
        let ignore = false;
        (async () => {
            try {
                const [orders, lines] = await Promise.all([
                    omsOutbOrderApi.list(),
                    omsOutbOrderApi.lines(omsOutbOrderId),
                ]);
                if (ignore) return;
                const order = orders.find(o => String(o.omsOutbOrderId) === String(omsOutbOrderId));
                if (!order) {
                    toast.error('주문을 찾을 수 없습니다.');
                    navigate('/oms/outbound-orders');
                    return;
                }
                setForm({
                    omsOutbNo: order.omsOutbNo,
                    status: order.status,
                    storeId: order.storeId,
                    storeCd: order.storeCd,
                    storeNm: order.storeNm,
                    outbTyp: order.outbTyp ?? 'NRML',
                    vhclFltno: order.vhclFltno ?? '',
                    expctDe: order.expctDe,
                    picNm: order.picNm ?? '',
                    rmk: order.rmk ?? '',
                    lines,
                });
            } catch (e) {
                if (!ignore) toast.error(e.message || '주문을 불러오지 못했습니다.');
            } finally {
                if (!ignore) setLoading(false);
            }
        })();
        return () => { ignore = true; };
    }, [isEdit, omsOutbOrderId, navigate]);

    // 확정된 주문은 고칠 수 없다 (서버도 거부한다). 화면에서 미리 잠가 헛수고를 막는다.
    const readOnly = isEdit && form.status && form.status !== 'CREATED';

    // 선택된 납품처는 코드/명까지 폼에 담아둔다 (표시용). 저장 시엔 storeId만 보낸다.
    const pickStore = (s) => setForm(prev => ({
        ...prev,
        storeId: s.storeId,
        storeCd: s.storeCd,
        storeNm: s.storeNm,
    }));

    // 라인은 선택 시점의 상품 마스터 정보를 그대로 담는다 (표시용). 저장 시엔 prodId/수량만 보낸다.
    const addLines = (prods) => {
        setForm(prev => ({
            ...prev,
            lines: [...prev.lines, ...prods.map(p => ({ ...p, odrQty: '' }))],
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

    // 수량은 전부 출고단위(주문서 단위)라 그대로 더한다. 창고 저장은 낱개(EA)이고
    // 환산은 확정 시 서버가 한다 — 이 화면은 주문서 단위만 안다.
    const totalQty = form.lines.reduce((sum, l) => sum + (Number(l.odrQty) || 0), 0);

    // 팝업에서 이미 담긴 상품을 비활성 처리하기 위한 목록.
    // 라인 교체 모드에선 그 라인 자신은 제외해야 "같은 상품 다시 고르기"가 막히지 않는다.
    const excludeIds = form.lines
        .filter((_, i) => i !== pickerFor)
        .map(l => l.prodId);

    const handleSave = async () => {
        if (readOnly) { toast.error('작성 상태의 주문만 수정할 수 있습니다.'); return; }
        if (!form.storeId) { toast.error('납품처는 필수입니다.'); return; }
        if (!form.expctDe) { toast.error('출고 예정일은 필수입니다.'); return; }
        if (form.lines.length === 0) { toast.error('출고 상품을 1건 이상 담아주세요.'); return; }
        for (const l of form.lines) {
            if (!(Number(l.odrQty) > 0)) {
                toast.error(`${l.prodNm} 의 주문 수량을 입력하세요.`);
                return;
            }
        }

        setSaving(true);
        const payload = {
            storeId: Number(form.storeId),
            outbTyp: form.outbTyp,
            vhclFltno: form.vhclFltno || null,
            expctDe: form.expctDe,
            picNm: form.picNm?.trim() || null,
            rmk: form.rmk?.trim() || null,
            lines: form.lines.map(l => ({ prodId: l.prodId, odrQty: Number(l.odrQty) })),
        };
        try {
            if (isEdit) {
                await omsOutbOrderApi.update(omsOutbOrderId, payload);
                toast.success(`${form.omsOutbNo} 을(를) 수정했습니다.`);
            } else {
                await omsOutbOrderApi.create(payload);
                toast.success('출고주문을 등록했습니다. 확정은 관리 화면에서 진행하세요.');
            }
            navigate('/oms/outbound-orders');
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
                <FileOutput size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">
                    {isEdit ? '출고주문 수정' : '출고주문'}
                </h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    {readOnly
                        ? '확정된 주문은 수정할 수 없습니다 — 고치려면 관리 화면에서 확정취소를 먼저 하세요'
                        : '점포 수주 등록 — 확정하면 창고 출고주문이 자동 생성됩니다'}
                </span>
            </div>

            {/* ── 마스터: 주문 정보 ───────────────────────────────── */}
            <section className="border border-slate-200 rounded-xl shrink-0">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 rounded-t-xl">
                    <span className="text-xs font-bold text-slate-600">주문 정보</span>
                </div>
                <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                    <Field
                        label="주문번호"
                        hint={isEdit ? '채번된 번호는 바뀌지 않습니다 (예정일을 고쳐도 그대로)' : '등록 시 서버가 채번합니다'}>
                        <input
                            type="text"
                            value={form.omsOutbNo || 'SO-YYYYMMDD-NNN'}
                            disabled
                            className={inputCls + ` bg-slate-50 cursor-not-allowed ${
                                form.omsOutbNo ? 'text-slate-600 font-medium' : 'text-slate-400'}`}
                        />
                    </Field>
                    {/* 출고유형은 웨이브 편성 조건의 기준값이라 주문 시점에 정해져야 한다 */}
                    <Field label="출고유형" hint="웨이브 편성 조건의 기준값입니다 — 확정 시 창고로 그대로 넘어갑니다">
                        <select
                            value={form.outbTyp}
                            onChange={(e) => setForm(prev => ({ ...prev, outbTyp: e.target.value }))}
                            disabled={readOnly}
                            className={inputCls + ' disabled:bg-slate-50 disabled:cursor-not-allowed'}>
                            {outbTypCodes.map(c => (
                                <option key={c.codeCd} value={c.codeCd}>{c.codeNm}</option>
                            ))}
                        </select>
                    </Field>
                    {/* 상품과 같은 팝업 방식으로 통일 — 한 폼 안에서 선택 UI가 갈리지 않게 한다 */}
                    <Field
                        label="납품처"
                        required
                        hint={form.storeCd ? `점포 코드 ${form.storeCd}` : '납품할 점포를 고릅니다 — 할당 시 이 점포의 잔여수명 기준으로 Lot이 걸러집니다'}>
                        <button
                            onClick={() => setStorePickerOpen(true)}
                            disabled={readOnly}
                            className={inputCls + ' flex items-center justify-between gap-2 text-left hover:border-indigo-300 disabled:bg-slate-50 disabled:cursor-not-allowed'}>
                            <span className={`truncate ${form.storeNm ? 'text-slate-700' : 'text-slate-400'}`}>
                                {form.storeNm || '납품처 선택'}
                            </span>
                            <Search size={13} className="shrink-0 text-slate-400" />
                        </button>
                    </Field>
                    <Field label="출고 예정일" required hint="확정 시 생성될 출고번호(OB-)의 채번 기준일이자 웨이브 편성 단위">
                        <input
                            type="date"
                            value={form.expctDe}
                            onChange={(e) => setForm(prev => ({ ...prev, expctDe: e.target.value }))}
                            disabled={readOnly}
                            className={inputCls + ' disabled:bg-slate-50 disabled:cursor-not-allowed'}
                        />
                    </Field>
                    <Field label="담당자" hint="수주를 받은 사람. 등록자 계정과는 별개입니다">
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
                    <Field label="비고" hint="점포 전달사항 등 (창고로 넘어가지 않습니다)">
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
                    {/* 편수도 웨이브 편성 조건이지만 배차가 늦게 정해져 앞의 6칸(입고주문과 같은 배치) 뒤에 둔다 */}
                    <Field label="편수" hint="차량 배차 차수. 비우면 배차 미정이고, 미정인 주문은 편수 조건이 걸린 웨이브에 담기지 않습니다">
                        <select
                            value={form.vhclFltno}
                            onChange={(e) => setForm(prev => ({ ...prev, vhclFltno: e.target.value }))}
                            disabled={readOnly}
                            className={inputCls + ' disabled:bg-slate-50 disabled:cursor-not-allowed'}>
                            <option value="">배차 미정</option>
                            {vhclFltnoCodes.map(c => (
                                <option key={c.codeCd} value={c.codeCd}>{c.codeNm}</option>
                            ))}
                        </select>
                    </Field>
                </div>
            </section>

            {/* ── 디테일: 출고 상품 ───────────────────────────────── */}
            <section className="flex-1 min-h-0 flex flex-col border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <Package size={14} className="text-slate-500" />
                        <span className="text-xs font-bold text-slate-600">출고 상품</span>
                        <span className="text-[11px] text-slate-400">
                            {form.lines.length}건
                            {form.lines.length > 0 && ` · 합계 ${totalQty.toLocaleString()}`}
                            {' · 수량은 출고단위 기준입니다 (확정 시 낱개로 환산)'}
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
                    <span className="flex-1 min-w-0 max-w-[360px]">상품명</span>
                    <span className="w-24 shrink-0 text-center ml-auto">온도대</span>
                    <span className="w-20 shrink-0 text-right">유통기한</span>
                    <span className="w-40 shrink-0 text-right">주문 수량</span>
                    <span className="w-16 shrink-0" />
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
                    {form.lines.length === 0 && (
                        <div className="pt-4 pb-16 flex flex-col items-center gap-3 text-sm text-slate-400">
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
                                <span className="flex-1 min-w-0 max-w-[360px] truncate text-sm text-slate-700">{line.prodNm}</span>
                                <span className="w-24 shrink-0 flex justify-center ml-auto">
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
                                {/* 주문 수량 — 단위는 상품이 정하므로 라벨로만 붙는다 (담당자가 고를 수 없다) */}
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
                                        {line.outbUomCd}
                                    </span>
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

                {/* 합계 — 주문서 단위(출고단위) 기준. 낱개 환산은 확정 시 서버 몫이다 */}
                <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs font-bold text-slate-600 shrink-0">
                    <span className="flex-1 text-right">합계</span>
                    <span className="w-40 shrink-0 text-right pr-11">{totalQty.toLocaleString()}</span>
                    <span className="w-16 shrink-0" />
                </div>
            </section>

            {/* 액션 */}
            <div className="flex gap-2 justify-end shrink-0">
                <button
                    onClick={() => (isEdit ? navigate('/oms/outbound-orders') : setForm(EMPTY_FORM()))}
                    className="flex items-center gap-1.5 btn-modal-cancel">
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

            <StorePickerModal
                open={storePickerOpen}
                onClose={() => setStorePickerOpen(false)}
                onSelect={pickStore}
            />

            {/* 상품 선택 팝업 — 추가는 다중, 라인 교체는 단일. 단위 컬럼은 출고단위(주문서 단위) */}
            <ProdPickerModal
                open={pickerFor !== null}
                multiple={pickerFor === 'add'}
                uomRole="outb"
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
