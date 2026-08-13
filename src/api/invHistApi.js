// 재고이력 API (wms-backend 연동)
import api from '@/utils/axios';

export const invHistApi = {
    /** 재고이력 조회. cond: { prodCd, prodNm, locCd, txTyp, rfnDocNo, dateFrom, dateTo } — 빈 값 조건은 빼고 보낸다. */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inventory/history', { params });
    },
};
