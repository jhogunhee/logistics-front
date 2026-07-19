// 공통코드 API. code_detail에서 그룹 단위로 조회한다.
import api from '@/utils/axios';

export const codeApi = {
    /** 그룹의 사용중(Y) 코드 목록. 응답: [{ codeCd, codeNm, sortOrd }] (sortOrd 순) */
    list(groupCd) {
        return api.get(`/master/codes/${groupCd}`);
    },
};

/** 코드 목록 → 검색 콤보 옵션 ('전체' 포함) */
export const toSearchOptions = (codes) => [
    { value: '', label: '전체' },
    ...codes.map(c => ({ value: c.codeCd, label: c.codeNm })),
];
