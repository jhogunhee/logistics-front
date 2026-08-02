import { useEffect, useRef, useState } from 'react';
import { ArchiveRestore, ArrowLeft, History, Play, Plus, RotateCcw, ScrollText, Settings2, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import DropdownSelect from '@/components/common/DropdownSelect';
import ProdPickerModal from '@/components/common/ProdPickerModal';
import ComponentPicker from '@/components/strategy/ComponentPicker';
import ConditionBuilder from '@/components/strategy/ConditionBuilder';
import DynamicParamForm from '@/components/strategy/DynamicParamForm';
import ExecutionHistory from '@/components/strategy/ExecutionHistory';
import RevisionHistory from '@/components/strategy/RevisionHistory';
import SortableList from '@/components/strategy/SortableList';
import { strategyApi, OP_LABELS } from '@/api/strategyApi';
import { putawayApi } from '@/api/putawayApi';

const SORT_FIELD_OPTIONS = [
    { value: 'PIKNG_PRTY', label: '피킹순위' },
    { value: 'PTAWY_PRTY', label: '적치순서' },
    { value: 'LOC_CD', label: '로케이션코드' },
];
const SORT_DIR_OPTIONS = [
    { value: 'ASC', label: '오름차순' },
    { value: 'DESC', label: '내림차순' },
];

const emptyDefinition = () => ({
    stgyNm: '', prty: 0, untSpltYn: false, tgtCond: [], locSrt: [], stages: [],
});

/** 조건 요약 문자열 — 목록의 "적용대상 요약" 컬럼 (이름/조건 불일치 방지의 화면 대응) */
const condSummary = (conds, fields) => {
    if (!conds || conds.length === 0) return '(전체 대상)';
    return conds.map(c => {
        const label = fields.find(f => f.code === c.fld)?.label ?? c.fld;
        return `${label} ${OP_LABELS[c.op] ?? c.op} ${(c.vals ?? []).join(',')}`;
    }).join(' · ');
};

/**
 * SC-02 적치 전략관리. 목록 → 편집(좌: 정의 / 우: 미리보기) 2단 구성.
 * 적치 추천 시 적용대상이 맞는 전략 중 우선순위가 가장 낮은(앞선) 1개가 선택된다.
 */
export default function PutawayStrategy() {
    const [mode, setMode] = useState('list');            // 'list' | 'edit'
    const [rows, setRows] = useState([]);
    const [editingId, setEditingId] = useState(null);    // null = 신규
    const [def, setDef] = useState(emptyDefinition());
    const [baseline, setBaseline] = useState('');        // 마지막 저장 상태 스냅샷 — dirty 판정 기준

    // 메타 (레지스트리·필드)
    const [methods, setMethods] = useState([]);
    const [targetFields, setTargetFields] = useState([]);
    const [locFields, setLocFields] = useState([]);

    const [pickerOpen, setPickerOpen] = useState(false);
    const [revisionOpen, setRevisionOpen] = useState(false);
    const [execOpen, setExecOpen] = useState(false);          // 편집 중 전략의 실행 이력
    const [execAllOpen, setExecAllOpen] = useState(false);    // 목록 화면의 전체 실행 이력
    const [deletedOpen, setDeletedOpen] = useState(false);    // 삭제된 전략 복원 모달
    const [deletedRows, setDeletedRows] = useState([]);
    const confirmRef = useRef(null);

    const dirty = mode === 'edit' && JSON.stringify(def) !== baseline;

    // 미리보기
    const [batches, setBatches] = useState([]);          // 적치 대기 배치 (실존 대상)
    const [previewTarget, setPreviewTarget] = useState({ kind: 'batch', batchKey: '', prod: null, qty: '' });
    const [prodPickerOpen, setProdPickerOpen] = useState(false);
    const [previewResult, setPreviewResult] = useState(null);

    const methodOf = (code) => methods.find(m => m.code === code);

    const fetchList = () => strategyApi.putawayStrategies.list().then(setRows);

    useEffect(() => {
        strategyApi.meta.putawayMethods().then(setMethods);
        strategyApi.meta.fields('putaway-target').then(setTargetFields);
        strategyApi.meta.fields('putaway-loc').then(setLocFields);
        fetchList();
    }, []);

    // 편집 중(dirty) 새로고침/탭 닫기 확인 (화면설계서 §1).
    // 앱 내부 사이드바 이동은 BrowserRouter(선언형)라 차단 지점이 없다 — [← 목록] 버튼만 가드한다.
    useEffect(() => {
        if (!dirty) return;
        const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [dirty]);

    // ── 목록 → 편집 전환 ─────────────────────────────────────
    const openNew = () => {
        setEditingId(null);
        const empty = emptyDefinition();
        setDef(empty);
        setBaseline(JSON.stringify(empty));
        setPreviewResult(null);
        setMode('edit');
        putawayApi.lines().then(setBatches); // 미리보기 대상용 배치 목록 (신규 작성 중에도 필요)
    };

    const openEdit = async (id) => {
        const data = await strategyApi.putawayStrategies.get(id);
        setEditingId(id);
        const loaded = {
            stgyNm: data.stgyNm, prty: data.prty, untSpltYn: data.untSpltYn,
            tgtCond: data.tgtCond ?? [], locSrt: data.locSrt ?? [],
            stages: (data.stages ?? []).map(s => ({
                mthdCd: s.mthdCd, mthdPara: s.mthdPara ?? {}, lineCond: s.lineCond ?? [], locCond: s.locCond ?? [],
            })),
        };
        setDef(loaded);
        setBaseline(JSON.stringify(loaded));
        setPreviewResult(null);
        setMode('edit');
        // 미리보기 대상용 배치 목록은 편집 진입 시 로드
        putawayApi.lines().then(setBatches);
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

    // ── 정의 편집 ────────────────────────────────────────────
    const updateStage = (idx, patch) => {
        setDef(prev => ({ ...prev, stages: prev.stages.map((s, i) => i === idx ? { ...s, ...patch } : s) }));
    };

    const definition = () => ({
        ...def,
        prty: Number(def.prty) || 0,
        stages: def.stages.map((s, i) => ({ ...s, srtSeq: i })),
    });

    const save = async () => {
        if (!def.stgyNm.trim()) {
            toast.error('전략명을 입력하세요.');
            return;
        }
        if (def.stages.length === 0) {
            toast.error('단계가 1개 이상 필요합니다.');
            return;
        }
        try {
            if (editingId != null) {
                await strategyApi.putawayStrategies.update(editingId, definition());
            } else {
                const created = await strategyApi.putawayStrategies.create(definition());
                setEditingId(created.ptawyStgyId);
            }
            setBaseline(JSON.stringify(def));
            toast.success('적치 전략을 저장했습니다.');
            fetchList();
        } catch (e) {
            toast.error(e.message || '저장에 실패했습니다.');
        }
    };

    const remove = async () => {
        // 오삭제 방지: 이 전략의 최근 실행 기록을 집계해 함께 보여준다 (화면설계서 §1)
        let execCount = 0;
        try {
            execCount = (await strategyApi.executions('PTAWY', editingId)).length;
        } catch { /* 집계 실패가 삭제를 막지는 않는다 */ }
        const execText = execCount >= 100 ? '100회 이상' : `${execCount}회`;
        const ok = await confirmRef.current.confirm({
            title: '적치 전략 삭제',
            message: `"${def.stgyNm}" 전략의 최근 실행 기록이 ${execText} 있습니다.\n`
                + '삭제하면 추천에서 제외되며, 삭제 전 구성은 리비전 이력에 남아\n'
                + '목록의 [삭제된 전략]에서 복원할 수 있습니다.',
            confirmText: '삭제',
            danger: true,
        });
        if (!ok) return;
        try {
            await strategyApi.putawayStrategies.remove(editingId);
            toast.success('적치 전략을 삭제했습니다.');
            setBaseline(JSON.stringify(def)); // 삭제 후 이탈 가드가 뜨지 않게
            setMode('list');
            fetchList();
        } catch (e) {
            toast.error(e.message || '삭제에 실패했습니다.');
        }
    };

    // ── 삭제된 전략 복원 ─────────────────────────────────────
    const openDeleted = async () => {
        try {
            setDeletedRows(await strategyApi.putawayStrategies.deleted());
            setDeletedOpen(true);
        } catch (e) {
            toast.error(e.message || '삭제된 전략 조회에 실패했습니다.');
        }
    };

    const restoreDeleted = async (row) => {
        try {
            const restored = await strategyApi.putawayStrategies.restore(row.stgyId, row.lastRvsnNo);
            toast.success(`"${row.stgyNm}" 전략을 새 전략으로 복원했습니다.`);
            setDeletedOpen(false);
            fetchList();
            openEdit(restored.ptawyStgyId);
        } catch (e) {
            toast.error(e.message || '복원에 실패했습니다.');
        }
    };

    // ── 미리보기 ─────────────────────────────────────────────
    const runPreview = async () => {
        const qty = Number(previewTarget.qty);
        if (!(qty > 0)) {
            toast.error('미리보기 수량은 1 이상이어야 합니다.');
            return;
        }
        const payload = { definition: definition(), qty };
        if (previewTarget.kind === 'batch') {
            const batch = batches.find(b => `${b.ibLineId}-${b.lotId}` === previewTarget.batchKey);
            if (!batch) {
                toast.error('적치 대기 배치를 선택하세요.');
                return;
            }
            payload.ibLineId = batch.ibLineId;
            payload.lotId = batch.lotId;
        } else {
            if (!previewTarget.prod) {
                toast.error('상품을 선택하세요.');
                return;
            }
            payload.prodId = previewTarget.prod.prodId;
        }
        try {
            setPreviewResult(await strategyApi.putawayStrategies.preview(payload));
        } catch (e) {
            toast.error(e.message || '미리보기에 실패했습니다.');
        }
    };

    const batchOptions = batches.map(b => ({
        value: `${b.ibLineId}-${b.lotId}`,
        label: `${b.ibNo} · ${b.prodCd} · ${b.lotNo} (미적치 ${b.pendingQty})`,
    }));

    // ─────────────────────────────────────────────────────────
    if (mode === 'list') {
        return (
            <div className="flex flex-col gap-4 h-full">
                <div className="flex items-center gap-2">
                    <Settings2 size={18} className="text-indigo-600" />
                    <h2 className="text-lg font-bold text-slate-800">적치 전략관리</h2>
                    <span className="text-xs text-slate-400 mt-0.5">적치 추천 시 적용대상이 맞는 전략 중 우선순위가 가장 앞선 1개가 선택됩니다</span>
                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => setExecAllOpen(true)}
                                className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-50">
                            <ScrollText size={13} /> 실행 이력
                        </button>
                        <button onClick={openDeleted}
                                className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-50">
                            <ArchiveRestore size={13} /> 삭제된 전략
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
                                <th className="px-4 py-2.5 text-left w-24 font-bold">우선순위</th>
                                <th className="px-4 py-2.5 text-left w-56 font-bold">전략명</th>
                                <th className="px-4 py-2.5 text-left font-bold">적용대상 요약</th>
                                <th className="px-4 py-2.5 text-right w-20 font-bold">단계</th>
                                <th className="px-4 py-2.5 text-left w-40 font-bold">수정일시</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                                    등록된 적치 전략이 없습니다 — 전략이 없으면 작업자가 수동으로 로케이션을 고릅니다.
                                </td></tr>
                            )}
                            {rows.map(r => (
                                <tr key={r.ptawyStgyId} onClick={() => openEdit(r.ptawyStgyId)}
                                    className="border-t border-slate-100 hover:bg-indigo-50/40 cursor-pointer">
                                    <td className="px-4 py-2.5 font-bold text-slate-600">{r.prty}</td>
                                    <td className="px-4 py-2.5 font-bold text-slate-700">{r.stgyNm}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-500">{condSummary(r.tgtCond, targetFields)}</td>
                                    <td className="px-4 py-2.5 text-right text-slate-600">{r.stageCount}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-400">{r.updatedAt?.replace('T', ' ').slice(0, 16)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <ExecutionHistory open={execAllOpen} onClose={() => setExecAllOpen(false)} stgyTyp="PTAWY" />

                {/* 삭제된 전략 복원 모달 — stgy_rvsn에만 남은 전략을 새 전략으로 재생 (D4의 안전망) */}
                {deletedOpen && (
                    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20" onClick={() => setDeletedOpen(false)}>
                        <div className="bg-white rounded-2xl shadow-xl p-6 w-[560px] flex flex-col gap-4"
                             onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <ArchiveRestore size={16} className="text-indigo-600" />
                                    <h3 className="text-lg font-bold text-slate-800">삭제된 전략</h3>
                                    <span className="text-xs text-slate-400">복원하면 마지막 리비전으로 새 전략이 만들어집니다</span>
                                </div>
                                <button onClick={() => setDeletedOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                            </div>
                            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                                {deletedRows.length === 0 && (
                                    <p className="text-sm text-slate-400 text-center py-6">삭제된 전략이 없습니다.</p>
                                )}
                                {deletedRows.map(r => (
                                    <div key={r.stgyId} className="flex items-center gap-3 px-4 py-2.5 border border-slate-200 rounded-xl">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-sm font-bold text-slate-700">{r.stgyNm}</span>
                                            <span className="text-[11px] text-slate-400">
                                                마지막 리비전 {r.lastRvsnNo} · {r.lastSavedAt?.replace('T', ' ').slice(0, 16)}
                                            </span>
                                        </div>
                                        <button onClick={() => restoreDeleted(r)}
                                                className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700 shrink-0">
                                            <RotateCcw size={12} /> 복원
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
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
                       placeholder="전략명 (예: 상온 기본)" title="표시용 이름 — 실행에 사용되지 않습니다"
                       className="w-64 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
                <label className="text-xs font-bold text-slate-500 ml-2">우선순위</label>
                <input type="number" min="0" value={def.prty} title="낮을수록 먼저 선택됩니다"
                       onChange={(e) => setDef(prev => ({ ...prev, prty: e.target.value }))}
                       className="w-20 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
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
                {/* 좌: 정의 편집 */}
                <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-y-auto pr-1">
                    {/* 적용대상 */}
                    <div className="border border-slate-200 rounded-xl bg-white p-4 flex flex-col gap-3">
                        <span className="text-sm font-bold text-slate-700">적용대상</span>
                        <ConditionBuilder fields={targetFields} value={def.tgtCond}
                                          onChange={(tgtCond) => setDef(prev => ({ ...prev, tgtCond }))}
                                          emptyHint="조건이 없으면 모든 입고에 적용됩니다." />
                    </div>

                    {/* 단계 */}
                    <div className="border border-slate-200 rounded-xl bg-white p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-700">단계 (실행 순서대로)</span>
                                <span className="text-[11px] text-slate-400">상품 온도대 일치 · 보관 로케이션은 항상 강제됩니다 — 조건이 아니라 전제</span>
                            </div>
                            <button onClick={() => setPickerOpen(true)}
                                    className="flex items-center gap-1 px-3 py-1.5 border border-indigo-200 rounded-lg text-[12px] font-bold text-indigo-600 hover:bg-indigo-50">
                                <Plus size={13} /> 단계
                            </button>
                        </div>
                        {def.stages.length === 0 && (
                            <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl py-6 text-center">
                                단계가 없습니다 — 1개 이상 추가해야 저장할 수 있습니다.
                            </p>
                        )}
                        <SortableList items={def.stages}
                                      onReorder={(stages) => setDef(prev => ({ ...prev, stages }))}
                                      renderItem={(stage, idx, { handle }) => {
                            const m = methodOf(stage.mthdCd);
                            return (
                                <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                                    <div className="flex items-center gap-2">
                                        {handle}
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-sm font-bold text-slate-700">{idx + 1}. {m?.name ?? stage.mthdCd}</span>
                                            <span className="text-xs text-slate-400 leading-relaxed">{m?.description}</span>
                                        </div>
                                        <button onClick={() => setDef(prev => ({ ...prev, stages: prev.stages.filter((_, i) => i !== idx) }))}
                                                className="ml-auto p-1.5 text-slate-300 hover:text-rose-500 shrink-0" title="단계 삭제 (저장 시 반영)">
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                    {(m?.params?.length ?? 0) > 0 && (
                                        <div className="pl-7">
                                            <DynamicParamForm specs={m.params} value={stage.mthdPara}
                                                              onChange={(mthdPara) => updateStage(idx, { mthdPara })} />
                                        </div>
                                    )}
                                    <div className="pl-7 flex flex-col gap-2">
                                        <span className="text-[11px] font-bold text-slate-500">이 단계를 시도할 라인 조건</span>
                                        <ConditionBuilder fields={targetFields} value={stage.lineCond}
                                                          onChange={(lineCond) => updateStage(idx, { lineCond })}
                                                          emptyHint="조건이 없으면 항상 시도합니다." />
                                        <span className="text-[11px] font-bold text-slate-500 mt-1">후보 로케이션 범위</span>
                                        <ConditionBuilder fields={locFields} value={stage.locCond}
                                                          onChange={(locCond) => updateStage(idx, { locCond })}
                                                          emptyHint="조건이 없으면 범위 제한이 없습니다." />
                                    </div>
                                </div>
                            );
                        }} />
                    </div>

                    {/* 전략 정책 */}
                    <div className="border border-slate-200 rounded-xl bg-white p-4 flex flex-col gap-3">
                        <span className="text-sm font-bold text-slate-700">전략 정책</span>
                        <label className="flex items-center gap-3 cursor-pointer select-none"
                               title="입고단위(예: BOX) 배수로 잘라 배정 — 낱개 혼적 방지. 1단위도 안 들어가는 로케이션은 건너뜁니다">
                            <button onClick={() => setDef(prev => ({ ...prev, untSpltYn: !prev.untSpltYn }))}
                                    className={`relative w-10 h-6 rounded-full transition-colors ${def.untSpltYn ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${def.untSpltYn ? 'left-[18px]' : 'left-0.5'}`} />
                            </button>
                            <span className="text-sm text-slate-600">입수 단위 배수 절사</span>
                        </label>

                        <div className="flex flex-col gap-2">
                            <span className="text-[11px] font-bold text-slate-500">후보 정렬 (비우면 피킹순위 → 로케이션코드 오름차순 · 드래그로 우선순위 변경)</span>
                            <SortableList items={def.locSrt} className="flex flex-col gap-2"
                                          onReorder={(locSrt) => setDef(prev => ({ ...prev, locSrt }))}
                                          renderItem={(s, idx, { handle }) => (
                                <div className="flex items-center gap-2">
                                    {handle}
                                    <span className="text-xs text-slate-400 w-4">{idx + 1}.</span>
                                    <div className="w-40"><DropdownSelect value={s.field} options={SORT_FIELD_OPTIONS}
                                        onChange={(field) => setDef(prev => ({ ...prev, locSrt: prev.locSrt.map((x, i) => i === idx ? { ...x, field } : x) }))} /></div>
                                    <div className="w-32"><DropdownSelect value={s.dir} options={SORT_DIR_OPTIONS}
                                        onChange={(dir) => setDef(prev => ({ ...prev, locSrt: prev.locSrt.map((x, i) => i === idx ? { ...x, dir } : x) }))} /></div>
                                    <button onClick={() => setDef(prev => ({ ...prev, locSrt: prev.locSrt.filter((_, i) => i !== idx) }))}
                                            className="p-1.5 text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>
                                </div>
                            )} />
                            <button onClick={() => setDef(prev => ({ ...prev, locSrt: [...prev.locSrt, { field: 'PIKNG_PRTY', dir: 'ASC' }] }))}
                                    className="self-start flex items-center gap-1 px-2 py-1 text-[12px] font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg">
                                <Plus size={13} /> 정렬 기준
                            </button>
                        </div>
                    </div>
                </div>

                {/* 우: 미리보기 */}
                <div className="w-[440px] shrink-0 border border-slate-200 rounded-xl bg-white p-4 flex flex-col gap-3 overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-700">미리보기</span>
                        <span className="text-[11px] text-slate-400">저장 전 정의 그대로 산정 — DB 변경 없음</span>
                    </div>

                    {/* 대상 선택 */}
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" checked={previewTarget.kind === 'batch'}
                                   onChange={() => setPreviewTarget(prev => ({ ...prev, kind: 'batch' }))} />
                            적치 대기 배치
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" checked={previewTarget.kind === 'virtual'}
                                   onChange={() => setPreviewTarget(prev => ({ ...prev, kind: 'virtual' }))} />
                            가상 (상품 직접 선택)
                        </label>
                    </div>
                    {previewTarget.kind === 'batch' ? (
                        <DropdownSelect value={previewTarget.batchKey} options={batchOptions} placeholder="배치 선택"
                                        onChange={(batchKey) => {
                                            const b = batches.find(x => `${x.ibLineId}-${x.lotId}` === batchKey);
                                            setPreviewTarget(prev => ({ ...prev, batchKey, qty: b ? String(b.pendingQty) : prev.qty }));
                                        }} />
                    ) : (
                        <button onClick={() => setProdPickerOpen(true)}
                                className="text-left px-3 py-2 border border-slate-200 rounded-lg text-sm hover:border-indigo-300">
                            {previewTarget.prod
                                ? <span className="font-bold text-slate-700">{previewTarget.prod.prodCd} {previewTarget.prod.prodNm}</span>
                                : <span className="text-slate-400">상품 선택…</span>}
                        </button>
                    )}
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500">수량</label>
                        <input type="number" min="1" value={previewTarget.qty}
                               onChange={(e) => setPreviewTarget(prev => ({ ...prev, qty: e.target.value }))}
                               className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
                        <button onClick={runPreview}
                                className="flex items-center gap-1 px-3 py-2 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700">
                            <Play size={13} /> 미리보기 실행
                        </button>
                    </div>

                    {/* 결과 */}
                    {previewResult && (
                        <div className="flex flex-col gap-2.5 mt-1">
                            {/* 실제 선택 전략 경고 */}
                            {previewResult.actualSelectedStgyId != null && previewResult.actualSelectedStgyId !== editingId && (
                                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 font-bold">
                                    ⚠ 이 대상에는 실제로 "{previewResult.actualSelectedStgyNm}" 전략(우선 매칭)이 선택됩니다 — 아래는 편집 중 정의로 산정한 결과입니다.
                                </div>
                            )}
                            {previewResult.actualSelectedStgyId == null && (
                                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500">
                                    현재 저장된 전략 중 이 대상에 매칭되는 것이 없습니다 (저장 전이거나 적용대상 불일치).
                                </div>
                            )}

                            <div className="flex items-center gap-3 text-sm">
                                <span className="font-bold text-slate-700">배정 {previewResult.asgnQty} / 요청 {previewResult.reqQty}</span>
                                {previewResult.remainQty > 0 && (
                                    <span className="text-xs font-bold text-rose-600">미배정 {previewResult.remainQty}</span>
                                )}
                            </div>
                            {previewResult.assignments.length > 0 && (
                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    {previewResult.assignments.map((a, i) => (
                                        <div key={i} className="px-3 py-1.5 flex items-center justify-between text-sm border-t border-slate-100 first:border-t-0">
                                            <span className="font-mono text-slate-600">{a.locCd}</span>
                                            <span className="font-bold text-emerald-600">{a.qty}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 단계별 trace — "게이트 표" */}
                            {previewResult.trace?.stages?.map((st, si) => (
                                <div key={si} className="border border-slate-200 rounded-lg overflow-hidden">
                                    <div className="px-3 py-1.5 bg-slate-50 flex items-center gap-2 text-xs">
                                        <span className="font-bold text-slate-600">단계 {si + 1} · {methodOf(st.mthdCd)?.name ?? st.mthdCd}</span>
                                        <span className={`font-bold ${st.gate === 'PASS' ? 'text-emerald-600' : 'text-slate-400'}`}>{st.gate}</span>
                                    </div>
                                    {(st.locs ?? []).map((l, li) => (
                                        <div key={li} className="px-3 py-1 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                            <span className="font-mono text-slate-500">{l.locCd}</span>
                                            <span className="text-slate-400">
                                                가능 {l.avalQty} · 배정 <b className={l.asgnQty > 0 ? 'text-emerald-600' : 'text-slate-400'}>{l.asgnQty}</b>
                                                {l.skip && <span className="text-rose-400 ml-1">({l.skip})</span>}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* 모달들 */}
            <ComponentPicker open={pickerOpen} title="적치 단계 추가 (추천 방식 선택)" descriptors={methods}
                             onSelect={(d) => setDef(prev => ({ ...prev, stages: [...prev.stages, { mthdCd: d.code, mthdPara: {}, lineCond: [], locCond: [] }] }))}
                             onClose={() => setPickerOpen(false)} />
            <ProdPickerModal open={prodPickerOpen} onClose={() => setProdPickerOpen(false)}
                             onSelect={(prod) => setPreviewTarget(prev => ({ ...prev, prod }))} />
            {editingId != null && (
                <>
                    <RevisionHistory open={revisionOpen} onClose={() => { setRevisionOpen(false); openEdit(editingId); }}
                                     listFn={() => strategyApi.putawayStrategies.revisions(editingId)}
                                     getFn={(no) => strategyApi.putawayStrategies.revision(editingId, no)}
                                     onRestore={(no) => strategyApi.putawayStrategies.restore(editingId, no)} />
                    <ExecutionHistory open={execOpen} onClose={() => setExecOpen(false)} stgyTyp="PTAWY" stgyId={editingId} />
                </>
            )}
            <ConfirmDialog ref={confirmRef} />
        </div>
    );
}
