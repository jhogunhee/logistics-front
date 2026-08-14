import { num } from '@/utils/format';
import { usePutawayMethods } from './useOptions';

/**
 * 적치 판정 근거 — 단계별 게이트 + 후보 로케이션별 배정.
 * 미리보기 패널과 실행 이력 모달이 같은 컴포넌트를 쓴다 — 둘이 보는 데이터가 같은 구조이기 때문
 * (미리보기 응답의 trace = 실행 로그 dcsn_trc).
 *
 * <p>「가능 0」의 <b>이유</b>를 함께 보여주는 것이 이 표의 핵심이다. 적재가능수량은 현재고만이
 * 아니라 미완료 지시가 잡아둔 자리와 같은 추천의 앞선 배치가 잡은 자리까지 빼고 계산되는데,
 * 결과 숫자만 보이면 「비어 있는데 왜 못 넣지」로 읽힌다.
 */
export default function PutawayStageTrace({ trace }) {
    const methods = usePutawayMethods();
    const methodName = (code) => methods.find(m => m.code === code)?.name ?? code;

    if (!trace?.stages) return null;

    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-slate-600">
                요청 {num(trace.reqQty)} · 배정 {num(trace.asgnQty)}
            </span>
            {trace.stages.map((st, si) => (
                <div key={si} className="border border-slate-200 rounded-lg overflow-hidden bg-white shrink-0">
                    <div className="px-2.5 py-1 bg-slate-50 flex items-center gap-2 text-[11px]">
                        <span className="font-bold text-slate-600">단계 {si + 1} · {methodName(st.mthdCd)}</span>
                        <span className={`font-bold ${st.gate === 'PASS' ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {st.gate}
                        </span>
                    </div>
                    {(st.locs ?? []).map((l, li) => (
                        <div key={li} className="px-2.5 py-1 border-t border-slate-100 text-[11px]">
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-slate-500">{l.locCd}</span>
                                <span className="text-slate-400">
                                    가능 {num(l.avalQty)} · 배정{' '}
                                    <b className={l.asgnQty > 0 ? 'text-emerald-600' : 'text-slate-400'}>
                                        {num(l.asgnQty)}
                                    </b>
                                    {l.skip && <span className="text-rose-400 ml-1">({l.skip})</span>}
                                </span>
                            </div>
                            <Occupancy loc={l} />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

/** 적재가능수량을 깎은 것들. 해당 없으면 줄 자체가 없다 (trace에서 키가 빠져 온다) */
function Occupancy({ loc }) {
    const parts = [];
    if (loc.inflowQty > 0) parts.push(`미완료 지시 ${num(loc.inflowQty)}`);
    if (loc.crossQty > 0) parts.push(`앞선 배치 ${num(loc.crossQty)}`);
    if (!parts.length && !loc.warn) return null;

    return (
        <div className="pl-1 flex items-center gap-2 text-[10px]">
            {parts.length > 0 && (
                <span className="text-slate-400">자리 점유 — {parts.join(' · ')}</span>
            )}
            {loc.warn && <span className="text-amber-600">{loc.warn}</span>}
        </div>
    );
}
