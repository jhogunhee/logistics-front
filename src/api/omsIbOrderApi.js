// 입고주문(OMS) API — wms-backend의 com.project.omsback 연동
import api from '@/utils/axios';

export const omsIbOrderApi = {
    /** 목록 조회. cond: { omsIbNo, vndrNm, status, dateFrom, dateTo } — 빈 값 조건은 빼고 보낸다.
     *  확정된 주문은 생성된 ASN 정보(ibOrderId/ibNo/ibStatus)가 함께 내려온다. */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/oms/inbound-orders', { params });
    },

    /** 단건 조회. 응답 형태는 목록 한 건과 같다 (ASN 정보 포함) */
    get(omsIbOrderId) {
        return api.get(`/oms/inbound-orders/${omsIbOrderId}`);
    },

    /** 특정 주문의 라인 목록 */
    lines(omsIbOrderId) {
        return api.get(`/oms/inbound-orders/${omsIbOrderId}/lines`);
    },

    /** 등록. payload: { vendorId, expctDe, lines: [{ prodId, odrQty }] }. 주문번호는 서버 채번(PO-).
     *  벤더는 이름이 아니라 마스터 ID로 보낸다 — 응답에는 vndrCd/vndrNm이 조인돼 내려온다. */
    create(payload) {
        return api.post('/oms/inbound-orders', payload);
    },

    /** 수정. payload는 create와 동일하다. 작성(CREATED) 상태만 가능 —
     *  확정된 주문은 서버가 거부한다(이미 나간 ASN 예정수량과 어긋나므로 확정취소가 먼저).
     *  주문번호는 바뀌지 않는다. 예정일을 고쳐도 채번 시점의 번호를 그대로 쓴다 */
    update(omsIbOrderId, payload) {
        return api.put(`/oms/inbound-orders/${omsIbOrderId}`, payload);
    },

    /** 확정 → WMS 입고예정(ASN) 생성. 반환값은 생성된 ASN의 ibOrderId.
     *  작성(CREATED) 상태만 가능 — 재확정은 서버가 거부한다(ASN 중복 생성 방지) */
    confirm(omsIbOrderId) {
        return api.post(`/oms/inbound-orders/${omsIbOrderId}/confirm`);
    },

    /** 확정취소 → ASN을 취소하고 주문을 작성 상태로 원복한다 (고쳐서 다시 확정 가능).
     *  검수가 시작된 ASN이면 서버가 거부한다. ASN 취소 경로는 이것 하나뿐 */
    cancelConfirm(omsIbOrderId) {
        return api.post(`/oms/inbound-orders/${omsIbOrderId}/confirm-cancel`);
    },

    /** 삭제. 확정 전(CREATED)만 가능 — 확정된 주문은 확정취소가 먼저다.
     *  취소 상태를 두지 않으므로 "없앤다"는 조작은 이것 하나뿐이다 */
    remove(omsIbOrderId) {
        return api.delete(`/oms/inbound-orders/${omsIbOrderId}`);
    },
};
