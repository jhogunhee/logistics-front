import { useSyncExternalStore } from 'react';

/** CSS 미디어쿼리 일치 여부 — 창 크기가 바뀌면 따라 바뀐다 */
export const useMediaQuery = (query) => useSyncExternalStore(
    (onChange) => {
        const mql = window.matchMedia(query);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
);
