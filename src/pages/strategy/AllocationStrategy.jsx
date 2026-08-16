import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, History, Layers, Play, Plus, ScrollText, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { strategyApi } from '@/api/strategyApi';
import { num } from '@/utils/format';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import AllocPlanTrace from '@/components/strategy/AllocPlanTrace';
import ComponentPicker from '@/components/strategy/ComponentPicker';
import ConditionBuilder from '@/components/strategy/ConditionBuilder';
import ExecutionHistory from '@/components/strategy/ExecutionHistory';
import RevisionHistory from '@/components/strategy/RevisionHistory';
import SortCriteriaEditor from '@/components/strategy/SortCriteriaEditor';
import SortableList from '@/components/strategy/SortableList';
import { useFields } from '@/components/strategy/useOptions';

const emptyDefinition = () => ({ stgyNm: '', prty: 0, tgtCond: [], slots: [] });

/**
 * 슬롯 섹션 정의. <b>「미설정 시 기본 동작」을 상시 표시하는 것이 이 화면의 핵심 장치다</b> —
 * 슬롯이 비어 있는 것과 기능이 꺼진 것은 다르고, 관리자는 자기가 무엇을 덮어쓰는지 봐야 한다.
 */
const SECTIONS = [
    {
        typ: 'INVN_FLTR', no: '①', label: '재고위치', orderLabel: '계층',
        dflt: '보관 재고 전체가 한 덩어리 (계층 없음)',
        hint: '위에서부터 계층입니다 — 앞 계층을 다 쓰고 모자라면 다음으로 내려갑니다.',
        multi: true, hasCmpnt: false, slotLabel: '후보 계층', condDomain: 'allocation-invn',
        condHint: '조건 없는 계층은 후보 전체를 가져가므로 마지막에만 둘 수 있습니다.',
    },
    {
        typ: 'RSTRCT', no: '②', label: '출고제약', orderLabel: null,
        dflt: '잔여수명 비율 · 점포 기준(store.outb_life_rate) 미달 Lot 제외',
        hint: '후보 재고를 건별로 걸러냅니다. 등록하지 않아도 점포 기준은 그대로 적용됩니다.',
        multi: true, hasCmpnt: true, condDomain: null,
    },
    {
        typ: 'INVN_SRT', no: '③', label: '재고 정렬', orderLabel: '정렬 우선순위',
        dflt: 'FEFO — 유통기한 → 로케이션 피킹순위 → 로케이션코드',
        hint: '재고를 어떤 순서로 소진할지 정합니다.',
        multi: false, hasCmpnt: false, slotLabel: '정렬 기준', sortDomain: 'allocation-invn',
    },
    {
        typ: 'ODR_SRT', no: '④', label: '주문 순서', orderLabel: '정렬 우선순위',
        dflt: '출고예정일 → 출고번호',
        hint: '먼저 처리된 라인이 재고를 먼저 가져갑니다 — 이 순서가 곧 우선권입니다.',
        multi: false, hasCmpnt: false, slotLabel: '정렬 기준', sortDomain: 'allocation-order',
    },
    {
        typ: 'DSTRB', no: '⑤', label: '분배', orderLabel: '실행 순서',
        dflt: '순차 소진 — 앞 라인이 채울 수 있는 만큼 다 가져감',
        hint: '재고가 요청보다 적을 때만 작동합니다. 위에서부터 실행되고, 조건에 걸린 라인이 먼저 받습니다.',
        multi: true, hasCmpnt: true, condDomain: 'allocation-line',
        condHint: '마지막 분배는 조건 없이 전 라인을 대상으로 해야 합니다.',
    },
];

/**
 * SC-04 할당 전략관리. 목록 → 편집(좌: 슬롯 5섹션 / 우: 미리보기) 2단 구성.
 *
 * 이 화면의 성질이 다른 세 전략 화면과 하나 다르다 — <b>할당에는 이미 코드에 박힌 기본 동작이
 * 있어서, 전략은 없던 판단을 만드는 게 아니라 기본값을 슬롯 단위로 덮어쓴다.</b> 그래서
 * 필수 슬롯이 없고, 전략을 하나도 만들지 않아도 할당은 정상 동작한다.
 *
 * <b>실행 진입점은 이 화면에 없다</b> — 할당 실행은 이미 재고할당 화면이 갖고 있고,
 * 여기 두 번째 진입점을 만들면 같은 업무가 두 곳에서 시작된다. 여기 남는 것은 정의 편집과,
 * DB를 바꾸지 않는 미리보기다.
 */
export default function AllocationStrategy() {
    const tgtFields = useFields('allocation-target');
    const invnFields = useFields('allocation-invn');
    const lineFields = useFields('allocation-line');
    const [mode, setMode] = useState('list');            // 'list' | 'edit'
    const [rows, setRows] = useState([]);
    const [editingId, setEditingId] = useState(null);    // null = 신규
    const [def, setDef] = useState(emptyDefinition());
    const [baseline, setBaseline] = useState('');        // 마지막 저장 상태 — dirty 판정 기준
    const [components, setComponents] = useState({});    // slotTyp → [{ code, name, dscr }]
    const [sortFields, setSortFields] = useState({});    // domain → [{ value, label }]
    const [picker, setPicker] = useState(null);          // 구현체 추가 중인 slotTyp
    const [revisionOpen, setRevisionOpen] = useState(false);
    const [execOpen, setExecOpen] = useState(false);
    const [execAllOpen, setExecAllOpen] = useState(false);
    const confirmRef = useRef(null);

    // 미리보기 (대상 웨이브 — 할당 대상 목록에서 고른다)
    const [waves, setWaves] = useState([]);
    const [wavIds, setWavIds] = useState([]);
    const [previewResult, setPreviewResult] = useState(null);

    const condFieldsOf = (domain) => (domain === 'allocation-invn' ? invnFields : lineFields);
    const dirty = mode === 'edit' && JSON.stringify(def) !== baseline;

    const fetchList = () => strategyApi.allocationStrategies.list().then(setRows);

    useEffect(() => {
        fetchList();
        Promise.all(SECTIONS.filter(s => s.hasCmpnt)
            .map(s => strategyApi.meta.allocationComponents(s.typ).then(list => [s.typ, list])))
            .then(pairs => setComponents(Object.fromEntries(pairs)));
        Promise.all(['allocation-invn', 'allocation-order']
            .map(d => strategyApi.meta.sortFields(d).then(list => [d, list])))
            .then(pairs => setSortFields(Object.fromEntries(pairs)));
    }, []);

    // 편집 중(dirty) 새로고침/탭 닫기 확인
    useEffect(() => {
        if (!dirty) return;
        const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [dirty]);

    // ── 목록 → 편집 전환 ─────────────────────────────────────
    const enterEdit = (loaded, id) => {
        setEditingId(id);
        setDef(loaded);
        setBaseline(JSON.stringify(loaded));
        setPreviewResult(null);
        setWavIds([]);
        strategyApi.allocationStrategies.targetWaves().then(setWaves).catch(() => setWaves([]));
        setMode('edit');
    };

    const openNew = () => enterEdit(emptyDefinition(), null);

    const openEdit = async (id) => {
        const data = await strategyApi.allocationStrategies.get(id);
        enterEdit({
            stgyNm: data.stgyNm,
            prty: data.prty ?? 0,
            tgtCond: data.tgtCond ?? [],
            slots: data.slots ?? [],
        }, id);
    };

    const backToList = async () => {
        if (dirty) {
            const ok = await confirmRef.current.confirm({
                title: '저장하지 않은 변경',
                message: '편집 중인 내용이 저장되지 않았습니다.\n목록으로 나가면 변경이 사라집니다.',
                confirmText: '나가기',
                danger: true,
            });
            if (!ok) return;
        }
        setMode('list');
        fetchList();
    };

    // ── 슬롯 편집 ────────────────────────────────────────────
    const slotsOf = (typ) => def.slots.filter(s => s.slotTyp === typ);

    /** 한 타입의 슬롯 목록을 통째로 갈아끼운다 — 다른 타입은 순서·내용 그대로 둔다 */
    const replaceSlots = (typ, next) => {
        setDef(prev => ({
            ...prev,
            slots: [...prev.slots.filter(s => s.slotTyp !== typ),
                ...next.map((s, i) => ({ ...s, slotTyp: typ, srtSeq: i + 1 }))],
        }));
    };

    const updateSlot = (typ, idx, patch) => {
        replaceSlots(typ, slotsOf(typ).map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    };

    const removeSlot = (typ, idx) => {
        replaceSlots(typ, slotsOf(typ).filter((_, i) => i !== idx));
    };

    const addSlot = (section, cmpntCd) => {
        replaceSlots(section.typ, [...slotsOf(section.typ),
            { slotTyp: section.typ, cmpntCd: cmpntCd ?? null, para: {}, cond: [] }]);
    };

    /**
     * 슬롯 추가. 고를 구현체가 <b>둘 이상일 때만</b> 피커를 띄운다 — 하나뿐인 피커는
     * 정보가 아니라 한 단계 늘어난 클릭이다. code는 메타 응답에서 꺼내 P1을 지킨다.
     * 구현체 축이 없는 슬롯(재고위치·정렬 2종)은 곧바로 추가한다 — 그 슬롯들은
     * 조건 목록·정렬 기준 목록 자체가 정의라 고를 구현체가 없다.
     */
    const addOrPick = (section) => {
        if (!section.hasCmpnt) {
            addSlot(section, null);
            return;
        }
        const list = components[section.typ] ?? [];
        if (list.length === 1) {
            addSlot(section, list[0].code);
            return;
        }
        setPicker(section.typ);
    };

    const cmpntName = (typ, code) =>
        (components[typ] ?? []).find(c => c.code === code)?.name ?? code;

    // ── 저장 / 삭제 ──────────────────────────────────────────
    const definition = () => ({ ...def, prty: Number(def.prty) || 0 });

    const save = async () => {
        if (!def.stgyNm.trim()) {
            toast.error('전략명을 입력하세요.');
            return;
        }
        const dstrb = slotsOf('DSTRB');
        if (dstrb.length > 0 && (dstrb[dstrb.length - 1].cond ?? []).length > 0) {
            toast.error('마지막 분배는 조건 없이 전 라인을 대상으로 해야 합니다 — '
                + '조건에 걸리지 않은 라인이 재고를 두고도 받지 못합니다.');
            return;
        }
        try {
            if (editingId != null) {
                await strategyApi.allocationStrategies.update(editingId, definition());
            } else {
                const created = await strategyApi.allocationStrategies.create(definition());
                setEditingId(created.alocStgyId);
            }
            setBaseline(JSON.stringify(def));
            toast.success('할당 전략을 저장했습니다.');
            fetchList();
        } catch (e) {
            toast.error(e.message || '저장에 실패했습니다.');
        }
    };

    const remove = async () => {
        const ok = await confirmRef.current.confirm({
            title: '할당 전략 삭제',
            message: `"${def.stgyNm}" 전략을 삭제합니다.\n`
                + '이미 만들어진 할당은 그대로 남고, 이후 할당은 다음 순위 전략(없으면 기본 동작)으로 실행됩니다.\n'
                + '삭제 전 구성은 리비전 이력(감사용)에 남지만, 화면에서 복원할 수는 없습니다.',
            confirmText: '삭제',
            danger: true,
        });
        if (!ok) return;
        try {
            await strategyApi.allocationStrategies.remove(editingId);
            toast.success('할당 전략을 삭제했습니다.');
            setBaseline(JSON.stringify(def)); // 삭제 후 이탈 가드가 뜨지 않게
            setMode('list');
            fetchList();
        } catch (e) {
            toast.error(e.message || '삭제에 실패했습니다.');
        }
    };

    // ── 미리보기 ─────────────────────────────────────────────
    const runPreview = async () => {
        if (wavIds.length === 0) {
            toast.error('미리보기할 웨이브를 선택하세요.');
            return;
        }
        try {
            setPreviewResult(await strategyApi.allocationStrategies.preview({
                definition: definition(), wavIds,
            }));
        } catch (e) {
            toast.error(e.message || '미리보기에 실패했습니다.');
        }
    };

    // ─────────────────────────────────────────────────────────
    if (mode === 'list') {
        return (
            <div className="flex flex-col gap-4 h-full">
                <div className="flex items-center gap-2">
                    <Layers size={18} className="text-indigo-600" />
                    <h2 className="text-lg font-bold text-slate-800">할당 전략관리</h2>
                    <span className="text-xs text-slate-400 mt-0.5">
                        우선순위 순으로 매칭 — 실행 1회에 전략 1건이 적용됩니다 (대상 주문 전부가 적용대상 조건을 만족해야 매칭)
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => setExecAllOpen(true)}
                                className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-50">
                            <ScrollText size={13} /> 실행 이력
                        </button>
                        <button onClick={openNew}
                                className="flex items-center gap-1 px-4 py-1.5 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700">
                            <Plus size={13} /> 새 전략
                        </button>
                    </div>
                </div>

                <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-xs text-slate-500">
                                <th className="px-4 py-2.5 text-right w-24 font-bold">우선순위</th>
                                <th className="px-4 py-2.5 text-left font-bold">전략명</th>
                                <th className="px-4 py-2.5 text-right w-24 font-bold">적용대상</th>
                                <th className="px-4 py-2.5 text-left w-72 font-bold">슬롯</th>
                                <th className="px-4 py-2.5 text-left w-40 font-bold">수정일시</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                                    등록된 할당 전략이 없습니다 — 전략이 없으면 기본 동작(FEFO · 점포 잔여수명 · 순차 소진)으로 할당됩니다.
                                </td></tr>
                            )}
                            {rows.map(r => (
                                <tr key={r.alocStgyId} onClick={() => openEdit(r.alocStgyId)}
                                    className="border-t border-slate-100 hover:bg-indigo-50/40 cursor-pointer">
                                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">{r.prty}</td>
                                    <td className="px-4 py-2.5 font-bold text-slate-700">{r.stgyNm}</td>
                                    <td className="px-4 py-2.5 text-right text-slate-600">
                                        {r.tgtCondCount === 0
                                            ? <span className="text-slate-400" title="조건이 없으면 무조건 매칭 — 폴백 전략입니다">전체</span>
                                            : `${num(r.tgtCondCount)}건`}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex flex-wrap gap-1">
                                            {SECTIONS.map(s => {
                                                const count = r.slotCounts?.[s.typ] ?? 0;
                                                return (
                                                    <span key={s.typ}
                                                          title={count === 0 ? `${s.label} — 기본 동작` : `${s.label} ${count}건`}
                                                          className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                                                              count === 0
                                                                  ? 'bg-slate-50 text-slate-300'
                                                                  : 'bg-indigo-50 text-indigo-600'
                                                          }`}>
                                                        {s.label}{count > 0 && ` ${count}`}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-slate-400">{r.updatedAt?.replace('T', ' ').slice(0, 16)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <ExecutionHistory open={execAllOpen} onClose={() => setExecAllOpen(false)} stgyTyp="ALOC" />
                <ConfirmDialog ref={confirmRef} />
            </div>
        );
    }

    // ── 편집 화면 ────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex items-center gap-2">
                <button onClick={backToList}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100" title="목록으로">
                    <ArrowLeft size={16} />
                </button>
                <input type="text" value={def.stgyNm} onChange={(e) => setDef(prev => ({ ...prev, stgyNm: e.target.value }))}
                       placeholder="전략명 (예: 긴급출고 균등배분)" title="표시용 이름 — 실행에 사용되지 않습니다"
                       className="w-72 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
                <label className="text-xs font-bold text-slate-500 ml-2" title="낮을수록 먼저 매칭 판정 — 실행 1회에 전략 1건이 적용됩니다">우선순위</label>
                <input type="number" min="0" value={def.prty}
                       onChange={(e) => setDef(prev => ({ ...prev, prty: e.target.value }))}
                       className="w-20 input-num" />
                <div className="ml-auto flex items-center gap-2">
                    {editingId != null && (
                        <>
                            <button onClick={() => setExecOpen(true)}
                                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-50">
                                <ScrollText size={13} /> 실행 이력
                            </button>
                            <button onClick={() => setRevisionOpen(true)}
                                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-50">
                                <History size={13} /> 리비전 이력
                            </button>
                            <button onClick={remove}
                                    className="flex items-center gap-1 px-3 py-1.5 border border-rose-200 rounded-lg text-[12px] font-bold text-rose-600 hover:bg-rose-50">
                                <Trash2 size={13} /> 삭제
                            </button>
                        </>
                    )}
                    <button onClick={save}
                            className="px-4 py-1.5 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700">
                        저장{dirty && ' *'}
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 flex gap-4">
                {/* 좌: 적용대상 + 슬롯 5섹션 */}
                <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">
                    <div className="border border-slate-200 rounded-xl bg-white p-4 flex flex-col gap-2">
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">적용대상</span>
                            <span className="text-[11px] text-slate-400">
                                대상 주문 <b>전부</b>가 만족해야 이 전략이 선택됩니다 · 비우면 전체 매칭(폴백 전략)
                            </span>
                        </div>
                        <ConditionBuilder fields={tgtFields} value={def.tgtCond}
                                          onChange={(tgtCond) => setDef(prev => ({ ...prev, tgtCond }))}
                                          emptyHint="조건이 없으면 모든 실행에 매칭됩니다 — 폴백 전략으로 쓰입니다." />
                    </div>

                    {SECTIONS.map(section => {
                        const slots = slotsOf(section.typ);
                        return (
                            <div key={section.typ} className="border border-slate-200 rounded-xl bg-white p-4 flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-slate-700">
                                        {section.no} {section.label}
                                    </span>
                                    {section.orderLabel && slots.length > 1 && (
                                        <span className="text-[11px] text-slate-400">위에서부터 {section.orderLabel}</span>
                                    )}
                                    <div className="ml-auto">
                                        {(section.multi || slots.length === 0) && (
                                            <button onClick={() => addOrPick(section)}
                                                className="flex items-center gap-1 px-2.5 py-1 border border-indigo-200 rounded-lg text-[11px] font-bold text-indigo-600 hover:bg-indigo-50">
                                                <Plus size={12} /> {section.typ === 'INVN_FLTR' ? '계층' : '추가'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <span className="text-[11px] text-slate-400 -mt-2">{section.hint}</span>

                                {slots.length === 0 ? (
                                    <div className="border border-dashed border-slate-200 rounded-lg px-3 py-2.5">
                                        <span className="text-[11px] text-slate-400">
                                            미설정 — 기본 동작: <b className="text-slate-500">{section.dflt}</b>
                                        </span>
                                    </div>
                                ) : (
                                    <SortableList
                                        items={slots}
                                        onReorder={(next) => replaceSlots(section.typ, next)}
                                        className="flex flex-col gap-2"
                                        renderItem={(slot, idx, { handle }) => (
                                            <div className="border border-slate-200 rounded-lg p-3 flex flex-col gap-2 bg-white">
                                                <div className="flex items-center gap-2">
                                                    {section.multi && handle}
                                                    {section.orderLabel && section.multi && (
                                                        <span className="text-[11px] font-bold text-indigo-500">
                                                            {idx + 1}{section.typ === 'INVN_FLTR' ? '계층' : ''}
                                                        </span>
                                                    )}
                                                    <span className="text-sm font-bold text-slate-700">
                                                        {section.hasCmpnt
                                                            ? cmpntName(section.typ, slot.cmpntCd)
                                                            : section.slotLabel}
                                                    </span>
                                                    <button onClick={() => removeSlot(section.typ, idx)}
                                                            className="ml-auto p-1 text-slate-300 hover:text-rose-500" title="삭제 (저장 시 반영)">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>

                                                {section.typ === 'RSTRCT' && (
                                                    <ShelfLifeParaForm
                                                        para={slot.para ?? {}}
                                                        onChange={(para) => updateSlot(section.typ, idx, { para })} />
                                                )}

                                                {section.sortDomain && (
                                                    <SortCriteriaEditor
                                                        fields={sortFields[section.sortDomain] ?? []}
                                                        value={slot.para?.criteria ?? []}
                                                        onChange={(criteria) => updateSlot(section.typ, idx, { para: { criteria } })}
                                                        emptyHint={`기준이 없으면 저장할 수 없습니다 — 비워두려면 이 슬롯을 삭제하세요 (기본값: ${section.dflt}).`} />
                                                )}

                                                {section.condDomain && (
                                                    <ConditionBuilder
                                                        fields={condFieldsOf(section.condDomain)}
                                                        value={slot.cond ?? []}
                                                        onChange={(cond) => updateSlot(section.typ, idx, { cond })}
                                                        emptyHint={section.typ === 'DSTRB'
                                                            ? '조건 없음 — 남은 라인 전부가 대상입니다.'
                                                            : '조건 없음 — 남은 후보 전부가 이 계층입니다.'} />
                                                )}
                                            </div>
                                        )}
                                    />
                                )}

                                {section.condHint && slots.length > 1 && (
                                    <span className="text-[11px] text-amber-600">{section.condHint}</span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* 우: 미리보기 */}
                <div className="w-[38rem] shrink-0 flex flex-col gap-3 border border-slate-200 rounded-xl bg-white p-4 overflow-y-auto">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700">미리보기</span>
                        <span className="text-[11px] text-slate-400">저장하지 않은 정의로 산정 — 재고를 건드리지 않습니다</span>
                        <button onClick={runPreview}
                                className="ml-auto flex items-center gap-1 px-3 py-1.5 border border-indigo-200 rounded-lg text-[12px] font-bold text-indigo-600 hover:bg-indigo-50">
                            <Play size={13} /> 실행
                        </button>
                    </div>

                    <div className="flex flex-col gap-1 border border-slate-100 rounded-lg p-2 max-h-40 overflow-y-auto">
                        {waves.length === 0 && (
                            <span className="text-[11px] text-slate-400">할당 대상 웨이브가 없습니다.</span>
                        )}
                        {waves.map(w => (
                            <label key={w.wavId} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                <input type="checkbox" checked={wavIds.includes(w.wavId)}
                                       onChange={(e) => setWavIds(prev => e.target.checked
                                           ? [...prev, w.wavId]
                                           : prev.filter(id => id !== w.wavId))} />
                                <span className="font-mono">{w.wavNo}</span>
                                <span className="text-slate-400">주문 {num(w.orderCount)}건</span>
                                <span className="ml-auto text-slate-400">
                                    요청 {num(w.odrQty)} · 할당 {num(w.alocQty)} · 잔량 {num(w.remainQty)}
                                </span>
                            </label>
                        ))}
                    </div>

                    {!previewResult && (
                        <p className="text-sm text-slate-400 text-center py-10">
                            웨이브를 고르고 실행하면 상품 그룹별 예상 배정을 보여줍니다.<br />
                            <span className="text-xs">미충족이 왜 생기는지 — 계층·제약·분배 단계까지 함께 나옵니다.</span>
                        </p>
                    )}

                    {previewResult && (
                        <>
                            <div className="flex items-center gap-3 text-xs bg-slate-50 rounded-lg px-3 py-2">
                                <span className="text-slate-500">라인 <b className="text-slate-700">{num(previewResult.lineCount)}</b>건</span>
                                <span className="text-slate-500">요청 <b className="text-slate-700">{num(previewResult.reqQty)}</b></span>
                                <span className="text-slate-500">배정 <b className="text-slate-700">{num(previewResult.asgnQty)}</b></span>
                                {previewResult.shortQty > 0 && (
                                    <span className="font-bold text-rose-600">미충족 {num(previewResult.shortQty)}</span>
                                )}
                                <span className="ml-auto text-[11px] text-amber-600">
                                    예상값 — 실행 시점의 가용재고는 다를 수 있습니다
                                </span>
                            </div>
                            <div className="flex flex-col gap-2">
                                {previewResult.groups.map(group => (
                                    <AllocPlanTrace key={group.prodId} trace={group.trace} lines={group.lines} />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <ComponentPicker
                open={picker != null}
                title={`${SECTIONS.find(s => s.typ === picker)?.label ?? ''} 추가`}
                descriptors={components[picker] ?? []}
                /* 제약만 중복을 막는다 — 분배는 같은 방식이라도 대상 조건이 다르면 다른 슬롯이다
                   (「중요 점포 먼저 순차, 나머지 순차」가 정상적인 정의다) */
                disabledCodes={picker === 'RSTRCT' ? slotsOf(picker).map(s => s.cmpntCd) : []}
                onSelect={(d) => addSlot(SECTIONS.find(s => s.typ === picker), d.code)}
                onClose={() => setPicker(null)} />

            {editingId != null && (
                <>
                    <RevisionHistory open={revisionOpen} onClose={() => setRevisionOpen(false)}
                                     listFn={() => strategyApi.revisions('ALOC', editingId)}
                                     getFn={(no) => strategyApi.revision('ALOC', editingId, no)} />
                    <ExecutionHistory open={execOpen} onClose={() => setExecOpen(false)}
                                      stgyTyp="ALOC" stgyId={editingId} />
                </>
            )}
            <ConfirmDialog ref={confirmRef} />
        </div>
    );
}

/**
 * 잔여수명 비율의 파라미터 폼. 규칙별 고정 폼이라 <b>서버 검증과 두 곳이 된다</b> —
 * 기준(basis)·값(minPct)을 바꿀 때는 반드시 AlocRstrct.validatePara와 같이 고친다.
 */
function ShelfLifeParaForm({ para, onChange }) {
    const basis = para.basis ?? 'STORE';
    return (
        <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={basis === 'STORE'}
                       onChange={() => onChange({ basis: 'STORE' })} />
                <span className="text-slate-600">점포 기준</span>
                <span className="text-slate-400 text-[11px]">(점포마다 다른 허용률)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={basis === 'FIXED'}
                       onChange={() => onChange({ basis: 'FIXED', minPct: para.minPct ?? 50 })} />
                <span className="text-slate-600">고정</span>
            </label>
            {basis === 'FIXED' && (
                <div className="flex items-center gap-1">
                    <input type="number" min="0" max="100" value={para.minPct ?? 50}
                           onChange={(e) => onChange({ basis: 'FIXED', minPct: Number(e.target.value) })}
                           className="w-20 input-num" />
                    <span className="text-slate-500">% 이상</span>
                </div>
            )}
        </div>
    );
}
