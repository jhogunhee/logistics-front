// 출고 웨이브 API (wms-backend 연동) — 편성(수동) + 전략 실행
import api from '@/utils/axios';

export const outbWaveApi = {
    /** 웨이브 목록. cond: { wavNo, status } */
    list(cond = {}) {
        const params = Object.fromEntries(
            Object.entries(cond).filter(([, v]) => v !== '' && v != null)
        );
        return api.get('/outbound/waves', { params });
    },

    /** 빈 웨이브 생성. orderIds를 함께 주면 생성과 동시에 편성한다 (선택) */
    create(orderIds = []) {
        return api.post('/outbound/waves', { orderIds });
    },

    /** 주문 담기 (수동 편성). 편입 출처는 서버가 MANUAL로 남긴다 */
    addOrders(wavId, orderIds) {
        return api.post(`/outbound/waves/${wavId}/orders`, { orderIds });
    },

    /**
     * 편성 해제 (다건, 한 트랜잭션). 주문은 지워지지 않고 미편성으로 돌아간다.
     * DELETE가 아닌 이유는 주문 삭제가 아니라 상태 변경이기 때문이다.
     */
    unassignOrders(wavId, orderIds) {
        return api.post(`/outbound/waves/${wavId}/orders/unassign`, { orderIds });
    },

    /** 웨이브 해체 — 소속 주문을 전부 미편성으로 되돌리고 웨이브 행을 지운다 (PLANNED만) */
    disband(wavId) {
        return api.delete(`/outbound/waves/${wavId}`);
    },

    /**
     * 웨이브 전략 실행. payload: { wavStgyId?, expctDe } — 대상 출고예정일 하루 필수
     * wavStgyId를 주면 그 전략만(선택실행), 비우면 전 전략을 우선순위 순으로(자동실행).
     * 편입 0건인 전략은 웨이브를 만들지 않으므로 재실행해도 빈 웨이브가 쌓이지 않는다.
     */
    stgyExec(payload) {
        return api.post('/outbound/waves/stgy-exec', payload);
    },
};
