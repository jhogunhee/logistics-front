// 재고조사(실사) API (wms-backend 연동) — 조사 생성(전산수량 스냅샷) → 실사수량 입력 → 확정(ADJUST 반영)
import api from '@/utils/axios';

export const invStktkApi = {
    /**
     * 조사 생성. scope: { zonCd, locId, prodId } — 모두 선택이고, 전부 비면 전 보관 로케이션이 대상이다.
     * 범위에 걸리는 보관 재고로 라인이 자동 생성되며 각 라인에 전산수량이 스냅샷된다.
     * 발급된 조사번호를 돌려받는다.
     */
    create(scope = {}) {
        return api.post('/inventory/stocktakes', scope);
    },

    /** 조사 목록. cond: { stktkNo, status, zonCd, prodCd, fromDe, toDe } — 빈 값 조건은 빼고 보낸다 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inventory/stocktakes', { params });
    },

    /** 조사 상세 (헤더 + 라인). 라인에는 현재 전산수량(nowSysQty)·예약·보류가 함께 실린다 */
    detail(id) {
        return api.get(`/inventory/stocktakes/${id}`);
    },

    /** 실사수량·사유 저장. items: [{ lnId, stktkQty, rsnCd, rsnDscr }] — stktkQty가 null이면 미조사로 되돌린다 */
    saveLines(id, items) {
        return api.put(`/inventory/stocktakes/${id}/lines`, { items });
    },

    /** 라인 수동 추가 (장부에 없는 재고를 실사에서 발견했을 때 · 기초재고 등록) */
    addLine(id, { prodId, locId, lotId }) {
        return api.post(`/inventory/stocktakes/${id}/lines`, { prodId, locId, lotId });
    },

    /** 라인 삭제 (조사 대상에서 제외) */
    deleteLine(id, lnId) {
        return api.delete(`/inventory/stocktakes/${id}/lines/${lnId}`);
    },

    /** 전산수량 재스냅샷 — 조사 중 재고가 변했을 때 화면 기준값을 맞춘다 (실사수량은 유지) */
    resync(id) {
        return api.post(`/inventory/stocktakes/${id}/resync`);
    },

    /** 확정 — 차이만큼 ADJUST 기록 + 재고 보정. 차이 라인은 사유가 필수다 */
    confirm(id) {
        return api.post(`/inventory/stocktakes/${id}/confirm`);
    },

    /** 조사 취소 (확정 전 폐기) */
    cancel(id) {
        return api.post(`/inventory/stocktakes/${id}/cancel`);
    },
};

/** 조사 상태 표시 메타. 「부분입력」 같은 상태는 없다 — 진행도는 라인 수 비교로 본다 */
export const INV_STKTK_STATUS_META = {
    CREATED:   { label: '작성', badge: 'bg-indigo-100 text-indigo-700' },
    CONFIRMED: { label: '확정', badge: 'bg-emerald-100 text-emerald-700' },
    CANCELLED: { label: '취소', badge: 'bg-slate-100 text-slate-500' },
};

/** 「기타」 사유코드 — 이 코드일 때만 자유 텍스트 입력을 받는다 (보류와 같은 규칙) */
export const ETC_RSN_CD = 'ETC';

/**
 * 조정수량 = 실사수량 − 전산수량. 확정 후에는 확정시점 전산수량(cfmSysQty)이,
 * 확정 전에는 현재 전산수량(nowSysQty)이 기준이다 — 확정이 그 시점 값을 다시 읽기 때문이다.
 * 실사수량 미입력(null)이면 조정 자체가 없다.
 */
export const adjQtyOf = (ln) => {
    if (ln.stktkQty == null) return null;
    const base = ln.cfmSysQty ?? ln.nowSysQty;
    return ln.stktkQty - base;
};
