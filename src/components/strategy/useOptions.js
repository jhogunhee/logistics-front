import { useEffect, useState } from 'react';
import { strategyApi } from '@/api/strategyApi';

// optionSource별 선택지 캐시 (세션 단위 — 기준정보라 편집 중 바뀔 일이 거의 없다)
const cache = new Map();

// 조건 필드 메타 캐시 (도메인 단위 — 배포본이 바뀌기 전엔 고정이다)
const fieldCache = new Map();

/** 조건 필드 메타 로딩 훅. [{ code, label, allowedOps, optionSource }] */
export function useFields(domain) {
    const [, force] = useState(0);

    useEffect(() => {
        if (!domain || fieldCache.has(domain)) return;
        let ignore = false;
        strategyApi.meta.fields(domain).then(data => {
            fieldCache.set(domain, data);
            if (!ignore) force(n => n + 1);
        });
        return () => { ignore = true; };
    }, [domain]);

    return (domain && fieldCache.get(domain)) || [];
}

/** 동적 선택지 로딩 훅. source가 없으면(직접입력 필드) 빈 배열 */
export function useOptions(source) {
    // 값은 캐시에서 렌더 중에 읽고, 없을 때만 비동기 로드 후 리렌더를 트리거한다
    const [, force] = useState(0);

    useEffect(() => {
        if (!source || cache.has(source)) return;
        let ignore = false;
        strategyApi.meta.options(source).then(data => {
            cache.set(source, data);
            if (!ignore) force(n => n + 1);
        });
        return () => { ignore = true; };
    }, [source]);

    return (source && cache.get(source)) || [];
}
