// 존 마스터 API (wms-backend 연동). 존은 로케이션의 상위 그룹이다.
import api from '@/utils/axios';

export const zonApi = {
    /** 목록 조회. cond: { zonCd, tmpZon, bizDvsn } — 빈 값 조건은 빼고 보낸다 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/master/zons', { params });
    },

    /** 신규(C)/수정(U)/삭제(D) 행 일괄 저장. 코드 중복·하위 로케이션 검증은 서버에서 한다 */
    saveAll(rows) {
        return api.post('/master/zons/bulk', rows);
    },
};
