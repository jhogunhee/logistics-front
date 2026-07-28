// 적치 API (wms-backend 연동)
import api from '@/utils/axios';

export const putawayApi = {
    /** 적치 대상(검수는 됐지만 아직 전량 적치되지 않은) (라인, Lot) 배치 전체. cond: { ibNo, dateFrom, dateTo, prodCd, prodNm } */
    lines(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inbound/putaway/lines', { params });
    },

    /** 대상 로케이션 후보 (상품 온도대와 일치하는 STORAGE, pick_prty 오름차순 추천) */
    candidateLocs(ibLineId) {
        return api.get(`/inbound/putaway/lines/${ibLineId}/candidate-locs`);
    },

    /** 적치 실행. payload: { lotId, qty, targetLocId }. 목록에서 고른 배치(Lot) 그대로 이동 */
    putaway(ibLineId, payload) {
        return api.post(`/inbound/putaway/lines/${ibLineId}`, payload);
    },
};