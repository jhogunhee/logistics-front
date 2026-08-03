import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, History, Play, Plus, Rocket, ScrollText, Trash2, Waves } from 'lucide-react';
import toast from 'react-hot-toast';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import ConditionBuilder from '@/components/strategy/ConditionBuilder';
import ExecutionHistory from '@/components/strategy/ExecutionHistory';
import RevisionHistory from '@/components/strategy/RevisionHistory';
import WaveOrderTrace from '@/components/strategy/WaveOrderTrace';
import { strategyApi } from '@/api/strategyApi';

const emptyDefinition = () => ({ stgyNm: '', prty: 0, condGrp: [] });

/**
 * SC-03 웨이브 전략관리. 목록 → 편집(좌: 조건그룹 / 우: 미리보기) 2단 구성.
 *
 * 조건그룹끼리는 OR, 그룹 안의 조건끼리는 AND다. 실행하면 전략마다 웨이브가 1개 생기고
 * 조건에 맞는 미편성 주문이 편입되며, 주문은 우선순위가 낮은(=먼저 실행되는) 전략이 선점한다.
 *
 * <b>실행 진입점은 이 화면에 없다</b> — 실행은 전략 정의를 고치는 일이 아니라 실제 편성을 만드는
 * 업무 처리라서 웨이브 편성 화면(/outbound/wave)이 갖는다. 여기 남는 것은 정의 편집과, DB를
 * 바꾸지 않는 미리보기다.
 */
export default function WaveStrategy() {
    const navigate = useNavigate();
    const [mode, setMode] = useState('list');            // 'list' | 'edit'
    const [rows, setRows] = useState([]);
    const [editingId, setEditingId] = useState(null);    // null = 신규
    const [def, setDef] = useState(emptyDefinition());
    const [baseline, setBaseline] = useState('');        // 마지막 저장 상태 — dirty 판정 기준

    const [fields, setFields] = useState([]);            // 웨이브 조건 필드 (메타)
    const [revisionOpen, setRevisionOpen] = useState(false);
    const [execOpen, setExecOpen] = useState(false);
    const [execAllOpen, setExecAllOpen] = useState(false);
    const confirmRef = useRef(null);

    // 미리보기 (대상 주문일 범위 — 비우면 미편성 주문 전체)
    const [range, setRange] = useState({ expctDeFrom: '', expctDeTo: '' });
    const [previewResult, setPreviewResult] = useState(null);

    const dirty = mode === 'edit' && JSON.stringify(def) !== baseline;

    const fetchList = () => strategyApi.waveStrategies.list().then(setRows);

    useEffect(() => {
        strategyApi.meta.fields('wave-order').then(setFields);
        fetchList();
    }, []);

    // 편집 중(dirty) 새로고침/탭 닫기 확인
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
    };

    const openEdit = async (id) => {
        const data = await strategyApi.waveStrategies.get(id);
        const loaded = {
            stgyNm: data.stgyNm,
            prty: data.prty ?? 0,
            condGrp: (data.condGrp ?? []).map(g => g ?? []),
        };
        setEditingId(id);
        setDef(loaded);
        setBaseline(JSON.stringify(loaded));
        setPreviewResult(null);
        setMode('edit');
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
    const updateGroup = (idx, conds) => {
        setDef(prev => ({ ...prev, condGrp: prev.condGrp.map((g, i) => i === idx ? conds : g) }));
    };

    const definition = () => ({ ...def, prty: Number(def.prty) || 0 });

    const save = async () => {
        if (!def.stgyNm.trim()) {
            toast.error('전략명을 입력하세요.');
            return;
        }
        if (def.condGrp.length === 0) {
            toast.error('조건그룹이 1개 이상 필요합니다.');
            return;
        }
        if (def.condGrp.some(g => g.length === 0)) {
            toast.error('빈 조건그룹이 있습니다 — 조건이 없으면 모든 주문이 편입됩니다.');
            return;
        }
        try {
            if (editingId != null) {
                await strategyApi.waveStrategies.update(editingId, definition());
            } else {
                const created = await strategyApi.waveStrategies.create(definition());
                setEditingId(created.wavStgyId);
            }
            setBaseline(JSON.stringify(def));
            toast.success('웨이브 전략을 저장했습니다.');
            fetchList();
        } catch (e) {
            toast.error(e.message || '저장에 실패했습니다.');
        }
    };

    const remove = async () => {
        let execCount = 0;
        try {
            execCount = (await strategyApi.executions('WAV', editingId)).length;
        } catch { /* 집계 실패가 삭제를 막지는 않는다 */ }
        const execText = execCount >= 100 ? '100회 이상' : `${execCount}회`;
        const ok = await confirmRef.current.confirm({
            title: '웨이브 전략 삭제',
            message: `"${def.stgyNm}" 전략의 최근 실행 기록이 ${execText} 있습니다.\n`
                + '삭제해도 이미 만들어진 웨이브와 편성은 그대로 남습니다.\n'
                + '삭제 전 구성은 리비전 이력(감사용)에 남지만, 화면에서 복원할 수는 없습니다.',
            confirmText: '삭제',
            danger: true,
        });
        if (!ok) return;
        try {
            await strategyApi.waveStrategies.remove(editingId);
            toast.success('웨이브 전략을 삭제했습니다.');
            setBaseline(JSON.stringify(def)); // 삭제 후 이탈 가드가 뜨지 않게
            setMode('list');
            fetchList();
        } catch (e) {
            toast.error(e.message || '삭제에 실패했습니다.');
        }
    };

    // ── 미리보기 / 실행 ──────────────────────────────────────
    const rangePayload = () => ({
        expctDeFrom: range.expctDeFrom || null,
        expctDeTo: range.expctDeTo || null,
    });

    const runPreview = async () => {
        if (def.condGrp.length === 0 || def.condGrp.some(g => g.length === 0)) {
            toast.error('조건그룹이 비어 있으면 미리보기할 수 없습니다.');
            return;
        }
        try {
            setPreviewResult(await strategyApi.waveStrategies.preview({
                definition: definition(), ...rangePayload(),
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
                    <Waves size={18} className="text-indigo-600" />
                    <h2 className="text-lg font-bold text-slate-800">웨이브 전략관리</h2>
                    <span className="text-xs text-slate-400 mt-0.5">
                        우선순위 순으로 실행 — 조건에 맞는 미편성 주문을 전략별 웨이브로 편성합니다 (주문은 먼저 실행된 전략이 선점)
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => setExecAllOpen(true)}
                                className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-50">
                            <ScrollText size={13} /> 실행 이력
                        </button>
                        <button onClick={() => navigate('/outbound/wave')}
                                title="전략 실행(실제 편성)은 웨이브 편성 화면에서 합니다"
                                className="flex items-center gap-1 px-3 py-1.5 border border-emerald-200 rounded-lg text-[12px] font-bold text-emerald-700 hover:bg-emerald-50">
                            <Rocket size={13} /> 웨이브 편성으로
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
                                <th className="px-4 py-2.5 text-right w-24 font-bold">조건그룹</th>
                                <th className="px-4 py-2.5 text-right w-20 font-bold">조건</th>
                                <th className="px-4 py-2.5 text-left w-40 font-bold">수정일시</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                                    등록된 웨이브 전략이 없습니다 — 전략이 없으면 웨이브는 화면에서 수동으로만 편성됩니다.
                                </td></tr>
                            )}
                            {rows.map(r => (
                                <tr key={r.wavStgyId} onClick={() => openEdit(r.wavStgyId)}
                                    className="border-t border-slate-100 hover:bg-indigo-50/40 cursor-pointer">
                                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">{r.prty}</td>
                                    <td className="px-4 py-2.5 font-bold text-slate-700">{r.stgyNm}</td>
                                    <td className="px-4 py-2.5 text-right text-slate-600">{r.grpCount}</td>
                                    <td className="px-4 py-2.5 text-right text-slate-600">{r.condCount}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-400">{r.updatedAt?.replace('T', ' ').slice(0, 16)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <ExecutionHistory open={execAllOpen} onClose={() => setExecAllOpen(false)} stgyTyp="WAV" />
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
                       placeholder="전략명 (예: 강남권 당일 웨이브)" title="표시용 이름 — 실행에 사용되지 않습니다"
                       className="w-72 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
                <label className="text-xs font-bold text-slate-500 ml-2" title="낮을수록 먼저 실행 — 주문은 먼저 실행된 전략이 가져갑니다">우선순위</label>
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
                {/* 좌: 조건그룹 */}
                <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-y-auto pr-1">
                    <div className="border border-slate-200 rounded-xl bg-white p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-700">편성 조건</span>
                                <span className="text-[11px] text-slate-400">
                                    그룹 안의 조건은 모두 만족(AND) · 그룹끼리는 하나만 만족해도 편입(OR)
                                    <br />조건 기준값(출고유형·차량편수)의 선택지는 공통코드관리에서 늘릴 수 있습니다.
                                </span>
                            </div>
                            <button onClick={() => setDef(prev => ({ ...prev, condGrp: [...prev.condGrp, []] }))}
                                    className="flex items-center gap-1 px-3 py-1.5 border border-indigo-200 rounded-lg text-[12px] font-bold text-indigo-600 hover:bg-indigo-50">
                                <Plus size={13} /> 조건그룹
                            </button>
                        </div>

                        {def.condGrp.length === 0 && (
                            <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl py-6 text-center">
                                조건그룹이 없습니다 — 1개 이상 추가해야 저장할 수 있습니다.<br />
                                <span className="text-xs">조건 없는 전략은 미편성 주문 전부를 한 웨이브에 넣습니다.</span>
                            </p>
                        )}

                        {def.condGrp.map((group, idx) => (
                            <div key={idx} className="flex flex-col gap-2">
                                {idx > 0 && (
                                    <div className="flex items-center gap-2 my-0.5">
                                        <div className="flex-1 h-px bg-amber-200" />
                                        <span className="text-[11px] font-bold text-amber-600 tracking-widest">OR</span>
                                        <div className="flex-1 h-px bg-amber-200" />
                                    </div>
                                )}
                                <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-slate-700">그룹 {idx + 1}</span>
                                        <span className="text-[11px] text-slate-400">조건끼리 AND</span>
                                        <button onClick={() => setDef(prev => ({ ...prev, condGrp: prev.condGrp.filter((_, i) => i !== idx) }))}
                                                className="ml-auto p-1.5 text-slate-300 hover:text-rose-500" title="그룹 삭제 (저장 시 반영)">
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                    <ConditionBuilder fields={fields} value={group}
                                                      onChange={(conds) => updateGroup(idx, conds)}
                                                      emptyHint="조건이 없으면 모든 미편성 주문이 편입됩니다 — 저장이 거부됩니다." />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 우: 미리보기 */}
                <div className="w-[440px] shrink-0 border border-slate-200 rounded-xl bg-white p-4 flex flex-col gap-3 overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-700">미리보기</span>
                        <span className="text-[11px] text-slate-400">저장 전 정의 그대로 판정 — DB 변경 없음</span>
                    </div>

                    {/* 출고예정일은 편성 조건이 아니라 대상 주문을 좁히는 실행 스코프다 */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500 shrink-0" title="편성 조건이 아니라 판정할 대상 주문의 범위입니다">출고예정일</label>
                        <input type="date" value={range.expctDeFrom}
                               onChange={(e) => setRange(prev => ({ ...prev, expctDeFrom: e.target.value }))}
                               className="flex-1 min-w-0 input-base" />
                        <span className="text-slate-400">~</span>
                        <input type="date" value={range.expctDeTo}
                               onChange={(e) => setRange(prev => ({ ...prev, expctDeTo: e.target.value }))}
                               className="flex-1 min-w-0 input-base" />
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">비우면 미편성 주문 전체가 대상</span>
                        <button onClick={runPreview}
                                className="flex items-center gap-1 px-3 py-2 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700">
                            <Play size={13} /> 미리보기 실행
                        </button>
                    </div>

                    {previewResult && (
                        <div className="flex flex-col gap-2 mt-1">
                            <div className="flex items-center gap-3 text-sm">
                                <span className="font-bold text-slate-700">
                                    편입 {previewResult.matchedCount} / 대상 {previewResult.tgtCount}
                                </span>
                                {previewResult.tgtCount - previewResult.matchedCount > 0 && (
                                    <span className="text-xs font-bold text-slate-400">
                                        제외 {previewResult.tgtCount - previewResult.matchedCount}
                                    </span>
                                )}
                            </div>
                            {previewResult.tgtCount === 0 && (
                                <p className="text-xs text-slate-400">
                                    편성 대상 주문이 없습니다 — 미편성 상태(신규)의 출고 주문만 대상입니다.
                                </p>
                            )}
                            <div className="flex flex-col gap-1.5">
                                {previewResult.orders.map((o, i) => <WaveOrderTrace key={i} order={o} />)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {editingId != null && (
                <>
                    <RevisionHistory open={revisionOpen} onClose={() => setRevisionOpen(false)}
                                     listFn={() => strategyApi.waveStrategies.revisions(editingId)}
                                     getFn={(no) => strategyApi.waveStrategies.revision(editingId, no)} />
                    <ExecutionHistory open={execOpen} onClose={() => setExecOpen(false)} stgyTyp="WAV" stgyId={editingId} />
                </>
            )}
            <ConfirmDialog ref={confirmRef} />
        </div>
    );
}
