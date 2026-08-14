import { useRef, useState } from 'react';
import DatePicker from './DatePicker';

/**
 * 공용 DatePicker를 얹은 그리드 셀 편집기. ag-grid 기본 `agDateStringCellEditor`를 대신한다
 * (그건 `<input type="date">`라 브라우저 기본 달력이 뜬다).
 *
 * 형제인 SelectCellEditor는 일부러 네이티브 `<select>`를 쓰는데, ag-grid 팝업이 그리드
 * 스크롤을 따라오지 않아 목록만 허공에 떠 보였기 때문이다. 달력도 같은 함정에 놓이지만
 * 여기서는 DatePicker가 포털 + 스크롤 시 닫기로 처리한다 — 목록과 달리 달력은 한 번 눌러
 * 끝나는 조작이라 "스크롤하면 닫힌다"가 허용되는 대신, 좌표가 어긋난 채 남는 일이 없다.
 *
 * 편집이 끝나는 지점이 둘이다:
 *   - 달력에서 날짜를 고르거나 「지우기」 → onCommit (즉시 종료)
 *   - 손으로 8자리를 치고 Tab/클릭으로 셀을 벗어남 → onBlur (값 확정 후 종료)
 *
 * cellEditorParams: { min?: 'YYYY-MM-DD', max?: 'YYYY-MM-DD' }
 */
export default function DateCellEditor({
    value,
    min,
    max,
    onValueChange,
    stopEditing,
}) {
    const [draft, setDraft] = useState(value ?? '');
    // 달력 클릭으로 이미 끝냈는데 blur가 한 번 더 종료를 부르는 것을 막는다
    const doneRef = useRef(false);

    const apply = (v) => {
        setDraft(v);
        onValueChange(v);
    };

    return (
        <div
            className="w-full h-full"
            onBlur={() => {
                // DatePicker 내부(입력 ↔ 달력 버튼) 이동에도 blur가 뜬다.
                // 다음 틱에 포커스가 정말 밖으로 갔는지 보고 나서 끝낸다.
                setTimeout(() => {
                    if (doneRef.current) return;
                    stopEditing();
                }, 0);
            }}
        >
            <DatePicker
                value={draft}
                onChange={apply}
                // 타이핑 한 글자마다 ag-grid에 알린다. ag-grid 타입 정의가 onValueChange를
                // 「값이 바뀔 때마다」 부르라고 못박고 있고, getValue()가 그렇게 쌓인 값을 돌려준다.
                // 확정 때만 부르면, Enter를 ag-grid가 먼저 받아 편집을 끝내는 순간 옛 값이 저장된다.
                //
                // null은 「아직 날짜가 아니다」라서 흘려보내지 않는다. draft(=DatePicker의 value)도
                // 건드리지 않는다 — 되돌려 넣으면 입력창이 정규화된 값으로 덮여 타이핑과 싸운다.
                onDraftChange={(v) => { if (v !== null) onValueChange(v); }}
                onCommit={(v) => {
                    doneRef.current = true;
                    apply(v);
                    stopEditing();
                }}
                min={min}
                max={max}
                variant="bare"
                placeholder=""
                autoFocus
                autoOpen
            />
        </div>
    );
}
