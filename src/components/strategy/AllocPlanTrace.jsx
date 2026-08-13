import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { num } from '@/utils/format';

/**
 * 상품 그룹 1건의 할당 산정 근거. 미리보기 패널과 실행 이력 모달이 함께 쓴다 —
 * 둘이 보는 데이터가 같은 구조이기 때문이다(미리보기 groups[].trace = 실행 로그 dcsnTrc.groups[]).
 *
 * <b>결품 테이블이 없는 프로젝트라 「이 라인이 왜 이만큼만 받았나」의 답이 여기에만 있다.</b>
 * 그래서 배정된 것보다 <b>빠진 것과 그 사유</b>를 더 눈에 띄게 보여준다.
 *
 * props:
 *   trace  산정 trace 객체 { prodCd, reqQty, asgnQty, odrSrt, invnSrt, rstrct, tiers[], skips[] }
 *   lines  (선택) 라인별 결과 [{ outbNo, storeCd, reqQty, asgnQty, ... }] — 미리보기에서만 온다
 */
export default function AllocPlanTrace({ trace, lines }) {
    const [open, setOpen] = useState(true);
    if (!trace) return null;

    const short = (trace.reqQty ?? 0) - (trace.asgnQty ?? 0);

    return (
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <button onClick={() => setOpen(o => !o)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-left">
                {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                <span className="text-sm font-bold text-slate-700">{trace.prodCd}</span>
                <span className="text-xs text-slate-500">
                    요청 {num(trace.reqQty)} · 배정 {num(trace.asgnQty)}
                </span>
                {short > 0 && (
                    <span className="text-xs font-bold text-rose-600">미충족 {num(short)}</span>
                )}
            </button>

            {open && (
                <div className="p-3 flex flex-col gap-3">
                    <div className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 text-[11px]">
                        <span className="text-slate-400 font-bold">주문 순서</span>
                        <span className="text-slate-600 font-mono">{trace.odrSrt}</span>
                        <span className="text-slate-400 font-bold">재고 정렬</span>
                        <span className="text-slate-600 font-mono">{trace.invnSrt}</span>
                        <span className="text-slate-400 font-bold">출고제약</span>
                        <span className="text-slate-600 font-mono">{trace.rstrct}</span>
                    </div>

                    {(trace.tiers ?? []).map((tier, idx) => (
                        <div key={idx} className="border border-slate-100 rounded-lg p-2.5 flex flex-col gap-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-bold text-indigo-600">계층 {tier.seq}</span>
                                <span className="text-[11px] text-slate-500 font-mono">{tier.cond}</span>
                                <span className="ml-auto text-[11px] text-slate-500">
                                    후보 {num(tier.cndtCnt)}건 · 가용 {num(tier.avalQty)} / 요청 {num(tier.reqQty)}
                                </span>
                            </div>
                            {tier.result && <span className="text-[11px] text-slate-400">{tier.result}</span>}
                            {tier.shortage === true && (
                                <span className="text-[11px] font-bold text-amber-600">재고 부족 — 분배 실행</span>
                            )}
                            {(tier.dstrb ?? []).map((slot, i) => (
                                <div key={i} className="flex items-center gap-2 text-[11px] pl-2 border-l-2 border-amber-200">
                                    <span className="font-bold text-slate-600">
                                        분배 {slot.seq} · {slot.cmpntCd}{slot.dflt ? ' (기본값)' : ''}
                                    </span>
                                    <span className="text-slate-400 font-mono">{slot.cond}</span>
                                    <span className="ml-auto text-slate-500">
                                        {slot.result ?? `대상 ${num(slot.tgtLineCnt)}라인 · 배분 ${num(slot.asgnQty)}`}
                                    </span>
                                </div>
                            ))}
                            {tier.sweep && (
                                <span className="text-[11px] text-slate-400">{tier.sweep}</span>
                            )}
                        </div>
                    ))}

                    {lines && lines.length > 0 && (
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-[11px] text-slate-400">
                                    <th className="px-2 py-1 text-left font-bold">출고번호</th>
                                    <th className="px-2 py-1 text-left font-bold">점포</th>
                                    <th className="px-2 py-1 text-right font-bold w-16">요청</th>
                                    <th className="px-2 py-1 text-right font-bold w-16">배정</th>
                                    <th className="px-2 py-1 text-right font-bold w-16">미충족</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map(line => {
                                    const lineShort = line.reqQty - line.asgnQty;
                                    return (
                                        <tr key={line.outbLineId} className="border-t border-slate-100">
                                            <td className="px-2 py-1 font-mono text-slate-600">{line.outbNo}</td>
                                            <td className="px-2 py-1 text-slate-500">{line.storeCd}</td>
                                            <td className="px-2 py-1 text-right text-slate-600">{num(line.reqQty)}</td>
                                            <td className="px-2 py-1 text-right font-bold text-slate-700">{num(line.asgnQty)}</td>
                                            <td className={`px-2 py-1 text-right font-bold ${lineShort > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                                                {num(lineShort)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    {(trace.skips ?? []).length > 0 && (
                        <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-slate-500">
                                후보에서 빠진 재고 {trace.skipsOmitted ? `(${trace.skips.length}건 표시, ${trace.skipsOmitted}건 생략)` : ''}
                            </span>
                            {trace.skips.map((skip, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-[11px] text-slate-500">
                                    <span className="font-mono">{skip.locCd}</span>
                                    <span className="font-mono text-slate-400">{skip.lotNo}</span>
                                    <span className="text-slate-400">→ {skip.outbNo}</span>
                                    <span className="ml-auto text-amber-700">{skip.reason}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
