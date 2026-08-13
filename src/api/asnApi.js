// 입고예정(ASN) API (wms-backend 연동)
import api from '@/utils/axios';

export const asnApi = {
    /** 헤더 목록 조회. cond: { ibNo, status, dateFrom, dateTo } — 빈 값 조건은 빼고 보낸다.
     *  lineCount/rcvdLineCount는 서버가 라인에서 파생시켜 내려준다. */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inbound/asns', { params });
    },

    /** 특정 ASN의 라인 목록 조회 */
    lines(ibOrderId) {
        return api.get(`/inbound/asns/${ibOrderId}/lines`);
    },

    // 등록도 취소도 여기 없다. ASN의 생성/소멸은 OMS 입고주문이 주관한다
    // — omsIbOrderApi의 confirm() / cancelConfirm() 참고.
    // 창고가 예정을 스스로 만들거나 없애면 주문 상태와 어긋나기 때문이고,
    // 서버도 같은 이유로 두 엔드포인트를 제거했다.

    /** 검수 저장 (증분). payload: { receiptDt(입고일자), lines: [{ ibLineId, inspectQty, mfgDt(제조일자, 관리 상품만) }] }
     *  Lot 채번(입고일 기반)과 유통기한 계산(제조일+shelfLifeDays)은 서버 담당. 검수수량은 RCV-STAGE 재고로 즉시 반영. */
    receive(ibOrderId, payload) {
        return api.post(`/inbound/asns/${ibOrderId}/receive`, payload);
    },

    /** 입고 마감 (RECEIVING → RECEIVED). 잔량(예정-검수)은 미입고로 확정 */
    close(ibOrderId) {
        return api.post(`/inbound/asns/${ibOrderId}/close`);
    },

    /** 라인의 검수 이력(RECEIVE 건, 최근 순) — 검수 취소 대상 선택용 */
    receipts(ibOrderId, ibLineId) {
        return api.get(`/inbound/asns/${ibOrderId}/lines/${ibLineId}/receipts`);
    },

    /** 검수 취소. 검수 건 하나를 되돌린다 (이미 적치된 수량이 있으면 서버가 거부) */
    cancelReceipt(ibOrderId, invHistId) {
        return api.post(`/inbound/asns/${ibOrderId}/receipts/${invHistId}/cancel`);
    },
};
