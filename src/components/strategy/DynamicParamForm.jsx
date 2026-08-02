import DropdownSelect from '@/components/common/DropdownSelect';
import { useOptions } from './useOptions';

/**
 * Descriptor의 ParamSpec[]을 받아 파라미터 폼을 자동 렌더링한다.
 * 검증 메시지·범위도 스키마에서 파생 — 서버 ParamValidator와 같은 원천(P2).
 *
 * props:
 *   specs    [{ key, label, type, required, options, optionSource, min, max, defaultValue }]
 *   value    { key: value }
 *   onChange (nextValue) => void
 */
export default function DynamicParamForm({ specs = [], value = {}, onChange }) {
    if (specs.length === 0) {
        return <span className="text-xs text-slate-400">설정할 파라미터가 없습니다.</span>;
    }

    const set = (key, v) => onChange({ ...value, [key]: v });
    const current = (spec) => value[spec.key] ?? (spec.defaultValue != null
        ? (spec.type === 'BOOLEAN' ? spec.defaultValue === 'true' : spec.defaultValue)
        : (spec.type === 'BOOLEAN' ? false : ''));

    return (
        <div className="flex flex-col gap-2.5">
            {specs.map(spec => (
                <div key={spec.key} className="flex items-center gap-3">
                    <label className="w-40 shrink-0 text-xs font-bold text-slate-500">
                        {spec.label}
                        {spec.required && <span className="text-rose-500 ml-0.5">*</span>}
                    </label>
                    <ParamInput spec={spec} value={current(spec)} onChange={(v) => set(spec.key, v)} />
                </div>
            ))}
        </div>
    );
}

function ParamInput({ spec, value, onChange }) {
    const options = useOptions(spec.optionSource);

    switch (spec.type) {
        case 'NUMBER':
            return (
                <div className="flex items-center gap-2">
                    <input type="number" value={value} min={spec.min ?? undefined} max={spec.max ?? undefined}
                           onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
                           className="w-28 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
                    {(spec.min != null || spec.max != null) && (
                        <span className="text-[11px] text-slate-400">{spec.min ?? ''} ~ {spec.max ?? ''}</span>
                    )}
                </div>
            );
        case 'BOOLEAN':
            return (
                <button onClick={() => onChange(!value)}
                        className={`relative w-10 h-6 rounded-full transition-colors ${value ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
            );
        case 'SELECT': {
            const opts = spec.optionSource
                ? options.map(o => ({ value: o.value, label: o.label }))
                : (spec.options ?? []).map(o => ({ value: o.value, label: o.label }));
            return <div className="w-56"><DropdownSelect value={value} onChange={onChange} options={opts} /></div>;
        }
        case 'DATE':
            return (
                <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
                       className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            );
        default:
            return (
                <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
                       className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            );
    }
}
