// 출고주문(OMS) API — wms-backend의 com.project.omsback.outbound 연동
import api from '@/utils/axios';

export const omsOutbOrderApi = {
    /** 목록 조회. cond: { omsOutbNo, storeNm, status, outbTyp, vhclFltno, dateFrom, dateTo } —
     *  빈 값 조건은 빼고 보낸다. 기간은 출고예정일 기준이다.
     *  확정된 주문은 생성된 WMS 출고주문 정보(outbOrderId/outbNo/outbStatus/wavNo)가 함께 내려온다. */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/oms/outbound-orders', { params });
    },

    /** 단건 조회. 응답 형태는 목록 한 건과 같다 (WMS 출고주문 정보 포함) */
    get(omsOutbOrderId) {
        return api.get(`/oms/outbound-orders/${omsOutbOrderId}`);
    },

    /** 특정 주문의 라인 목록 */
    lines(omsOutbOrderId) {
        return api.get(`/oms/outbound-orders/${omsOutbOrderId}/lines`);
    },

    /** 등록. payload: { storeId, outbTyp, vhclFltno, expctDe, picNm, rmk, lines: [{ prodId, odrQty }] }.
     *  주문번호는 서버 채번(SO-). 납품처는 이름이 아니라 마스터 ID로 보낸다 —
     *  응답에는 storeCd/storeNm이 조인돼 내려온다. 수량은 출고단위(주문서 단위) — 낱개 환산은 확정 시 서버가 한다 */
    create(payload) {
        return api.post('/oms/outbound-orders', payload);
    },

    /** 수정. payload는 create와 동일하다. 작성(CREATED) 상태만 가능 —
     *  확정된 주문은 서버가 거부한다(이미 나간 창고 문서와 어긋나므로 확정취소가 먼저).
     *  주문번호는 바뀌지 않는다. 예정일을 고쳐도 채번 시점의 번호를 그대로 쓴다 */
    update(omsOutbOrderId, payload) {
        return api.put(`/oms/outbound-orders/${omsOutbOrderId}`, payload);
    },

    /** 일괄 확정 → 건마다 WMS 출고주문 생성. ids: 주문 id 배열.
     *  한 요청으로 보내고 응답 { succeeded: [id], failed: [{ id, reason }] }로 건별 성공/실패를 받는다 —
     *  서버가 건별 트랜잭션으로 처리하므로 한 건의 거부가 나머지를 막지 않는다.
     *  작성(CREATED) 상태만 가능 — 재확정은 서버가 거부한다(중복 생성 방지) */
    confirm(ids) {
        return api.post('/oms/outbound-orders/confirm', ids);
    },

    /** 일괄 확정취소 → WMS 출고주문을 삭제하고 주문을 작성 상태로 원복한다 (고쳐서 다시 확정 가능).
     *  웨이브에 편성됐거나 할당이 시작된 주문이면 그 건은 실패로 돌아온다. WMS 출고주문 소멸 경로는 이것 하나뿐. 응답 형태는 confirm과 같다 */
    cancelConfirm(ids) {
        return api.post('/oms/outbound-orders/confirm-cancel', ids);
    },

    /** 일괄 삭제. 확정 전(CREATED)만 가능 — 확정된 주문은 확정취소가 먼저다.
     *  취소 상태를 두지 않으므로 "없앤다"는 조작은 이것 하나뿐이다.
     *  DELETE는 본문 대신 ?ids=1,2,3 으로 보낸다. 응답 형태는 confirm과 같다 */
    remove(ids) {
        return api.delete('/oms/outbound-orders', { params: { ids: ids.join(',') } });
    },
};
