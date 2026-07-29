import { useEffect, useRef } from 'react';

/**
 * 네이티브 <select> 기반 그리드 셀 편집기.
 *
 * ag-grid 기본 `agSelectCellEditor`를 쓰지 않는 이유 — 그 드롭다운은 열릴 때 좌표가 정해지고
 * 이후 스크롤을 따라오지 않는다. 목록이 길어 아래쪽 항목을 고르려고 휠을 굴리면 그 스크롤이
 * 그리드 본문으로 새면서 목록만 제자리에 떠 셀과 분리돼 보인다.
 * 브라우저가 그리는 목록은 위치·스크롤·키보드 조작을 OS가 처리해 그 문제가 없다.
 *
 * cellEditorParams: { values: string[], labelMap?: Record<string,string>, placeholder?: string }
 * labelMap이 있으면 "코드 이름"으로 보여준다 (예: "BOX 박스"). 저장되는 값은 언제나 코드다.
 */
export default function SelectCellEditor({
    value,
    values = [],
    labelMap,
    placeholder = '선택',
    onValueChange,
    stopEditing,
}) {
    const ref = useRef(null);

    // 셀을 열자마자 목록을 펼칠 수 있도록 포커스를 준다
    useEffect(() => { ref.current?.focus(); }, []);

    return (
        <select
            ref={ref}
            className="w-full h-full px-2 bg-white text-sm border-0 outline-none"
            value={value ?? ''}
            onChange={(e) => {
                onValueChange(e.target.value);
                stopEditing();
            }}
            onBlur={() => stopEditing()}
        >
            {/* 아직 안 고른 행에서만 빈 항목을 보여준다 — 고르고 나면 되돌릴 값이 아니다 */}
            {(value == null || value === '') && <option value="">{placeholder}</option>}
            {values.map(v => (
                <option key={v} value={v}>
                    {labelMap?.[v] ? `${v} ${labelMap[v]}` : v}
                </option>
            ))}
        </select>
    );
}
