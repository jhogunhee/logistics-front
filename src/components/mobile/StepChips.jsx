import { CheckCircle2 } from 'lucide-react';

/**
 * PDA 단계 칩 줄 — 지난 단계는 체크, 현재 단계는 채움, 남은 단계는 테두리만.
 * steps: [{ key, label }], current: 현재 단계 key.
 */
export const StepChips = ({ steps, current }) => {
    const idx = steps.findIndex(s => s.key === current);
    return (
        <div className="flex gap-1 shrink-0">
            {steps.map((s, i) => (
                <span key={s.key}
                      className={`flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold
                          ${i === idx ? 'bg-indigo-600 text-white'
                              : i < idx ? 'bg-indigo-50 text-indigo-600'
                                  : 'bg-white text-slate-400 border border-slate-200'}`}>
                    {i < idx && <CheckCircle2 size={13} />}
                    {s.label}
                </span>
            ))}
        </div>
    );
};
