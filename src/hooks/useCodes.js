/**
 * 공통코드 그룹 하나를 화면이 쓰는 여러 모습으로 함께 돌려준다 — 화면마다 codeCd 배열·
 * 라벨맵·옵션 배열을 따로 만들던 것을 모은 것이다.
 */
import { useEffect, useState } from 'react';

import { codeApi } from '@/api/codeApi';
import { toSearchOptions } from '@/constants/codeOptions';

const toCodeSet = (codes) => {
    const nmByCd = Object.fromEntries(codes.map(c => [c.codeCd, c.codeNm]));
    return {
        codes,
        nmByCd,
        // 못 받았거나 지워진 코드는 코드 자체를 보여준다 — 화면이 빈칸이 되지 않게
        nm: (cd) => nmByCd[cd] ?? cd,
        values: codes.map(c => c.codeCd),
        selectOptions: codes.map(c => ({ value: c.codeCd, label: c.codeNm })),
        searchOptions: toSearchOptions(codes), // selectOptions 앞에 '전체'를 붙인 것
    };
};

// 로딩 중에도 같은 모양이어야 소비처가 분기 없이 쓴다.
const EMPTY = toCodeSet([]);

/** grpCd가 falsy면 조회하지 않고 빈 코드셋을 준다 (그룹이 상태에서 오는 화면 대응) */
export function useCodes(grpCd) {
    // state는 { 그룹코드, 변환된 코드셋 }.
    // 코드셋을 담아 참조가 고정되고(memo 불필요), 그룹코드를 담아 늦은 응답이 걸러진다(정리 함수 불필요).
    const [loaded, setLoaded] = useState(null);

    useEffect(() => {
        if (!grpCd) return;
        // 조회 실패는 axios 인터셉터가 토스트로 알린다 — 여기서는 빈 코드셋을 유지한다
        codeApi.list(grpCd)
            .then(d => setLoaded({ grpCd, codeSet: toCodeSet(d) }))
            .catch(() => {});
    }, [grpCd]);

    return loaded && loaded.grpCd === grpCd ? loaded.codeSet : EMPTY;
}
