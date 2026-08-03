/**
 * 그리드 편집 행 상태 (C 신규 / U 수정 / D 삭제).
 *
 * 마스터 7개 화면에 같은 내용이 복사돼 있었고, 그중 3곳은 컴포넌트 안쪽 지역 상수였다.
 * 값 자체는 서버가 아니라 화면이 만드는 것이라(`_status` 필드) 공통코드가 아닌 상수다.
 */
export const ROW_STATUS_META = {
    C: { label: '신규', cls: 'text-blue-500' },
    U: { label: '수정', cls: 'text-amber-500' },
    D: { label: '삭제', cls: 'text-red-500' },
};

/** 삭제(D) 표시된 행은 편집을 막는다 — ag-grid의 editable 콜백에 그대로 넘긴다 */
export const notDeleted = (p) => p.data._status !== 'D';

/** 삭제 표시 행에 취소선 + 흐리게 — ag-grid의 rowClassRules에 그대로 넘긴다 */
export const DELETED_ROW_CLASS_RULES = {
    'line-through': (p) => p.data._status === 'D',
    'opacity-40': (p) => p.data._status === 'D',
};
