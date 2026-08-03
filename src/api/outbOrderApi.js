// 출고 주문 API (wms-backend 연동)
import api from '@/utils/axios';

export const outbOrderApi = {
    /**
     * 출고 주문 목록. cond: { outbNo, status, storeId, outbTyp, vhclFltno, wavId, unassigned, dateFrom, dateTo }
     * - unassigned=true : 아직 어느 웨이브에도 안 담긴 주문 (웨이브 편성 화면의 좌측 후보)
     * - wavId          : 그 웨이브에 편성된 주문 (우측 목록)
     * - dateFrom/To    : 출고예정일 범위 (주문일이 아니다 — 웨이브는 같은 날 나갈 주문을 묶는다)
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

/**
 * 출고 진행상태 표시 메타. 부분할당은 상태가 아니라 수량에서 파생하므로 여기 없다.
 * 취소(CANCELLED)도 없다 — 없앨 주문은 OMS 확정취소가 행째로 지운다(웨이브 편성 전만).
 */
export const OUTB_STATUS_META = {
    CREATED:   { label: '신규',     badge: 'bg-slate-100 text-slate-600' },
    ALLOCATED: { label: '할당',     badge: 'bg-indigo-100 text-indigo-700' },
    PICKING:   { label: '피킹중',   badge: 'bg-amber-100 text-amber-700' },
    PICKED:    { label: '피킹완료', badge: 'bg-sky-100 text-sky-700' },
    SHIPPED:   { label: '출고확정', badge: 'bg-emerald-100 text-emerald-700' },
};

/**
 * 웨이브 편입 출처. 수동 편성은 금지 대상이 아니라 가시화 대상이다 —
 * 전략 조건과 맞지 않는 주문이 웨이브에 들어 있는 상황을 화면이 구분해 보여준다.
 */
export const WAV_REG_TYP_META = {
    STGY:   { label: '전략',  badge: 'bg-violet-100 text-violet-700' },
    MANUAL: { label: '수동',  badge: 'bg-slate-100 text-slate-500' },
};
