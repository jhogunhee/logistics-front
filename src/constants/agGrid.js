/**
 * 모든 그리드의 전역 기본값. main.jsx가 provideGlobalGridOptions로 한 번 등록한다.
 *
 * 화면마다 <AgGridReact>에 붙이지 않는 이유는 22개 그리드에 같은 설정을 복사하게 되고,
 * 하나씩 빠뜨리면 그 그리드만 영어로 뜨기 때문이다. 개별 화면이 필요하면 prop으로 덮어쓴다.
 */

/**
 * AG Grid 기본 문구는 영어다 — 한글 화면 한가운데에 "No Rows To Show"가 뜬다.
 * 이 버전의 ag-grid-community는 `/locale` 서브패스를 내보내지 않아 직접 정의한다.
 * 실제로 화면에 나오는 것만 담는다 (Community 모듈 + 필터/페이지네이션 미사용).
 */
export const AG_GRID_LOCALE_KO = {
    noRowsToShow: '조회된 데이터가 없습니다',
    loadingOoo: '불러오는 중…',

    // 컬럼 메뉴·정렬 (헤더 우클릭·클릭 시)
    sortAscending: '오름차순 정렬',
    sortDescending: '내림차순 정렬',
    sortUnSort: '정렬 해제',
    pinColumn: '열 고정',
    pinLeft: '왼쪽 고정',
    pinRight: '오른쪽 고정',
    noPin: '고정 해제',
    autosizeThiscolumn: '이 열 너비 맞춤',
    autosizeAllColumns: '모든 열 너비 맞춤',
    resetColumns: '열 초기화',

    // 선택·복사
    copy: '복사',
    copyWithHeaders: '머리글 포함 복사',
    ctrlC: 'Ctrl+C',
    paste: '붙여넣기',
    ctrlV: 'Ctrl+V',
};

/**
 * 상품 이미지 컬럼의 셀 스타일. **`padding: 0`이 핵심이다.**
 *
 * ag-grid 기본 셀 패딩이 좌우 15px이라 50px 컬럼의 내부 폭이 18px밖에 안 남는데,
 * Tailwind 기본 스타일의 `img { max-width: 100% }`가 썸네일을 그 폭에 강제로 맞춘다.
 * 그러면 `size`를 아무리 키워도 가로만 18px로 눌리고(높이는 지정값 그대로),
 * `object-cover`가 그 비율에 맞춰 그림의 좌우를 잘라낸다 — 크기를 바꿔도 화면이
 * 그대로인 것처럼 보이고, 가로로 넓은 그림은 잘려 보인다. 둘 다 같은 원인이다.
 */
export const THUMB_CELL_STYLE = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
};
