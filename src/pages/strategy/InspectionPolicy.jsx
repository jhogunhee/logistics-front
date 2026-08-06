import { useEffect, useRef, useState } from 'react';
import { History, Play, Plus, ScrollText, ShieldCheck, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import DropdownSelect from '@/components/common/DropdownSelect';
import ProdPickerModal from '@/components/common/ProdPickerModal';
import ComponentPicker from '@/components/strategy/ComponentPicker';
import RuleParamForm, { RULE_PARA_DEFAULTS } from '@/components/strategy/RuleParamForm';
import ExecutionHistory from '@/components/strategy/ExecutionHistory';
import RevisionHistory from '@/components/strategy/RevisionHistory';
import SortableList from '@/components/strategy/SortableList';
import { strategyApi } from '@/api/strategyApi';
import { asnApi } from '@/api/asnApi';
import { todayStr } from '@/utils/format';

// 오늘 "YYYY-MM-DD" (미리보기 로트 기본값)

/**
 * SC-01 검수 정책관리. 정책은 전역 1개 — 목록 없이 바로 편집 화면이다.
 * 등록된 규칙은 검수 저장마다 전부(AND) 실행되고, 위반 시 저장 전체가 거부된다.
 * 좌: 정의 편집 / 우: 미리보기 (미저장 정의 그대로 Dry-run — P4).
 */
export default function InspectionPolicy() {
    const [descriptors, setDescriptors] = useState([]);   // 규칙 레지스트리 (메타 API)
    const [exists, setExists] = useState(false);
    const [plcyId, setPlcyId] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [stgyNm, setStgyNm] = useState('');
    const [rules, setRules] = useState([]);               // [{ ruleCd, para }]
    const [baseline, setBaseline] = useState('');         // 마지막 저장 상태 스냅샷 — dirty 판정 기준
    const [pickerOpen, setPickerOpen] = useState(false);
    const [revisionOpen, setRevisionOpen] = useState(false);
    const [execOpen, setExecOpen] = useState(false);

    // 미리보기
    const [previewKind, setPreviewKind] = useState('virtual'); // 'virtual' 가상 로트 | 'asn' 검수 대기 입고
    const [asnList, setAsnList] = useState([]);
    const [asnId, setAsnId] = useState('');
    const [previewLots, setPreviewLots] = useState([]);   // [{ prodId, prodCd, prodNm, shelfLifeDays, mfgDt, receiptDt }]
    const [prodPickerOpen, setProdPickerOpen] = useState(false);
    const [previewResult, setPreviewResult] = useState(null);

    const confirmRef = useRef(null);

    const descriptorOf = (code) => descriptors.find(d => d.code === code);

    const snapshotOf = (nm, ruleList) => JSON.stringify({ stgyNm: nm, rules: ruleList });

    const applyPolicy = (data) => {
        const mapped = (data.rules ?? []).map(r => ({ ruleCd: r.ruleCd, para: r.para ?? {} }));
        setExists(data.exists);
        setPlcyId(data.inspPlcyId ?? null);
        setStgyNm(data.stgyNm ?? '');
        setRules(mapped);
        setBaseline(snapshotOf(data.stgyNm ?? '', mapped));
        setLoaded(true);
    };

    const dirty = loaded && snapshotOf(stgyNm, rules) !== baseline;

    const fetchPolicy = () => strategyApi.inspectionPolicy.get().then(applyPolicy);

    useEffect(() => {
        strategyApi.meta.inspectionRules().then(setDescriptors);
        strategyApi.inspectionPolicy.get().then(applyPolicy);
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps -- 최초 1회 로드 (applyPolicy는 안정적)

    // 편집 중(dirty) 새로고침/탭 닫기 확인.
    // 앱 내부 사이드바 이동은 BrowserRouter(선언형)라 차단 지점이 없다 — 데이터 라우터 전환 시 useBlocker로 보강한다.
    useEffect(() => {
        if (!dirty) return;
        const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [dirty]);

    // ── 정의 편집 ────────────────────────────────────────────
    const addRule = (descriptor) => {
        setRules(prev => [...prev, { ruleCd: descriptor.code, para: { ...(RULE_PARA_DEFAULTS[descriptor.code] ?? {}) } }]);
    };

    const definition = () => ({
        stgyNm,
        rules: rules.map((r, i) => ({ srtSeq: i, ruleCd: r.ruleCd, para: r.para })),
    });

    const save = async () => {
        if (!stgyNm.trim()) {
            toast.error('정책명을 입력하세요.');
            return;
        }
        try {
            if (exists) {
                await strategyApi.inspectionPolicy.update(definition());
            } else {
                await strategyApi.inspectionPolicy.create(definition());
            }
            toast.success('검수 정책을 저장했습니다.');
            fetchPolicy();
        } catch (e) {
            toast.error(e.message || '저장에 실패했습니다.');
        }
    };

    const remove = async () => {
        // 오삭제 방지: 이 정책의 최근 실행 기록을 집계해 함께 보여준다
        let execCount = 0;
        try {
            execCount = (await strategyApi.executions('INSP', plcyId)).length;
        } catch { /* 집계 실패가 삭제를 막지는 않는다 */ }
        const execText = execCount >= 100 ? '100회 이상' : `${execCount}회`;
        const ok = await confirmRef.current.confirm({
            title: '검수 정책 삭제',
            message: `이 정책의 최근 실행 기록이 ${execText} 있습니다.\n`
                + '정책과 규칙 전부가 삭제되고, 이후 검수는 제약 없이 통과합니다.\n'
                + '삭제 전 구성은 리비전 이력(감사용)에 남지만, 화면에서 복원할 수는 없습니다.',
            confirmText: '삭제',
            danger: true,
        });
        if (!ok) return;
        try {
            await strategyApi.inspectionPolicy.remove();
            toast.success('검수 정책을 삭제했습니다.');
            setPreviewResult(null);
            fetchPolicy();
        } catch (e) {
            toast.error(e.message || '삭제에 실패했습니다.');
        }
    };

    // ── 미리보기 ─────────────────────────────────────────────
    // 검수 대기 입고 선택 — 라인을 미리보기 로트로 프리필한다 (제조일자는 편집해서 시나리오 재현)
    const switchPreviewKind = (kind) => {
        setPreviewKind(kind);
        if (kind === 'asn' && asnList.length === 0) {
            asnApi.list().then(data =>
                setAsnList(data.filter(a => ['SCHEDULED', 'RECEIVING'].includes(a.status))));
        }
    };

    const pickAsn = async (id) => {
        setAsnId(id);
        const lines = await asnApi.lines(id);
        setPreviewLots(lines.map(l => ({
            prodId: l.prodId, prodCd: l.prodCd, prodNm: l.prodNm,
            shelfLifeDays: l.shelfLifeDays,
            mfgDt: l.shelfLifeDays != null ? todayStr() : '',
            receiptDt: todayStr(),
        })));
    };

    const addPreviewProd = (prod) => {
        setPreviewLots(prev => [...prev, {
            prodId: prod.prodId, prodCd: prod.prodCd, prodNm: prod.prodNm,
            shelfLifeDays: prod.shelfLifeDays,
            mfgDt: prod.shelfLifeDays != null ? todayStr() : '',
            receiptDt: todayStr(),
        }]);
    };

    const runPreview = async () => {
        if (rules.length === 0) {
            toast('규칙이 없습니다 — 모든 검수가 통과합니다.');
            return;
        }
        if (previewLots.length === 0) {
            toast.error('미리보기할 로트를 추가하세요.');
            return;
        }
        try {
            const result = await strategyApi.inspectionPolicy.preview({
                definition: { ...definition(), stgyNm: stgyNm || '(미저장)' },
                lots: previewLots.map(l => ({
                    prodId: l.prodId,
                    mfgDt: l.mfgDt || null,
                    receiptDt: l.receiptDt || null,
                })),
            });
            setPreviewResult(result);
        } catch (e) {
            toast.error(e.message || '미리보기에 실패했습니다.');
        }
    };

    if (!loaded) return null;

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">검수 정책관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">등록된 규칙은 모든 검수 저장에서 전부(AND) 실행됩니다 — 위반 시 저장 전체 거부</span>
                <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => setExecOpen(true)}
                            className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-50">
                        <ScrollText size={13} /> 실행 이력
                    </button>
                    <button onClick={() => setRevisionOpen(true)}
                            className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-50">
                        <History size={13} /> 리비전 이력
                    </button>
                    {exists && (
                        <button onClick={remove}
                                className="flex items-center gap-1 px-3 py-1.5 border border-rose-200 rounded-lg text-[12px] font-bold text-rose-600 hover:bg-rose-50">
                            <Trash2 size={13} /> 삭제
                        </button>
                    )}
                    <button onClick={save}
                            className="px-4 py-1.5 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700">
                        저장{dirty && ' *'}
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 flex gap-4">
                {/* 좌: 정의 편집 */}
                <div className="flex-1 min-w-0 border border-slate-200 rounded-xl bg-white p-4 flex flex-col gap-4 overflow-y-auto">
                    <div className="flex items-center gap-3">
                        <label className="text-xs font-bold text-slate-500 shrink-0">정책명</label>
                        <input type="text" value={stgyNm} onChange={(e) => setStgyNm(e.target.value)}
                               placeholder="예: 기본 검수 제약" title="표시용 이름 — 실행에 사용되지 않습니다"
                               className="w-72 input-base" />
                        {!exists && <span className="text-[11px] text-amber-600 font-bold">아직 정책이 없습니다 — 저장하면 생성됩니다</span>}
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-700">규칙 목록</span>
                        <button onClick={() => setPickerOpen(true)}
                                className="flex items-center gap-1 px-3 py-1.5 border border-indigo-200 rounded-lg text-[12px] font-bold text-indigo-600 hover:bg-indigo-50">
                            <Plus size={13} /> 규칙
                        </button>
                    </div>

                    {rules.length === 0 && (
                        <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl py-8 text-center">
                            제약 없음 — 모든 검수가 통과합니다.
                        </p>
                    )}
                    <SortableList items={rules} onReorder={setRules} renderItem={(rule, idx, { handle }) => {
                        const d = descriptorOf(rule.ruleCd);
                        return (
                            <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    {handle}
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-sm font-bold text-slate-700">{idx + 1}. {d?.name ?? rule.ruleCd}</span>
                                        <span className="text-xs text-slate-400 leading-relaxed">{d?.dscr}</span>
                                    </div>
                                    <button onClick={() => setRules(prev => prev.filter((_, i) => i !== idx))}
                                            className="ml-auto p-1.5 text-slate-300 hover:text-rose-500 shrink-0" title="규칙 삭제 (저장 시 반영)">
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                                <div className="pl-7">
                                    <RuleParamForm ruleCd={rule.ruleCd} value={rule.para}
                                                   onChange={(para) => setRules(prev => prev.map((r, i) => i === idx ? { ...r, para } : r))} />
                                </div>
                            </div>
                        );
                    }} />
                </div>

                {/* 우: 미리보기 */}
                <div className="w-[440px] shrink-0 border border-slate-200 rounded-xl bg-white p-4 flex flex-col gap-3 overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-700">미리보기</span>
                        <span className="text-[11px] text-slate-400">저장 전 정의 그대로 판정 — DB 변경 없음</span>
                    </div>

                    {/* 대상 선택: 검수 대기 입고 프리필 또는 가상 로트 직접 입력 */}
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" checked={previewKind === 'asn'} onChange={() => switchPreviewKind('asn')} />
                            검수 대기 입고
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" checked={previewKind === 'virtual'} onChange={() => switchPreviewKind('virtual')} />
                            가상 로트
                        </label>
                    </div>
                    {previewKind === 'asn' && (
                        <DropdownSelect value={asnId} onChange={pickAsn} placeholder="입고예정 선택 — 라인이 아래에 채워집니다"
                                        options={asnList.map(a => ({ value: a.ibOrderId, label: `${a.ibNo} · ${a.vndrNm}` }))} />
                    )}
                    <div className="flex items-center gap-2">
                        {previewKind === 'virtual' && (
                            <button onClick={() => setProdPickerOpen(true)}
                                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-50">
                                <Plus size={13} /> 로트
                            </button>
                        )}
                        <button onClick={runPreview}
                                className="btn-primary">
                            <Play size={13} /> 미리보기 실행
                        </button>
                    </div>

                    {/* 대상 로트 입력 */}
                    {previewLots.map((lot, idx) => (
                        <div key={idx} className="border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2">
                            <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-xs font-bold text-slate-700 truncate">{lot.prodCd} {lot.prodNm}</span>
                                <div className="flex items-center gap-2 mt-1">
                                    <label className="text-[10px] text-slate-400">제조</label>
                                    <input type="date" value={lot.mfgDt} disabled={lot.shelfLifeDays == null}
                                           onChange={(e) => setPreviewLots(prev => prev.map((l, i) => i === idx ? { ...l, mfgDt: e.target.value } : l))}
                                           className="px-1.5 py-1 border border-slate-200 rounded text-[11px] disabled:bg-slate-50" />
                                    <label className="text-[10px] text-slate-400">입고</label>
                                    <input type="date" value={lot.receiptDt}
                                           onChange={(e) => setPreviewLots(prev => prev.map((l, i) => i === idx ? { ...l, receiptDt: e.target.value } : l))}
                                           className="px-1.5 py-1 border border-slate-200 rounded text-[11px]" />
                                </div>
                            </div>
                            <button onClick={() => setPreviewLots(prev => prev.filter((_, i) => i !== idx))}
                                    className="p-1 text-slate-300 hover:text-rose-500 shrink-0"><Trash2 size={13} /></button>
                        </div>
                    ))}
                    {previewLots.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-3">상품을 추가하고 제조/입고일자를 조정해 판정을 확인하세요.</p>
                    )}

                    {/* 판정 결과 */}
                    {previewResult && (
                        <div className="flex flex-col gap-2 mt-1">
                            {previewResult.lots.map((lot, li) => (
                                <div key={li} className="border border-slate-200 rounded-lg overflow-hidden">
                                    <div className="px-3 py-1.5 bg-slate-50 text-xs font-bold text-slate-600">{lot.prodCd} {lot.prodNm}</div>
                                    {lot.rules.map((r, ri) => (
                                        <div key={ri} className="px-3 py-1.5 border-t border-slate-100 flex items-start gap-2">
                                            {r.skipReason != null ? (
                                                <span className="text-[11px] font-bold text-slate-400 shrink-0 mt-0.5">— 제외</span>
                                            ) : r.pass ? (
                                                <span className="text-[11px] font-bold text-emerald-600 shrink-0 mt-0.5">○ 통과</span>
                                            ) : (
                                                <span className="text-[11px] font-bold text-rose-600 shrink-0 mt-0.5">✕ 위반</span>
                                            )}
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-xs font-bold text-slate-600">{r.ruleName}</span>
                                                {r.skipReason != null && <span className="text-[11px] text-slate-400">{r.skipReason}</span>}
                                                {!r.pass && (
                                                    <>
                                                        <span className="text-[11px] text-rose-600">{r.message}</span>
                                                        <span className="text-[11px] text-slate-400">실제 {r.actual} · 기대 {r.expected}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* 모달들 */}
            <ComponentPicker open={pickerOpen} title="검수 규칙 추가" descriptors={descriptors}
                             disabledCodes={rules.map(r => r.ruleCd)}
                             onSelect={addRule} onClose={() => setPickerOpen(false)} />
            <ProdPickerModal open={prodPickerOpen} onClose={() => setProdPickerOpen(false)} onSelect={addPreviewProd} />
            <RevisionHistory open={revisionOpen} onClose={() => setRevisionOpen(false)}
                             listFn={strategyApi.inspectionPolicy.revisions}
                             getFn={strategyApi.inspectionPolicy.revision} />
            <ExecutionHistory open={execOpen} onClose={() => setExecOpen(false)} stgyTyp="INSP" stgyId={plcyId ?? undefined} />
            <ConfirmDialog ref={confirmRef} />
        </div>
    );
}
