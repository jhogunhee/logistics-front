import { forwardRef, useState } from 'react';
import { Keyboard, Minus, Plus } from 'lucide-react';

/**
 * PDA 수량 스테퍼 — 큰 숫자 입력 + −/+ 버튼. +/−는 [min, max]로 죄지만 직접 입력은 숫자만
 * 거르고 그대로 둔다(상한·필수 검증은 확정 시점의 몫 — 조용한 자동 수정을 하지 않는다).
 *
 * 소프트 키보드는 스캔 입력줄과 같은 규칙이다 — 기본 inputMode="none"으로 띄우지 않고
 * 토글로만 연다. PDA는 물리 키패드가 있고 수량 기본값도 채워져 있어 +/−면 끝나는데,
 * 키보드가 뜨면 화면 절반을 덮고 그 아래 확정 버튼을 가린다. 물리 키패드가 없는 스마트폰과
 * 기본값이 없는 재고조사(블라인드)에서는 토글을 켜서 숫자를 친다.
 *
 * @param qty / onChange 수량 문자열 (부모 상태)
 * @param onSubmit       Enter — 확정. 이중 실행 가드는 부모의 확정 함수가 갖는다
 * @param min            −의 하한 (기본 1. 실사처럼 0이 정상 입력이면 0)
 * @param max            +의 상한 (잔량 등. 없으면 무제한)
 * @param suffix         입력 안에 붙는 단위 라벨 (BOX 등)
 */
export const QtyStepper = forwardRef(function QtyStepper(
    { qty, onChange, onSubmit, min = 1, max, placeholder, suffix, autoFocus = false }, ref) {
    const [manual, setManual] = useState(false);
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
                    ref={ref} value={qty} inputMode={manual ? 'numeric' : 'none'}
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
            <button onClick={() => { setManual(m => !m); ref?.current?.focus(); }}
                    aria-label="소프트 키보드로 직접 입력" title="소프트 키보드로 직접 입력"
                    className={`p-3 rounded-xl bg-white border active:bg-slate-100
                        ${manual ? 'border-indigo-300 text-indigo-600' : 'border-slate-200 text-slate-400'}`}>
                <Keyboard size={18} />
            </button>
        </div>
    );
});
