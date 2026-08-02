import { Plus, Trash2 } from 'lucide-react';

import DropdownSelect from '@/components/common/DropdownSelect';
import { OP_LABELS } from '@/api/strategyApi';
import { useOptions } from './useOptions';

/**
 * 조건 목록([{ fld, op, vals }]) 편집기 — 조건 간 AND.
 * 필드·허용 연산자·값 선택지는 전부 메타 API(fields)에서 온다 — 하드코딩 금지 (P1).
 *
 * props:
 *   fields    메타 API 응답 [{ code, label, allowedOps, optionSource }]
 *   value     조건 배열
 *   onChange  (next) => void
 *   emptyHint 조건 0건일 때 안내 문구 (예: "조건이 없으면 모든 입고에 적용됩니다")
 */
export default function ConditionBuilder({ fields, value = [], onChange, emptyHint }) {
    const fieldOf = (code) => fields.find(f => f.code === code);

    const addRow = () => {
        const first = fields[0];
        if (!first) return;
        onChange([...value, { fld: first.code, op: first.allowedOps[0], vals: [] }]);
    };

    const updateRow = (idx, patch) => {
        onChange(value.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
    };

    const removeRow = (idx) => {
        onChange(value.filter((_, i) => i !== idx));
    };

    return (
        <div className="flex flex-col gap-2">
            {value.length === 0 && emptyHint && (
                <span className="text-xs text-slate-400">{emptyHint}</span>
            )}
            {value.map((cond, idx) => {
                const field = fieldOf(cond.fld);
                return (
                    <div key={idx} className="flex items-center gap-2">
                        <div className="w-36 shrink-0">
                            <DropdownSelect
                                value={cond.fld}
                                onChange={(fld) => {
                                    const next = fieldOf(fld);
                                    updateRow(idx, { fld, op: next.allowedOps[0], vals: [] });
                                }}
                                options={fields.map(f => ({ value: f.code, label: f.label }))}
                            />
                        </div>
                        <div className="w-32 shrink-0">
                            <DropdownSelect
                                value={cond.op}
                                onChange={(op) => updateRow(idx, { op, vals: [] })}
                                options={(field?.allowedOps ?? []).map(op => ({ value: op, label: OP_LABELS[op] ?? op }))}
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <ValueInput field={field} op={cond.op} vals={cond.vals ?? []}
                                        onChange={(vals) => updateRow(idx, { vals })} />
                        </div>
                        <button onClick={() => removeRow(idx)}
                                className="p-1.5 text-slate-300 hover:text-rose-500 shrink-0" title="조건 삭제">
                            <Trash2 size={14} />
                        </button>
                    </div>
                );
            })}
            <button onClick={addRow} disabled={fields.length === 0}
                    className="self-start flex items-center gap-1 px-2 py-1 text-[12px] font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:text-slate-300">
                <Plus size={13} /> 조건
            </button>
        </div>
    );
}

/** 연산자·필드 성격에 따른 값 입력 위젯 */
function ValueInput({ field, op, vals, onChange }) {
    const options = useOptions(field?.optionSource);
    const multi = op === 'IN' || op === 'NOT_IN';

    // 코드 선택 + 다중 → 칩 토글
    if (field?.optionSource && multi) {
        const toggle = (v) => onChange(vals.includes(v) ? vals.filter(x => x !== v) : [...vals, v]);
        return (
            <div className="flex flex-wrap gap-1.5 py-1">
                {options.map(o => (
                    <button key={o.value} onClick={() => toggle(o.value)}
                            className={`px-2 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                                vals.includes(o.value)
                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                    : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'
                            }`}>
                        {o.label}
                    </button>
                ))}
                {options.length === 0 && <span className="text-xs text-slate-400">선택지 없음</span>}
            </div>
        );
    }

    // 코드 선택 + 단일 → 드롭다운
    if (field?.optionSource) {
        return (
            <DropdownSelect
                value={vals[0] ?? ''}
                onChange={(v) => onChange([v])}
                options={options.map(o => ({ value: o.value, label: `${o.label} (${o.value})` }))}
                placeholder="값 선택"
            />
        );
    }

    // 직접입력 + BETWEEN → 두 칸
    if (op === 'BETWEEN') {
        return (
            <div className="flex items-center gap-2">
                <input type="text" value={vals[0] ?? ''} onChange={(e) => onChange([e.target.value, vals[1] ?? ''])}
                       className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
                <span className="text-slate-400 shrink-0">~</span>
                <input type="text" value={vals[1] ?? ''} onChange={(e) => onChange([vals[0] ?? '', e.target.value])}
                       className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            </div>
        );
    }

    // 직접입력 + 다중 → 쉼표 구분
    if (multi) {
        return (
            <input type="text" value={vals.join(',')}
                   onChange={(e) => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                   placeholder="값1, 값2, …"
                   className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
        );
    }

    // 직접입력 + 단일
    return (
        <input type="text" value={vals[0] ?? ''} onChange={(e) => onChange([e.target.value])}
               placeholder={op === 'LIKE' ? '포함할 문자' : '값'}
               className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
    );
}
