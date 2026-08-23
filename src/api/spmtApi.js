// 정기 보충 API (wms-backend 연동) — 대상 산정(미리보기)과 지시 발행.
// 발행된 지시의 목록·확정·취소는 이동지시(invMovApi) 그대로다.
import api from '@/utils/axios';

export const spmtApi = {
    /**
     * 보충 대상 조회 — 현재고+미완료 유입이 min 미달인 고정로케이션과 FEFO 추천 배정.
     * cond: { zonCd, prodCd, prodNm, locCd }. 저장하지 않는다 (추천 ≠ 예약 — 발행 시 서버가 재검증).
     */
    targets(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inventory/spmt/targets', { params });
    },

    /**
     * 보충지시 일괄 발행. items: [{ invId, toLocId, qty }] — SPMT 이동지시 생성 + 원천 재고 예약.
     * 전체가 한 트랜잭션이라 한 건이라도 검증에 걸리면 전량 롤백된다. 반환은 지시번호 목록(SP-...).
     */
    issue(items) {
        return api.post('/inventory/spmt', { items });
    },
};
