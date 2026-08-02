/**
 * 검수 규칙별 파라미터 폼 — 규칙마다 고정 폼이다 (동적 스키마 렌더링 아님).
 * 서버 검증 규칙(InspectionRule.validatePara)과 같은 제약을 여기 상수로 명시한다 —
 * 서버 검증을 바꾸면 이 파일도 같이 고칠 것.
 *
 * props:
 *   ruleCd   'SHELF_LIFE_PCT' | 'LOT_DATE_REVERSE'
 *   value    { key: value }
 *   onChange (nextValue) => void
 */

/** 규칙 추가 시 폼에 미리 채울 기본값 (서버 validatePara의 기본값과 동일) */
export const RULE_PARA_DEFAULTS = {
    SHELF_LIFE_PCT: {},                          // minPercent는 필수 — 직접 입력
    LOT_DATE_REVERSE: { excludeSameDay: true },
};

/** 서버 InspectionRule.SHELF_LIFE_PCT.validatePara의 허용 범위 */
const MIN_PERCENT_RANGE = { min: 0, max: 100 };

export default function RuleParamForm({ ruleCd, value = {}, onChange }) {
    const set = (key, v) => onChange({ ...value, [key]: v });

    switch (ruleCd) {
        case 'SHELF_LIFE_PCT':
            return (
                <ParamRow label="최소 잔여비율(%)" required>
                    <input type="number" value={value.minPercent ?? ''}
                           min={MIN_PERCENT_RANGE.min} max={MIN_PERCENT_RANGE.max}
                           onChange={(e) => set('minPercent', e.target.value === '' ? '' : Number(e.target.value))}
                           className="w-28 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
                    <span className="text-[11px] text-slate-400">{MIN_PERCENT_RANGE.min} ~ {MIN_PERCENT_RANGE.max}</span>
                </ParamRow>
            );
        case 'LOT_DATE_REVERSE':
            return (
                <ParamRow label="당일 입고분 제외">
                    <Toggle checked={value.excludeSameDay ?? true}
                            onChange={(v) => set('excludeSameDay', v)} />
                </ParamRow>
            );
        default:
            return <span className="text-xs text-slate-400">설정할 파라미터가 없습니다.</span>;
    }
}

function ParamRow({ label, required, children }) {
    return (
        <div className="flex items-center gap-3">
            <label className="w-40 shrink-0 text-xs font-bold text-slate-500">
                {label}
                {required && <span className="text-rose-500 ml-0.5">*</span>}
            </label>
            <div className="flex items-center gap-2">{children}</div>
        </div>
    );
}

function Toggle({ checked, onChange }) {
    return (
        <button onClick={() => onChange(!checked)}
                className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
    );
}
