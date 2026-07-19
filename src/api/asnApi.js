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

    /** ASN 등록. payload: { vndrNm, expctDt, lines: [{ skuId, expctQty }] }. 입고번호는 서버 채번 */
    create(payload) {
        return api.post('/inbound/asns', payload);
    },

    /** 취소. 검수 시작 전(SCHEDULED)만 가능 — 이후엔 서버가 409로 거부 */
    cancel(ibOrderId) {
        return api.post(`/inbound/asns/${ibOrderId}/cancel`);
    },

    /** 검수 저장 (증분). payload: { receiptDt(입고일자), lines: [{ ibLineId, inspectQty, mfgDt(제조일자, 관리 SKU만) }] }
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

/** ASN 상태 표시 메타 (라벨/뱃지 색) — 백엔드 IbStatus와 1:1 */
export const ASN_STATUS_META = {
    SCHEDULED: { label: '입고예정', badge: 'bg-slate-100 text-slate-600' },
    RECEIVING: { label: '검수중',   badge: 'bg-amber-100 text-amber-700' },
    RECEIVED:  { label: '입고마감', badge: 'bg-sky-100 text-sky-700' },
    COMPLETED: { label: '적치완료', badge: 'bg-emerald-100 text-emerald-700' },
    CANCELLED: { label: '취소',     badge: 'bg-rose-100 text-rose-600' },
};

/** ASN 상태 검색 드롭다운 옵션 */
export const ASN_STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(ASN_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];