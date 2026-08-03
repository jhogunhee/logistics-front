import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import DropdownSelect from '@/components/common/DropdownSelect';
import SortableList from './SortableList';

/**
 * 정렬 기준 목록([{ field, dir }]) 편집기 — 앞 기준이 같을 때 다음 기준으로 비교한다.
 * 기준 목록은 메타 API(sort-fields)에서만 온다 — 하드코딩 금지 (P1).
 *
 * props:
 *   fields    메타 API 응답 [{ value, label }]
 *   value     기준 배열
 *   onChange  (next) => void
 *   emptyHint 기준 0건일 때 안내 문구 (미설정 시 기본 정렬을 알려주는 자리)
 */
export default function SortCriteriaEditor({ fields, value = [], onChange, emptyHint }) {
    const labelOf = (code) => fields.find(f => f.value === code)?.label ?? code;
    const used = value.map(c => c.field);

    const addRow = () => {
        // 이미 쓴 기준은 서버가 중복으로 거부한다 — 남은 것 중 첫 번째를 고른다
        const next = fields.find(f => !used.includes(f.value));
        if (!next) return;
        onChange([...value, { field: next.value, dir: 'ASC' }]);
    };

    const updateRow = (idx, patch) => {
        onChange(value.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
    };

    const removeRow = (idx) => onChange(value.filter((_, i) => i !== idx));

    const allUsed = fields.length > 0 && used.length >= fields.length;

    return (
        <div className="flex flex-col gap-2">
            {value.length === 0 && emptyHint && (
                <span className="text-xs text-slate-400">{emptyHint}</span>
            )}

            <SortableList
                items={value}
                onReorder={onChange}
                className="flex flex-col gap-2"
                renderItem={(crit, idx, { handle }) => (
                    <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                        {handle}
                        <span className="w-5 text-[11px] font-bold text-slate-400 text-center">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                            <DropdownSelect
                                value={crit.field}
                                onChange={(field) => updateRow(idx, { field })}
                                options={fields
                                    .filter(f => f.value === crit.field || !used.includes(f.value))
                                    .map(f => ({ value: f.value, label: f.label }))}
                            />
                        </div>
                        <button
                            onClick={() => updateRow(idx, { dir: crit.dir === 'ASC' ? 'DESC' : 'ASC' })}
                            title={crit.dir === 'ASC' ? '오름차순 — 작은 값부터' : '내림차순 — 큰 값부터'}
                            className="flex items-center gap-1 px-2 py-1 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-50 shrink-0">
                            {crit.dir === 'ASC' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                            {crit.dir === 'ASC' ? '오름차순' : '내림차순'}
                        </button>
                        <button onClick={() => removeRow(idx)} title={`${labelOf(crit.field)} 기준 삭제`}
                                className="p-1 text-slate-300 hover:text-rose-500 shrink-0">
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            />

            <button onClick={addRow} disabled={allUsed}
                    title={allUsed ? '모든 기준을 이미 사용했습니다' : undefined}
                    className={`self-start flex items-center gap-1 px-2.5 py-1 border rounded-lg text-[11px] font-bold ${
                        allUsed
                            ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                            : 'border-indigo-200 text-indigo-600 hover:bg-indigo-50'
                    }`}>
                <Plus size={12} /> 정렬 기준
            </button>
        </div>
    );
}
