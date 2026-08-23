// 출고확정 API (wms-backend 연동)
//
// 피킹이 끝난 주문을 닫고 SHIP-STAGE의 실물·예약을 함께 소진한다(tx SHIP, 1행) — 재고가 창고 밖으로
// 나가는 유일한 지점이다. 주문이 SHIPPED가 되고, 웨이브의 주문이 전부 닫히면 웨이브도 CLOSED로 종료된다.
// 실적은 따로 쌓지 않는다 — 주문의 shmt_dt + 재고이력(SHIP)이 곧 출고실적이다.
import api from '@/utils/axios';

const params = (cond = {}) => Object.fromEntries(
    Object.entries(cond).filter(([, v]) => v !== '' && v != null)
);

export const outbShmtApi = {
    /**
     * 출고확정 화면의 웨이브 목록 — 지시발행(ISSUED) 웨이브만. 편성중은 집품 전이고 종료는 끝났다.
     * 주문 상태별 건수(확정대상 · 작업중 · 확정완료)를 함께 내려준다.
     *
     * cond: { wavNo, outbNo, storeId, expctDeFrom, expctDeTo }
     *       (storeNm은 화면 표시용 — 같이 실려가지만 서버가 무시한다)
     * ⚠ 주문 쪽 조건은 할당 화면과 같은 EXISTS — 어느 웨이브를 보여줄지만 정하고 건수는 웨이브 전체다.
     */
    waves(cond = {}) {
        return api.get('/outbound/shipping/waves', { params: params(cond) });
    },

    /** 웨이브의 주문 목록 — 상태 · 주문/할당/피킹/결품 수량 · 확정 가능 여부(shippable) */
    orders(wavId) {
        return api.get(`/outbound/shipping/waves/${wavId}/orders`);
    },

    /**
     * 출고확정 — 주문 단위, 한 트랜잭션(한 건이라도 걸리면 전량 롤백).
     * 통과하는 상태는 둘이다: 피킹완료(정상 — SHIP-STAGE에서 집품분 반출)와
     * 신규(할당 0건 — 전량 미출고 확정, 재고 처리 없음). 할당·피킹중은 「출고작업중」이라 거부된다.
     * 되돌릴 수 없다 — 출고확정 취소는 지원하지 않는다.
     */
    confirm(outbOrderIds) {
        return api.post('/outbound/shipping/confirm', { outbOrderIds });
    },
};
