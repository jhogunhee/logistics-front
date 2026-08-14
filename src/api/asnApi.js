// 입고예정(ASN) API (wms-backend 연동)
import api from '@/utils/axios';

export const asnApi = {
    /** 헤더 목록 조회. cond: { ibNo, status, dateFrom, dateTo } — 빈 값 조건은 빼고 보낸다.
     *  status 필터는 저장 상태 3값(SCHEDULED/RECEIVING/CONFIRMED)이고, 응답의 prgr는
     *  진행 5단계(IbPrgr — 예정/검수/적치지시/적치완료/확정) 파생값이다.
     *  lineCount/cmplLineCount와 수량 합계(totalExpct/totalRcvd/totalPtawyQty)도 서버가 라인에서 파생시켜 내려준다
     *  (cmplLineCount는 착수한 라인이 아니라 전량 검수를 마친 라인 수 — 입고검수 화면이 쓴다).
     *  inspDt는 라인 검수일시의 최댓값(inv_hist RECEIVE 기준)이고, cfmDt는 입고확정 버튼을 누른 시각이다. */
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

    /** 입고확정 (RECEIVING → CONFIRMED) — 유일한 종결 액션. 전제: 검수분 전량 적치.
     *  잔량(예정-검수)은 결품으로 확정되고, 이후 검수·검수취소·지시생성이 막힌다 */
    confirm(ibOrderId) {
        return api.post(`/inbound/asns/${ibOrderId}/confirm`);
    },

    /** 입고건 전체의 검수 이력(RECEIVE 건, 최근 순) — 검수 화면의 「검수 이력」 탭 */
    orderReceipts(ibOrderId) {
        return api.get(`/inbound/asns/${ibOrderId}/receipts`);
    },

    /** 라인의 검수 이력(RECEIVE 건, 최근 순) — 라인 하나만 볼 때 */
    receipts(ibOrderId, ibLineId) {
        return api.get(`/inbound/asns/${ibOrderId}/lines/${ibLineId}/receipts`);
    },

    /** 검수 취소. 검수 건 하나를 되돌린다 (이미 적치된 수량이 있으면 서버가 거부) */
    cancelReceipt(ibOrderId, invHistId) {
        return api.post(`/inbound/asns/${ibOrderId}/receipts/${invHistId}/cancel`);
    },
};
