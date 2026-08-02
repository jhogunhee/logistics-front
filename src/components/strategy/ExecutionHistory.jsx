import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ScrollText, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { strategyApi } from '@/api/strategyApi';

const TRGR_LABELS = { MANUAL: '화면 조작', AUTO: '자동', PREVIEW: '미리보기' };

const fmt = (v) => (v ? v.replace('T', ' ').slice(0, 16) : '');

/**
 * 전략 실행 이력 모달 — "이 라인이 왜 차단됐나 / 이 배치가 왜 이렇게 배정됐나"를
 * 판정 근거(dcsn_trc) 그대로 보여준다 (프로세스정의서 §4.5). 최근 100건.
 *
 * props:
 *   open     표시 여부
 *   onClose  () => void
 *   stgyTyp  'INSP' | 'PTAWY' — trace 렌더링 형태가 갈린다
 *   stgyId   특정 전략으로 한정 (없으면 유형 전체)
 */
export default function ExecutionHistory({ open, onClose, stgyTyp, stgyId }) {
    const [rows, setRows] = useState([]);
    const [openId, setOpenId] = useState(null);

    useEffect(() => {
        if (!open) return;
        let ignore = false;
        strategyApi.executions(stgyTyp, stgyId)
            .then(data => { if (!ignore) { setRows(data); setOpenId(null); } })
            .catch(e => toast.error(e.message || '실행 이력 조회에 실패했습니다.'));
        return () => { ignore = true; };
    }, [open, stgyTyp, stgyId]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/20" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-[760px] max-h-[85vh] flex flex-col gap-4"
                 onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ScrollText size={16} className="text-indigo-600" />
                        <h3 className="text-lg font-bold text-slate-800">실행 이력</h3>
                        <span className="text-xs text-slate-400">최근 100건 — 행을 펼치면 건별 판정 근거를 보여줍니다</span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
                    {rows.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-8">실행 이력이 없습니다.</p>
                    )}
                    {rows.map(r => (
                        <div key={r.id} className="border border-slate-200 rounded-lg overflow-hidden">
                            <button onClick={() => setOpenId(openId === r.id ? null : r.id)}
                                    className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50">
                                {openId === r.id ? <ChevronDown size={14} className="text-slate-400 shrink-0" />
                                                 : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                                <span className="text-xs text-slate-400 shrink-0">{fmt(r.executedAt)}</span>
                                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold shrink-0">
                                    {TRGR_LABELS[r.trgrTyp] ?? r.trgrTyp}
                                </span>
                                {r.tgtRef && <span className="text-xs font-mono text-slate-500 shrink-0">{r.tgtRef}</span>}
                                <span className="text-xs font-bold text-slate-700 truncate">{r.rsltSmry}</span>
                                <span className="ml-auto text-[11px] text-slate-400 shrink-0">리비전 {r.rvsnNo}</span>
                            </button>
                            {openId === r.id && (
                                <div className="border-t border-slate-100 px-3 py-2 bg-slate-50/50">
                                    <Trace stgyTyp={stgyTyp} trace={r.dcsnTrc} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** dcsn_trc 렌더링 — 유형별 구조(테이블설계서 §8.2)에 맞춰 표를 그리고, 모르는 형태면 JSON 원문 */
function Trace({ stgyTyp, trace }) {
    if (trace == null) return <span className="text-xs text-slate-400">판정 근거가 기록되지 않았습니다.</span>;

    // 검수: 라인 × 규칙
    if (stgyTyp === 'INSP' && Array.isArray(trace)) {
        return (
            <div className="flex flex-col gap-1.5">
                {trace.map((line, li) => (
                    <div key={li} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                        <div className="px-2.5 py-1 text-[11px] font-bold text-slate-600 bg-slate-50">{line.prodCd}</div>
                        {(line.rules ?? []).map((r, ri) => (
                            <div key={ri} className="px-2.5 py-1 border-t border-slate-100 flex items-start gap-2 text-[11px]">
                                {r.skipReason != null
                                    ? <span className="font-bold text-slate-400 shrink-0">— 제외</span>
                                    : r.pass
                                        ? <span className="font-bold text-emerald-600 shrink-0">○ 통과</span>
                                        : <span className="font-bold text-rose-600 shrink-0">✕ 위반</span>}
                                <span className="font-bold text-slate-600 shrink-0">{r.ruleName ?? r.ruleCd}</span>
                                <span className="text-slate-500">
                                    {r.skipReason ?? r.message ?? ''}
                                    {!r.pass && r.actual != null && ` (실제 ${r.actual} · 기대 ${r.expected})`}
                                </span>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        );
    }

    // 적치: 단계 × 후보
    if (stgyTyp === 'PTAWY' && trace.stages) {
        return (
            <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-slate-600">요청 {trace.reqQty} · 배정 {trace.asgnQty}</span>
                {trace.stages.map((st, si) => (
                    <div key={si} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                        <div className="px-2.5 py-1 text-[11px] bg-slate-50 flex items-center gap-2">
                            <span className="font-bold text-slate-600">단계 {si + 1} · {st.mthdCd}</span>
                            <span className={`font-bold ${st.gate === 'PASS' ? 'text-emerald-600' : 'text-slate-400'}`}>{st.gate}</span>
                        </div>
                        {(st.locs ?? []).map((l, li) => (
                            <div key={li} className="px-2.5 py-1 border-t border-slate-100 flex items-center justify-between text-[11px]">
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
        );
    }

    return (
        <pre className="text-[10px] leading-relaxed overflow-auto max-h-60 bg-white border border-slate-200 rounded-lg p-2">
            {JSON.stringify(trace, null, 2)}
        </pre>
    );
}
