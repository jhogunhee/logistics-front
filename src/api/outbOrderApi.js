// 출고 주문 API (wms-backend 연동)
import api from '@/utils/axios';

export const outbOrderApi = {
    /**
     * 출고 주문 목록. cond: { outbNo, status, storeId, outbTyp, vhclFltno, wavId, unassigned, expctDeFrom, expctDeTo }
     * - unassigned=true : 아직 어느 웨이브에도 안 담긴 주문 (웨이브 편성 화면의 좌측 후보)
     * - wavId          : 그 웨이브에 편성된 주문 (우측 목록)
     * - expctDeFrom/To : 출고예정일 범위 (주문일이 아니다 — 웨이브는 같은 날 나갈 주문을 묶는다)
     * - storeId        : 점포 정확일치 (팝업에서 고른다). storeNm은 화면 표시용이라 서버가 무시한다
     * 둘은 서로 배타적으로 쓴다. 빈 값 조건은 빼고 보낸다 — 서버가 null 조건을 무시하긴 하지만
     * 빈 문자열은 "빈 값과 같음"으로 해석될 수 있어 여기서 걸러낸다.
     */
    list(cond = {}) {
        const params = Object.fromEntries(
            Object.entries(cond).filter(([, v]) => v !== '' && v != null)
        );
        return api.get('/outbound/orders', { params });
    },

    /** 주문 라인 (상품·수량) */
    lines(outbOrderId) {
        return api.get(`/outbound/orders/${outbOrderId}/lines`);
    },

    // 등록도 취소도 없다 — 출고주문은 OMS 주문확정(omsOutbOrderApi.confirm)으로만 생기고
    // 확정취소(omsOutbOrderApi.cancelConfirm)로만 사라진다. 서버에도 두 엔드포인트가 없으므로
    // 여기에 되살리지 말 것.
};
