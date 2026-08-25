import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileInput, Package, Plus, RotateCcw, Save, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { omsIbOrderApi } from '@/api/omsIbOrderApi';
import { outbOrderApi } from '@/api/outbOrderApi';
import { prodApi } from '@/api/prodApi';
import { useCodes } from '@/hooks/useCodes';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { eaQtyPerInbUomOf, eaQtyPerOutbUomOf, num, todayStr } from '@/utils/format';
import ProdPickerModal from '@/components/common/ProdPickerModal';
import VendorPickerModal from '@/components/common/VendorPickerModal';
import StorePickerModal from '@/components/common/StorePickerModal';
import OutbOrderPickerModal from '@/components/common/OutbOrderPickerModal';
import DatePicker from '@/components/common/DatePicker';
import FormField from '@/components/common/FormField';

const EMPTY_FORM = () => ({
    vendorId: '', storeId: '', storeCd: '', storeNm: '', refOutbNo: '',
    expctDe: todayStr(),
    odrDvsn: 'NRML',   // 컬럼 DEFAULT와 같은 값 — 대부분의 발주가 정상 건이다
    picNm: '', rmk: '',
    lines: [],
});

const inputCls = 'input-base w-full';

export default function InboundOrder() {
    // 경로에 id가 있으면 수정, 없으면 등록. 화면 구성이 같아 컴포넌트를 나누지 않는다.
    const { omsIbOrderId } = useParams();
    const isEdit = Boolean(omsIbOrderId);
    const navigate = useNavigate();
    const odrDvsnCodes = useCodes('ODR_DVSN');
    const rtngsRsnCodes = useCodes('RTNGS_RSN');
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(isEdit);
    // null이면 닫힘 / 'add'면 다중 추가 / 숫자면 그 인덱스 라인의 상품 교체
    const [pickerFor, setPickerFor] = useState(null);
    const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
    const [storePickerOpen, setStorePickerOpen] = useState(false);
    const [outbPickerOpen, setOutbPickerOpen] = useState(false);

    // 확정된 주문은 고칠 수 없다 (서버도 거부한다). 화면에서 미리 잠가 헛수고를 막는다.
    const readOnly = isEdit && form.status && form.status !== 'CREATED';

    // 반품이면 상대가 점포이고 수량 단위가 출고단위다 — 화면의 갈림은 이 값 하나에서 나온다
    const isRtngs = form.odrDvsn === 'RTNGS';
    const uomCdOf = (line) => (isRtngs ? line.outbUomCd : line.inbUomCd);
    const eaPerUom = (line) => (isRtngs ? eaQtyPerOutbUomOf(line) : eaQtyPerInbUomOf(line));

    // 발주 수량(입고단위, 반품이면 출고단위) → 낱개(EA) 수. 저장하는 값이 아니라 표시용 미리보기다 —
    // ASN에 넘어가는 예정수량은 별도의 출고단위 환산(Prod.toOutbQty)이고, 화면은 상품마다
    // 단위가 갈리지 않는 낱개 기준으로 통일해 보여준다.
    const convertedQty = (line) => (Number(line.odrQty) || 0) * eaPerUom(line);

    // prodMetaOf가 상품 마스터(단위·유통기한·outbUomCd·outbEaQty)를 알아야 하는 곳은 원 출고에서 라인을
    // 끌어올 때뿐이다(pickOutbOrder) — 대부분의 주문은 이 정보가 필요 없어, 화면 진입마다 상품 전체를
    // 받는 대신 처음 쓰일 때 한 번만 받아 재사용한다(ref에 담긴 Promise가 캐시 겸 중복요청 방지다).
    const prodsRef = useRef(null);
    const loadProds = () => (prodsRef.current ??= prodApi.list().then(d => Object.fromEntries(d.map(p => [p.prodId, p]))));
    const prodMetaOf = (prodById, prodId) => {
        const p = prodById[prodId] ?? {};
        return { shelfLifeDays: p.shelfLifeDays, inbUomCd: p.inbUomCd, inbEaQty: p.inbEaQty, outbUomCd: p.outbUomCd, outbEaQty: p.outbEaQty };
    };

    // 합계는 낱개(EA) 환산 쪽만 낸다 (발주 수량은 라인마다 입고단위가 달라 합이 어색하다).
    // 낱개 기준이라 어떤 상품 조합이든 합이 깨끗하다.
    const totalConvQty = form.lines.reduce((sum, l) => sum + convertedQty(l), 0);

    // 팝업에서 이미 담긴 상품을 비활성 처리하기 위한 목록.
    // 라인 교체 모드에선 그 라인 자신은 제외해야 "같은 상품 다시 고르기"가 막히지 않는다.
    const excludeIds = form.lines
        .filter((_, i) => i !== pickerFor)
        .map(l => l.prodId);

    // 수정 진입 시 주문을 불러온다. 헤더는 단건 API에서, 라인은 라인 API에서 가져온다.
    useEffect(() => {
        if (!isEdit) return;
        let ignore = false;
        (async () => {
            try {
                const [order, lines] = await Promise.all([
                    omsIbOrderApi.get(omsIbOrderId),
                    omsIbOrderApi.lines(omsIbOrderId),
                ]);
                if (ignore) return;
                setForm({
                    omsIbNo: order.omsIbNo,
                    status: order.status,
                    vendorId: order.vendorId,
                    vndrCd: order.vndrCd,
                    vndrNm: order.vndrNm,
                    storeId: order.storeId ?? '',
                    storeCd: order.storeCd ?? '',
                    storeNm: order.storeNm ?? '',
                    refOutbNo: order.refOutbNo ?? '',
                    expctDe: order.expctDe,
                    odrDvsn: order.odrDvsn ?? 'NRML',
                    picNm: order.picNm ?? '',
                    rmk: order.rmk ?? '',
                    lines: lines.map(l => ({ ...l, odrQty: l.odrQty, rsnCd: l.rsnCd ?? '', rsnDscr: l.rsnDscr ?? '' })),
                });
            } catch (e) {
                if (ignore) return;
                toast.error(e.message || '주문을 불러오지 못했습니다.');
                navigate('/oms/inbound-orders');
            } finally {
                if (!ignore) setLoading(false);
            }
        })();
        return () => { ignore = true; };
    }, [isEdit, omsIbOrderId, navigate]);

    // 선택된 벤더는 코드/명까지 폼에 담아둔다 (표시용). 저장 시엔 vendorId만 보낸다.
    const pickVendor = (v) => setForm(prev => ({
        ...prev,
        vendorId: v.vendorId,
        vndrCd: v.vndrCd,
        vndrNm: v.vndrNm,
    }));

    // 구분을 바꾸면 바뀐 쪽의 상대처만 비운다 — 벤더 발주에 점포가 남거나 반품에 벤더가 남으면 서버가 거부한다.
    // 정상 ↔ 긴급처럼 반품 여부가 그대로면 벤더는 건드리지 않는다.
    const changeDvsn = (odrDvsn) => {
        const nowRtngs = odrDvsn === 'RTNGS';
        setForm(prev => ({
            ...prev, odrDvsn,
            ...(nowRtngs ? { vendorId: '', vndrCd: '', vndrNm: '' } : {}),
            ...(!nowRtngs ? {
                storeId: '', storeCd: '', storeNm: '', refOutbNo: '',
                lines: prev.lines.map(l => ({ ...l, rsnCd: '', rsnDscr: '' })),
            } : {}),
        }));
    };

    const pickStore = (s) => setForm(prev => ({
        ...prev, storeId: s.storeId, storeCd: s.storeCd, storeNm: s.storeNm, refOutbNo: '',
    }));

    // 원 출고를 고르면 그 문서의 라인이 들어온다. 출고 라인 수량은 낱개(EA)라 출고단위로 되돌려 채운다
    const pickOutbOrder = async (o) => {
        const [lines, prodById] = await Promise.all([outbOrderApi.lines(o.outbOrderId), loadProds()]);
        setForm(prev => ({
            ...prev,
            refOutbNo: o.outbNo,
            lines: lines.map(l => ({
                prodId: l.prodId, prodCd: l.prodCd, prodNm: l.prodNm, tmpZon: l.tmpZon,
                ...prodMetaOf(prodById, l.prodId),
                odrQty: Math.max(1, Math.floor(l.odrQty / (prodMetaOf(prodById, l.prodId).outbEaQty ?? 1))),
                rsnCd: '', rsnDscr: '',
            })),
        }));
    };

    // 라인은 선택 시점의 상품 마스터 정보를 그대로 담는다 (표시용). 저장 시엔 prodId/수량만 보낸다.
    const addLines = (prods) => {
        setForm(prev => ({
            ...prev,
            lines: [...prev.lines, ...prods.map(s => ({ ...s, odrQty: '', rsnCd: '', rsnDscr: '' }))],
        }));
    };

    const replaceLineProd = (idx, prod) => {
        setForm(prev => ({
            ...prev,
            lines: prev.lines.map((l, i) => (i === idx ? { ...prod, odrQty: l.odrQty, rsnCd: l.rsnCd, rsnDscr: l.rsnDscr } : l)),
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

    const setLineField = (idx, patch) => setForm(prev => ({
        ...prev, lines: prev.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));

    const handleSave = async () => {
        if (readOnly) { toast.error('작성 상태의 주문만 수정할 수 있습니다.'); return; }
        if (isRtngs ? !form.storeId : !form.vendorId) {
            toast.error(isRtngs ? '반품 점포는 필수입니다.' : '벤더는 필수입니다.'); return;
        }
        if (!form.expctDe) { toast.error('입고 예정일은 필수입니다.'); return; }
        if (form.lines.length === 0) { toast.error('발주 상품을 1건 이상 담아주세요.'); return; }
        for (const l of form.lines) {
            if (!(Number(l.odrQty) > 0)) { toast.error(`${l.prodNm} 의 수량을 입력하세요.`); return; }
            if (isRtngs && !l.rsnCd) { toast.error(`${l.prodNm} 의 반품사유를 선택하세요.`); return; }
            if (isRtngs && l.rsnCd === 'ETC' && !l.rsnDscr?.trim()) { toast.error(`${l.prodNm} 의 사유 내용을 입력하세요.`); return; }
        }

        setSaving(true);
        const payload = {
            vendorId: isRtngs ? null : Number(form.vendorId),
            storeId: isRtngs ? Number(form.storeId) : null,
            refOutbNo: isRtngs ? (form.refOutbNo || null) : null,
            expctDe: form.expctDe,
            odrDvsn: form.odrDvsn,
            picNm: form.picNm?.trim() || null,
            rmk: form.rmk?.trim() || null,
            lines: form.lines.map(l => ({
                prodId: l.prodId, odrQty: Number(l.odrQty),
                rsnCd: isRtngs ? l.rsnCd : null,
                rsnDscr: isRtngs && l.rsnCd === 'ETC' ? l.rsnDscr.trim() : null,
            })),
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
                        : (isRtngs ? '점포 반품 등록 — 확정하면 입고예정(ASN)이 자동 생성됩니다' : '벤더 발주 등록 — 확정하면 입고예정(ASN)이 자동 생성됩니다')}
                </span>
            </div>

            {/* ── 마스터: 주문 정보 ───────────────────────────────── */}
            <section className="border border-slate-200 rounded-xl shrink-0">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 rounded-t-xl">
                    <span className="text-xs font-bold text-slate-600">주문 정보</span>
                </div>
                <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                    <FormField
                        label="주문번호"
                        hint={isEdit ? '채번된 번호는 바뀌지 않습니다 (예정일을 고쳐도 그대로)' : '등록 시 서버가 채번합니다'}>
                        <input
                            type="text"
                            value={form.omsIbNo || 'PO-YYYYMMDD-NNN'}
                            disabled
                            className={inputCls + ` bg-slate-50 cursor-not-allowed ${
                                form.omsIbNo ? 'text-slate-600 font-medium' : 'text-slate-400'}`}
                        />
                    </FormField>
                    {/* 발주구분은 지금 표시·분류용이다 — 긴급이라고 적치·피킹 순서가 바뀌지는 않는다.
                        단, 반품입고는 상대·수량 단위 자체가 갈린다 (changeDvsn이 상대처를 비운다) */}
                    <FormField label="발주구분" hint="반품입고를 고르면 상대가 점포로 바뀌고 수량은 출고단위가 됩니다">
                        <select
                            value={form.odrDvsn}
                            onChange={(e) => changeDvsn(e.target.value)}
                            disabled={readOnly}
                            className={inputCls + ' disabled:bg-slate-50 disabled:cursor-not-allowed'}>
                            {odrDvsnCodes.selectOptions.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </FormField>
                    {/* 상품과 같은 팝업 방식으로 통일 — 한 폼 안에서 선택 UI가 갈리지 않게 한다 */}
                    {isRtngs ? (
                        <FormField label="반품 점포" required hint={form.storeCd ? `점포 코드 ${form.storeCd}` : '물건을 돌려보내는 점포'}>
                            <button onClick={() => setStorePickerOpen(true)} disabled={readOnly}
                                    className={inputCls + ' flex items-center justify-between gap-2 text-left hover:border-indigo-300 disabled:bg-slate-50 disabled:cursor-not-allowed'}>
                                <span className={`truncate ${form.storeNm ? 'text-slate-700' : 'text-slate-400'}`}>{form.storeNm || '점포 선택'}</span>
                                <Search size={13} className="shrink-0 text-slate-400" />
                            </button>
                        </FormField>
                    ) : (
                        <FormField
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
                        </FormField>
                    )}
                    <FormField label="입고 예정일" required hint="확정 시 생성될 입고번호(IB-)의 채번 기준일">
                        <DatePicker
                            value={form.expctDe}
                            onChange={(v) => setForm(prev => ({ ...prev, expctDe: v }))}
                            disabled={readOnly}
                        />
                    </FormField>
                    {isRtngs && (
                        <FormField label="원 출고" hint="선택 — 고르면 그 출고의 라인이 들어옵니다 (점포 먼저)">
                            <div className="flex gap-1">
                                <button onClick={() => setOutbPickerOpen(true)} disabled={readOnly || !form.storeId}
                                        className={inputCls + ' flex items-center justify-between gap-2 text-left hover:border-indigo-300 disabled:bg-slate-50 disabled:cursor-not-allowed'}>
                                    <span className={`truncate ${form.refOutbNo ? 'text-slate-700' : 'text-slate-400'}`}>{form.refOutbNo || '출고 선택'}</span>
                                    <Search size={13} className="shrink-0 text-slate-400" />
                                </button>
                                {form.refOutbNo && !readOnly && (
                                    <button onClick={() => setForm(prev => ({ ...prev, refOutbNo: '' }))} title="참조 지우기"
                                            className="px-2 text-slate-400 hover:text-slate-600"><X size={14} /></button>
                                )}
                            </div>
                        </FormField>
                    )}
                    <FormField label="담당자" hint="발주를 낸 사람. 등록자 계정과는 별개입니다">
                        <input
                            type="text"
                            value={form.picNm}
                            onChange={(e) => setForm(prev => ({ ...prev, picNm: e.target.value }))}
                            disabled={readOnly}
                            maxLength={30}
                            placeholder="김상현"
                            className={inputCls + ' disabled:bg-slate-50 disabled:cursor-not-allowed'}
                        />
                    </FormField>
                    <FormField label="비고" hint="벤더 전달사항 등 (ASN으로 넘어가지 않습니다)">
                        <input
                            type="text"
                            value={form.rmk}
                            onChange={(e) => setForm(prev => ({ ...prev, rmk: e.target.value }))}
                            disabled={readOnly}
                            maxLength={200}
                            placeholder="오전 도착 요청"
                            className={inputCls + ' disabled:bg-slate-50 disabled:cursor-not-allowed'}
                        />
                    </FormField>
                </div>
            </section>

            {/* ── 디테일: 발주 상품 ───────────────────────────────── */}
            {/* min-h — 뷰포트가 낮으면 목록을 짜부라뜨리는 대신 Layout 카드 스크롤로 넘긴다 */}
            <section className="flex-1 min-h-[280px] flex flex-col border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <Package size={14} className="text-slate-500" />
                        <span className="text-xs font-bold text-slate-600">발주 상품</span>
                        <span className="text-[11px] text-slate-400">
                            {form.lines.length}건
                            {form.lines.length > 0 && ` · 환산 ${num(totalConvQty)}`}
                            {isRtngs ? ' · 수량은 출고단위 기준입니다' : ' · 수량은 발주단위 기준입니다'}
                        </span>
                    </div>
                    <button
                        onClick={() => setPickerFor('add')}
                        disabled={readOnly}
                        className="flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-indigo-600 hover:border-indigo-300 transition-colors disabled:opacity-40 disabled:hover:border-slate-200">
                        <Plus size={13} /> 상품 추가
                    </button>
                </div>

                {/* 컬럼 헤더·합계는 행들과 같은 스크롤 컨테이너 안에 sticky로 둔다 —
                    밖에 두면 스크롤바가 생길 때 행 영역만 좁아져 서로 어긋난다.
                    셋(헤더·행·합계)은 같은 폭 규칙을 공유한다 */}
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
                    <div className="shrink-0 sticky top-0 z-10 bg-white flex items-center gap-3 px-4 py-1.5 border-b border-slate-200 text-[11px] font-bold text-slate-500">
                        <span className="w-10 shrink-0">No.</span>
                        <span className="w-24 shrink-0">상품 코드</span>
                        {/* 상품명은 남는 폭을 다 먹지 않게 캡을 둔다 — 남는 공간은 온도대 앞(ml-auto)으로 밀어
                            오른쪽 수량 컬럼들의 정렬을 유지한다 */}
                        <span className="flex-1 min-w-0 max-w-[360px]">상품명</span>
                        <span className="w-20 shrink-0 text-center ml-auto">온도대</span>
                        <span className="w-20 shrink-0 text-right">유통기한</span>
                        {isRtngs && <span className="w-36 shrink-0">반품사유</span>}
                        <span className="w-32 shrink-0 text-right">{isRtngs ? '반품 수량' : '발주 수량'}</span>
                        <span className="w-20 shrink-0 text-right" title={isRtngs ? '반품 수량(출고단위) 1개당 낱개수량' : '발주단위 1개당 입수량(낱개 기준) — 단위 관리의 낱개수량과 같은 값'}>
                            입수량
                        </span>
                        <span className="w-32 shrink-0 text-right" title={isRtngs ? '반품 수량을 낱개(EA)로 환산한 수량입니다' : '발주 수량을 낱개(EA)로 환산한 수량입니다'}>
                            환산 수량 (낱개)
                        </span>
                        <span className="w-12 shrink-0" />
                    </div>
                    {/* flex-[1_0_auto] — 라인이 적어도 남는 높이를 채워 합계를 섹션 바닥에 붙인다 */}
                    <div className="flex-[1_0_auto] divide-y divide-slate-100 flex flex-col">
                    {form.lines.length === 0 && (
                        <div className="flex-1 py-8 flex flex-col items-center justify-center gap-3 text-sm text-slate-400">
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
                                <span className="w-24 shrink-0 text-sm font-medium text-slate-700">{line.prodCd}</span>
                                <span className="flex-1 min-w-0 max-w-[360px] truncate text-sm text-slate-700">{line.prodNm}</span>
                                <span className="w-20 shrink-0 flex justify-center ml-auto">
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
                                {isRtngs && (
                                    <span className="w-36 shrink-0 flex flex-col gap-0.5">
                                        <select value={line.rsnCd ?? ''} disabled={readOnly}
                                                onChange={(e) => setLineField(idx, { rsnCd: e.target.value, rsnDscr: '' })}
                                                className="px-2 py-1 bg-white border border-slate-200 rounded-md text-sm">
                                            <option value="">사유 선택</option>
                                            {rtngsRsnCodes.selectOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                        {line.rsnCd === 'ETC' && (
                                            <input value={line.rsnDscr ?? ''} disabled={readOnly} maxLength={200} placeholder="사유 내용"
                                                   onChange={(e) => setLineField(idx, { rsnDscr: e.target.value })}
                                                   className="px-2 py-1 bg-white border border-slate-200 rounded-md text-xs" />
                                        )}
                                    </span>
                                )}
                                {/* 발주 수량 — 단위는 상품이 정하므로 라벨로만 붙는다 (담당자가 고를 수 없다) */}
                                <span className="w-32 shrink-0 flex items-center gap-1.5">
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
                                        {uomCdOf(line)}
                                    </span>
                                </span>
                                {/* 입수량 — 발주단위 1개 = 낱개 몇 개인지 (환산의 배수, 값의 근거는 단위 관리 화면의 낱개수량과 같다) */}
                                <span className="w-20 shrink-0 text-right text-sm text-slate-500">
                                    {num(eaPerUom(line))}
                                </span>
                                {/* 환산 수량(낱개) — 읽기 전용. 환산이 없는 상품(×1)은 회색으로 눌러 둔다 */}
                                <span className="w-32 shrink-0 flex items-center justify-end gap-1.5">
                                    {Number(line.odrQty) > 0 ? (
                                        <>
                                            <span className={`text-sm font-bold tabular-nums ${
                                                eaPerUom(line) > 1 ? 'text-indigo-600' : 'text-slate-500'
                                            }`}>
                                                {num(convertedQty(line))}
                                            </span>
                                            <span className="w-9 shrink-0 text-[11px] font-bold text-slate-500 text-left">
                                                EA
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-sm text-slate-300">-</span>
                                    )}
                                </span>
                                <span className="w-12 shrink-0 flex justify-center gap-1">
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
                    <div className="shrink-0 sticky bottom-0 z-10 flex items-center gap-3 px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs font-bold text-slate-600">
                        <span className="flex-1 text-right">합계</span>
                        {isRtngs && <span className="w-36 shrink-0" />}
                        {/* 발주 수량 칸은 비운다 — 라인마다 발주단위가 달라 더한 값에 의미가 없다 */}
                        <span className="w-32 shrink-0" />
                        <span className="w-20 shrink-0" />
                        <span className="w-32 shrink-0 text-right">
                            {num(totalConvQty)}
                        </span>
                        <span className="w-12 shrink-0" />
                    </div>
                </div>
            </section>

            {/* 액션 */}
            <div className="flex gap-2 justify-end shrink-0">
                <button
                    onClick={() => (isEdit ? navigate('/oms/inbound-orders') : setForm(EMPTY_FORM()))}
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

            <VendorPickerModal
                open={vendorPickerOpen}
                onClose={() => setVendorPickerOpen(false)}
                onSelect={pickVendor}
            />
            <StorePickerModal open={storePickerOpen} onClose={() => setStorePickerOpen(false)} onSelect={pickStore} />
            <OutbOrderPickerModal open={outbPickerOpen} storeId={form.storeId} onClose={() => setOutbPickerOpen(false)} onSelect={pickOutbOrder} />

            {/* 상품 선택 팝업 — 추가는 다중, 라인 교체는 단일 */}
            <ProdPickerModal
                open={pickerFor !== null}
                multiple={pickerFor === 'add'}
                excludeIds={excludeIds}
                uomRole={isRtngs ? 'outb' : 'inb'}
                onClose={() => setPickerFor(null)}
                onSelect={(picked) => {
                    if (pickerFor === 'add') addLines(picked);
                    else replaceLineProd(pickerFor, picked);
                }}
            />
        </div>
    );
}
