import { useCallback, useState } from 'react';

/**
 * 서버 페이징 상태 — 페이지 번호(1부터)와 페이지 크기.
 * 검색조건(cond)과 따로 두는 이유: 조건을 바꿔 조회하면 1페이지로 돌아가야 하는데, cond 안에 두면
 * SearchBar가 조건 하나 바꿀 때마다 page를 같이 만져야 한다. 크기는 화면이 정하고 사용자가 바꾸지 않는다.
 */
export function usePage(size = 100) {
    const [page, setPage] = useState(1);
    const reset = useCallback(() => setPage(1), []);
    return { page, size, setPage, reset };
}
