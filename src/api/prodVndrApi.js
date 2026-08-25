// 상품 거래처 마스터 API (자동발주 기준값 — wms-backend 연동)
import api from '@/utils/axios';

export const prodVndrApi = {
    /** 목록 조회. cond: { prodCd, prodNm, vndrCd } — 빈 값 조건은 빼고 보낸다 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/master/prod-vndrs', { params });
    },

    /** 신규(C)/수정(U)/삭제(D) 행 일괄 저장. 짝 중복(상품×거래처) 검증은 서버에서 한다 */
    saveAll(rows) {
        return api.post('/master/prod-vndrs/bulk', rows);
    },
};
