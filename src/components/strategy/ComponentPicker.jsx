import { X } from 'lucide-react';

/**
 * 레지스트리 구성요소 선택 모달. 목록은 메타 API Descriptor에서만 온다 (P1) —
 * deprecated는 신규 선택 목록에서 숨긴다.
 *
 * props:
 *   open           표시 여부
 *   title          모달 제목 (예: "규칙 추가")
 *   descriptors    [{ code, name, description, deprecated, params }]
 *   disabledCodes  선택 불가 code 목록 (이미 등록된 규칙 등)
 *   onSelect       (descriptor) => void
 *   onClose        () => void
 */
export default function ComponentPicker({ open, title, descriptors = [], disabledCodes = [], onSelect, onClose }) {
    if (!open) return null;

    const selectable = descriptors.filter(d => !d.deprecated);

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-[480px] flex flex-col gap-4"
                 onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-800">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
                    {selectable.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-6">선택할 수 있는 항목이 없습니다.</p>
                    )}
                    {selectable.map(d => {
                        const disabled = disabledCodes.includes(d.code);
                        return (
                            <button key={d.code} disabled={disabled}
                                    onClick={() => { onSelect(d); onClose(); }}
                                    className={`text-left px-4 py-3 border rounded-xl transition-colors ${
                                        disabled
                                            ? 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-50'
                                            : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50'
                                    }`}>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-slate-700">{d.name}</span>
                                    <span className="text-[11px] text-slate-400 font-mono">{d.code}</span>
                                    {disabled && <span className="text-[11px] text-slate-400">이미 등록됨</span>}
                                </div>
                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{d.description}</p>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
