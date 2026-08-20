// 고정 로케이션 마스터 API (wms-backend 연동)
import api from '@/utils/axios';

export const fxngLocApi = {
    /** 목록 조회. cond: { prodCd, locCd, zonCd } — 빈 값 조건은 빼고 보낸다 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/master/fxng-locs', { params });
    },

    /** 신규(C)/수정(U)/삭제(D) 행 일괄 저장. 로케이션 전용(중복) 검증은 서버에서 한다 */
    saveAll(rows) {
        return api.post('/master/fxng-locs/bulk', rows);
    },
};
