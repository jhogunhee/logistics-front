import { forwardRef } from 'react';
import { Minus, Plus } from 'lucide-react';

/**
 * PDA 수량 스테퍼 — 큰 숫자 입력 + −/+ 버튼. +/−는 [min, max]로 죄지만 직접 입력은 숫자만
 * 거르고 그대로 둔다(상한·필수 검증은 확정 시점의 몫 — 조용한 자동 수정을 하지 않는다).
 *
 * @param qty / onChange 수량 문자열 (부모 상태)
 * @param onSubmit       Enter — 확정. 이중 실행 가드는 부모의 확정 함수가 갖는다
 * @param min            −의 하한 (기본 1. 실사처럼 0이 정상 입력이면 0)
 * @param max            +의 상한 (잔량 등. 없으면 무제한)
 * @param suffix         입력 안에 붙는 단위 라벨 (BOX 등)
 */
export const QtyStepper = forwardRef(function QtyStepper(
    { qty, onChange, onSubmit, min = 1, max, placeholder, suffix, autoFocus = false }, ref) {
    const bump = (d) => {
        let n = Math.max(min, (Number(qty) || 0) + d);
        if (max != null) n = Math.min(max, n);
        onChange(String(n));
    };
    return (
        <div className="flex items-center gap-2">
            <button onClick={() => bump(-1)} aria-label="수량 빼기"
                    className="p-3 rounded-xl bg-white border border-slate-200 text-slate-600 active:bg-slate-100">
                <Minus size={18} />
            </button>
            <div className="relative flex-1 min-w-0">
                <input
                    ref={ref} value={qty} inputMode="numeric"
                    placeholder={placeholder} autoFocus={autoFocus}
                    onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
                    className={`input-num w-full text-2xl font-bold py-2 ${suffix ? 'pr-14' : ''}`}
                />
                {suffix && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                        {suffix}
                    </span>
                )}
            </div>
            <button onClick={() => bump(1)} aria-label="수량 더하기"
                    className="p-3 rounded-xl bg-white border border-slate-200 text-slate-600 active:bg-slate-100">
                <Plus size={18} />
            </button>
        </div>
    );
});
