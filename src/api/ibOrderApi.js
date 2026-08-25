// 입고예정(ASN) API — 목록 조회 · 검수 · 입고확정. wms-backend IbOrderController(/inbound/asns) 한 벌과 대응한다.
// 검수를 따로 떼지 않은 이유: 검수는 자기 URL이 없는 ASN의 하위 동작이고, lines()를 네 화면이 공유한다.
import api from '@/utils/axios';

export const ibOrderApi = {
    // 헤더 목록은 화면별로 셋이다. 뽑는 컬럼이 아니라 쿼리 모양이 갈려서 나눴다 —
    // 진행단계(prgr)는 적치지시 EXISTS 서브쿼리를, 최종 검수일시(inspDt)는 inv_hist 서브쿼리를
    // 부르는데, 화면마다 둘 중 하나만 쓴다. 공통 조건은 셋 다 { ibNo, vndrNm, dateFrom, dateTo }.

    /** 입고예정(ASN) 관리 · 대시보드. cond에 prgr(진행 5단계) 필터를 더 받는다.
     *  응답: ibOrderId, ibNo, prgr, vndrNm, expctDe, totalExpctQty, inspDt, cfmDt
     *  prgr는 저장값이 아니라 서버가 수량·적치지시에서 파생시킨 값이고, 필터도 서버 쿼리가 건다
     *  (저장 상태 3값 필터는 화면 뱃지와 체계가 달라 폐지). inspDt는 라인 검수일시의 최댓값. */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inbound/asns', { params });
    },

    /** 입고검수 · 검수정책 시뮬레이션. 진행 5단계 대신 저장 상태(status)를 준다 — 이 화면은
     *  「검수할 수 있는가」만 보면 되고, 그 덕에 서버가 적치지시 조회를 건너뛴다.
     *  응답: ibOrderId, ibNo, status, vndrNm, expctDe, lineCount, cmplLineCount, inspDt
     *  cmplLineCount는 착수한 라인이 아니라 전량 검수를 마친 라인 수다. cond.prgr는 무시된다. */
    listForInsp(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inbound/asns/inspection', { params });
    },

    /** 입고확정. 결품(예정−검수)·미적치(검수−적치) 계산용 수량 합계를 준다.
     *  확정 가능 판정에 status와 prgr가 둘 다 필요해 둘 다 내려온다. 최종 검수일시는 없다.
     *  응답: ibOrderId, ibNo, prgr, status, vndrNm, expctDe, totalExpctQty, totalRcvdQty, totalPtawyQty, cfmDt */
    listForCfm(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inbound/asns/confirmation', { params });
    },

    /** 특정 ASN의 라인 목록 조회 */
    lines(ibOrderId) {
        return api.get(`/inbound/asns/${ibOrderId}/lines`);
    },

    // 등록도 취소도 여기 없다. ASN의 생성/소멸은 OMS 입고주문이 주관한다
    // — omsIbOrderApi의 confirm() / cancelConfirm() 참고.
    // 창고가 예정을 스스로 만들거나 없애면 주문 상태와 어긋나기 때문이고,
    // 서버도 같은 이유로 두 엔드포인트를 제거했다.

    /** 검수 저장 (증분). payload: { receiptDt(입고일자), lines: [{ ibLineId, inspectQty, mfgDt(제조일자, 관리 상품만),
     *  rjctQty · rjctRsnCd(HLD_RSN) · rjctRsnDscr — 반품입고만. 불량은 반품존에 RECEIVE 후 즉시 보류 }] }
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
