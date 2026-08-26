import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ScrollText, X } from 'lucide-react';

import { strategyApi } from '@/api/strategyApi';
import { usePage } from '@/hooks/usePage';
import { fmtDt, num } from '@/utils/format';
import Pager from '@/components/common/Pager';
import AllocPlanTrace from './AllocPlanTrace';
import PutawayStageTrace from './PutawayStageTrace';
import WaveOrderTrace from './WaveOrderTrace';

const TRGR_LABELS = { MANUAL: '화면 조작', AUTO: '스케줄 실행', PREVIEW: '미리보기' };

// 페이지가 작은 이유 — 행마다 판정 근거(dcsn_trc) JSON을 통째로 실어 온다
const PAGE_SIZE = 30;

/**
 * 전략 실행 이력 모달 — "이 라인이 왜 차단됐나 / 이 배치가 왜 이렇게 배정됐나"를
 * 판정 근거(dcsn_trc) 그대로 보여준다. 서버 페이징(최근 순).
 *
 * props:
 *   open     표시 여부
 *   onClose  () => void
 *   stgyTyp  'INSP' | 'PTAWY' | 'WAV' | 'ALOC' — trace 렌더링 형태가 갈린다
 *   stgyId   특정 전략으로 한정 (없으면 유형 전체)
 *   stgyNmOf (stgyId) => 전략명. 유형 전체를 열 때 행이 어느 전략의 것인지 구분하는 데 쓴다 (없으면 표시 안 함)
 *   openLatest 열릴 때 최신 행을 펼친 채로 시작 — 실행 직후 "방금 실행 결과"로 여는 용도
 */
export default function ExecutionHistory({ open, onClose, stgyTyp, stgyId, stgyNmOf, openLatest = false }) {
    const [data, setData] = useState({ rows: [], totCnt: 0 });
    const [openId, setOpenId] = useState(null);
    // 기본은 실행 기록만. 미리보기는 결과를 반영하지 않은 산정이라 「무엇이 실제로 일어났나」와 섞이면 안 된다
    const [withPreview, setWithPreview] = useState(false);
    const { page, size, setPage, reset } = usePage(PAGE_SIZE);

    // 모달은 언마운트되지 않고 open만 바뀐다 — 다시 열 때·미리보기 토글 때 1페이지로 돌리지 않으면 이전 페이지가 남는다
    useEffect(() => { reset(); }, [open, withPreview, stgyTyp, stgyId, reset]);

    useEffect(() => {
        if (!open) return;
        let ignore = false;
        strategyApi.executions(stgyTyp, stgyId, withPreview ? ['MANUAL', 'AUTO', 'PREVIEW'] : null, { page, size })
            .then(res => {
                if (ignore) return;
                setData(res);
                // 「방금 실행 결과」로 열 때만 최신 행을 펼친다 — 1페이지의 첫 행이 그것이다
                setOpenId(openLatest && page === 1 ? res.rows[0]?.id ?? null : null);
            })
            .catch(() => {}); // 실패 토스트는 axios 인터셉터가 띄운다
        return () => { ignore = true; };
    }, [open, stgyTyp, stgyId, withPreview, openLatest, page, size]);
    const rows = data.rows;

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/20" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-[760px] max-h-[85vh] flex flex-col gap-4"
                 onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ScrollText size={16} className="text-indigo-600" />
                        <h3 className="text-lg font-bold text-slate-800">실행 이력</h3>
                        <span className="text-xs text-slate-400">최근 순 — 행을 펼치면 건별 판정 근거를 보여줍니다</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                            <input type="checkbox" checked={withPreview}
                                   onChange={(e) => setWithPreview(e.target.checked)}
                                   className="accent-indigo-600" />
                            미리보기 포함
                        </label>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
                    {rows.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-8">
                            {withPreview ? '이력이 없습니다.' : '실행 이력이 없습니다 — 미리보기 기록은 위 체크박스로 볼 수 있습니다.'}
                        </p>
                    )}
                    {rows.map(r => (
                        // shrink-0 — 세로 flex 안에서 행이 눌려 글자가 잘리는 것을 막는다 (overflow-hidden이 최소높이를 0으로 만든다)
                        <div key={r.id} className="border border-slate-200 rounded-lg overflow-hidden shrink-0">
                            <button onClick={() => setOpenId(openId === r.id ? null : r.id)}
                                    className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50">
                                {openId === r.id ? <ChevronDown size={14} className="text-slate-400 shrink-0" />
                                                 : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                                <span className="text-xs text-slate-400 shrink-0">{fmtDt(r.executedAt)}</span>
                                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold shrink-0">
                                    {TRGR_LABELS[r.trgrTyp] ?? r.trgrTyp}
                                </span>
                                {stgyNmOf && (
                                    <span className="text-xs font-bold text-indigo-600 shrink-0">
                                        {stgyNmOf(r.stgyId) ?? `전략 #${r.stgyId} (삭제됨)`}
                                    </span>
                                )}
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

                {/* 페이저는 스크롤 영역 밖 — 목록이 길어도 늘 보인다 */}
                <div className="shrink-0 flex justify-end">
                    <Pager page={page} size={size} totCnt={data.totCnt} onChange={setPage} />
                </div>
            </div>
        </div>
    );
}

/** dcsn_trc 렌더링 — 유형별 구조에 맞춰 표를 그리고, 모르는 형태면 JSON 원문 */
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

    // 적치: 단계 × 후보 (미리보기 패널과 같은 구조라 같은 컴포넌트를 쓴다)
    if (stgyTyp === 'PTAWY' && trace.stages) {
        return <PutawayStageTrace trace={trace} />;
    }

    // 웨이브: 주문 × 조건그룹
    if (stgyTyp === 'WAV' && trace.orders) {
        return (
            <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-slate-600">
                    대상 {num(trace.tgtCount)} · 편입 {num(trace.matchedCount)}
                </span>
                {trace.orders.map((o, oi) => <WaveOrderTrace key={oi} order={o} />)}
            </div>
        );
    }

    // 할당: 상품 그룹 × 계층·분배 (미리보기와 같은 구조라 같은 컴포넌트를 쓴다)
    if (stgyTyp === 'ALOC' && trace.groups) {
        return (
            <div className="flex flex-col gap-2">
                {trace.groups.map((g, gi) => <AllocPlanTrace key={gi} trace={g} />)}
            </div>
        );
    }

    return (
        <pre className="text-[10px] leading-relaxed overflow-auto max-h-60 bg-white border border-slate-200 rounded-lg p-2">
            {JSON.stringify(trace, null, 2)}
        </pre>
    );
}
