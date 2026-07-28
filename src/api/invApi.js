// 현재고 조회 API (wms-backend 연동)
import api from '@/utils/axios';

export const invApi = {
    /** 현재고 조회. cond: { prodCd, prodNm, locCd, lotNo, tmpZon, locTyp } — 빈 값 조건은 빼고 보낸다. */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inventory/stock', { params });
    },
};