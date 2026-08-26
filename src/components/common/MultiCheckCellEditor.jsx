import { useEffect, useRef, useState } from 'react';

/**
 * 여러 개를 고르는 그리드 셀 편집기 (값은 코드 배열).
 *
 * {@link SelectCellEditor}는 하나만 고르는 자리라 네이티브 select를 쓰지만, 여기는 항목마다
 * 켜고 끄는 동작이라 체크박스 목록이 맞다. 셀 밖으로 포커스가 나갈 때만 닫는다 —
 * 항목을 하나 고를 때마다 닫히면 여러 개를 고를 수가 없다.
 *
 * cellEditorParams: { values: string[], labelMap?: Record<string,string> }
 */
export default function MultiCheckCellEditor({
    value,
    values = [],
    labelMap,
    onValueChange,
    stopEditing,
}) {
    const [selected, setSelected] = useState(() => (Array.isArray(value) ? [...value] : []));
    const ref = useRef(null);

    useEffect(() => { ref.current?.focus(); }, []);

    const toggle = (code) => {
        const next = selected.includes(code)
            ? selected.filter((c) => c !== code)
            : [...selected, code];
        setSelected(next);
        onValueChange(next);
    };

    return (
        <div
            ref={ref}
            tabIndex={-1}
            className="bg-white border border-slate-300 rounded-md shadow-lg py-1 outline-none min-w-[160px]"
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) stopEditing();
            }}
            onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') stopEditing(); }}
        >
            {values.map((code) => (
                <label
                    key={code}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer"
                >
                    <input
                        type="checkbox"
                        checked={selected.includes(code)}
                        onChange={() => toggle(code)}
                    />
                    <span>{labelMap?.[code] ?? code}</span>
                </label>
            ))}
        </div>
    );
}
