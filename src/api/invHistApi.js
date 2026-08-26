// 재고이력 API (wms-backend 연동)
import api from '@/utils/axios';

export const invHistApi = {
    /**
     * 재고이력 조회 (서버 페이징). cond: { prodCd, prodNm, locCd, txTyp, rfnDocNo, dateFrom, dateTo } — 빈 값 조건은 빼고 보낸다.
     * page: { page(1부터), size }. 응답은 { rows, totCnt, page, size } — 원장이라 전량 조회를 두지 않는다.
     * page/size는 빈 값 제거 뒤에 따로 붙인다 — cond에 섞으면 습관적으로 넘긴 0이 조용히 사라진다.
     */
    list(cond = {}, page = { page: 1, size: 100 }) {
        const params = { ...Object.fromEntries(Object.entries(cond).filter(([, v]) => v)), page: page.page, size: page.size };
        return api.get('/inventory/history', { params });
    },
};
