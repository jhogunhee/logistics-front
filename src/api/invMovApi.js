// 재고 이동지시 API (wms-backend 연동) — 2단계: 지시(예약) → 확정(실물 MOVE)
import api from '@/utils/axios';

export const invMovApi = {
    /**
     * 이동지시 등록 (예약). items: [{ invId, toLocId, qty }] — 전체가 한 트랜잭션이라
     * 한 건이라도 검증에 걸리면 전량 롤백된다. 발급된 이동지시 번호 목록을 돌려받는다.
     */
    register(items) {
        return api.post('/inventory/moves', { items });
    },

    /** 지시 목록 조회. cond: { invMovNo, prodCd, prodNm, fromLocCd, toLocCd, status } — 빈 값 조건은 빼고 보낸다 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inventory/moves', { params });
    },

    /** 이동확정 (부분확정 허용 — 잔여수량 이내) */
    confirm(id, qty) {
        return api.post(`/inventory/moves/${id}/confirm`, { qty });
    },

    /** 이동취소 (잔량 예약 해제 — 실적 없으면 CANCELLED, 부분확정 후면 지시수량 차감 후 DONE) */
    cancel(id) {
        return api.post(`/inventory/moves/${id}/cancel`);
    },
};
