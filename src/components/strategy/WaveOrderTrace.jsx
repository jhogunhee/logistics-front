import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { OP_LABELS } from '@/api/strategyApi';
import { useFields } from './useOptions';

/**
 * 웨이브 판정 근거 1건 — 주문 한 줄 + (펼치면) 그룹별·조건별 판정.
 * 미리보기 패널과 실행 이력 모달이 같은 컴포넌트를 쓴다 — 둘이 보는 데이터가 같은 구조이기 때문
 * (미리보기 응답의 orders[] = 실행 로그 dcsn_trc.orders[]).
 */
/** 요약줄 표시용 최소 라벨. 값 목록의 주인은 공통코드지만 두 값뿐이라 조회를 더 걸지 않는다 */
const outbTypLabel = (code) => ({ NRML: '일반출고', RTNGS: '반품출고' }[code] ?? code ?? '-');

export default function WaveOrderTrace({ order }) {
    const [open, setOpen] = useState(false);
    const fields = useFields('wave-order');
    const label = (code) => fields.find(f => f.code === code)?.label ?? code;

    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shrink-0">
            <button onClick={() => setOpen(!open)} className="w-full px-2.5 py-1.5 flex items-center gap-2 text-left hover:bg-slate-50">
                {open ? <ChevronDown size={13} className="text-slate-400 shrink-0" />
                      : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
                {order.matched
                    ? <span className="text-[11px] font-bold text-emerald-600 shrink-0">○ 편입</span>
                    : <span className="text-[11px] font-bold text-slate-400 shrink-0">✕ 제외</span>}
                <span className="text-xs font-mono text-slate-600 shrink-0">{order.outbNo}</span>
                {/* 조건의 기준값을 요약줄에 그대로 노출한다 — 펼치지 않고도 왜 걸렸/빠졌는지 읽히게 */}
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold shrink-0">
                    {outbTypLabel(order.outbTyp)}
                </span>
                <span className="text-[11px] text-slate-500 shrink-0">
                    {order.vhclFltno ? `${order.vhclFltno}편` : '배차미정'}
                </span>
                <span className="text-xs text-slate-500 truncate">{order.storeNm}</span>
                <span className="ml-auto text-[11px] text-slate-400 shrink-0">{order.odrDe}</span>
            </button>
            {open && (
                <div className="border-t border-slate-100 px-2.5 py-1.5 flex flex-col gap-1.5 bg-slate-50/50">
                    {(order.grps ?? []).map((g, gi) => (
                        <div key={gi} className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-[11px]">
                                <span className="font-bold text-slate-500">그룹 {g.idx + 1}</span>
                                <span className={`font-bold ${g.pass ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    {g.pass ? '통과' : '불통과'}
                                </span>
                                {gi > 0 && <span className="text-[10px] text-amber-600 font-bold">OR</span>}
                            </div>
                            {(g.conds ?? []).map((c, ci) => (
                                <div key={ci} className="pl-3 text-[11px] flex items-center gap-1.5">
                                    <span className={c.pass ? 'text-emerald-600' : 'text-rose-500'}>{c.pass ? '○' : '✕'}</span>
                                    <span className="text-slate-600 font-bold">{label(c.fld)}</span>
                                    <span className="text-slate-400">{OP_LABELS[c.op] ?? c.op}</span>
                                    <span className="text-slate-500">{(c.expected ?? []).join(', ')}</span>
                                    <span className="text-slate-400">— 실제 {c.actual ?? '(없음)'}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
