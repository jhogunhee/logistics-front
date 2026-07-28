// 입고주문(OMS) API — wms-backend의 com.project.omsback 연동
import api from '@/utils/axios';

export const omsIbOrderApi = {
    /** 목록 조회. cond: { omsIbNo, vndrNm, status, dateFrom, dateTo } — 빈 값 조건은 빼고 보낸다.
     *  확정된 주문은 생성된 ASN 정보(ibOrderId/ibNo/ibStatus)가 함께 내려온다. */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/oms/inbound-orders', { params });
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

    /** 변환 → WMS 입고예정(ASN) 생성. 반환값은 생성된 ASN의 ibOrderId.
     *  작성(CREATED) 상태만 가능 — 재변환은 서버가 거부한다(ASN 중복 생성 방지) */
    convert(omsIbOrderId) {
        return api.post(`/oms/inbound-orders/${omsIbOrderId}/convert`);
    },

    /** 변환취소 → ASN을 취소하고 주문을 작성 상태로 원복한다 (고쳐서 다시 변환 가능).
     *  검수가 시작된 ASN이면 서버가 거부한다. ASN 취소 경로는 이것 하나뿐 */
    cancelConvert(omsIbOrderId) {
        return api.post(`/oms/inbound-orders/${omsIbOrderId}/convert-cancel`);
    },

    /** 취소. 확정 전(CREATED)만 가능 — 이후엔 서버가 거부한다 */
    cancel(omsIbOrderId) {
        return api.post(`/oms/inbound-orders/${omsIbOrderId}/cancel`);
    },
};

/** 입고주문 상태 표시 메타 — 백엔드 OmsIbStatus와 1:1 */
export const OMS_IB_STATUS_META = {
    CREATED:   { label: '작성', badge: 'bg-slate-100 text-slate-600' },
    CONVERTED: { label: '변환완료', badge: 'bg-emerald-100 text-emerald-700' },
    CANCELLED: { label: '취소', badge: 'bg-rose-100 text-rose-600' },
};

/** 상태 검색 드롭다운 옵션 */
export const OMS_IB_STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(OMS_IB_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];