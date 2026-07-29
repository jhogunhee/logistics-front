// 공통코드 API. code_detail에서 그룹 단위로 조회한다.
import api from '@/utils/axios';

export const codeApi = {
    /** 그룹 목록. 응답: [{ grpCd, grpNm, description }] (grpCd 순).
     *  그룹 자체는 조회만 한다 — 스키마와 함께 결정되는 값이라 화면에서 늘리지 않는다 */
    groups() {
        return api.get('/master/codes/groups');
    },

    /** 그룹의 코드 목록. 응답: [{ codeCd, codeNm, srtSeq }] (srtSeq 순). 화면 콤보박스가 쓴다 */
    list(grpCd) {
        return api.get(`/master/codes/${grpCd}`);
    },

    /** 그룹 일괄 저장. 그룹코드는 신규 행에서만, 삭제는 하위 코드가 없을 때만 (서버가 판정) */
    saveGroups(rows) {
        return api.post('/master/codes/groups/bulk', rows);
    },

    /** 관리 화면용 검색 (코드/코드명 부분일치). cond: { codeCd, codeNm } */
    search(grpCd, cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get(`/master/codes/${grpCd}/search`, { params });
    },

    /** 신규(C)/수정(U)/삭제(D) 행 일괄 저장. 코드 중복·하위 참조 검증은 서버에서 한다 */
    saveAll(grpCd, rows) {
        return api.post(`/master/codes/${grpCd}/bulk`, rows);
    },
};

/** 코드 목록 → 검색 콤보 옵션 ('전체' 포함) */
export const toSearchOptions = (codes) => [
    { value: '', label: '전체' },
    ...codes.map(c => ({ value: c.codeCd, label: c.codeNm })),
];
