// 재고 이동지시 API (wms-backend 연동) — 2단계: 지시(예약) → 확정(실물 MOVE)
import api from '@/utils/axios';

export const invMovApi = {
    /**
     * 이동지시 등록 (예약). items: [{ invId, toLocId, qty }] — 전체가 한 트랜잭션이라
     * 한 건이라도 검증에 걸리면 전량 롤백된다. 발급된 이동지시 번호 목록을 돌려받는다.
     */
    register(items) {
        return api.post('/inventory/moves', { items });
    },

    /** 지시 목록 조회. cond: { invMovNo, prodCd, prodNm, fromLocCd, toLocCd, status } — 빈 값 조건은 빼고 보낸다 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inventory/moves', { params });
    },

    /** 이동확정 (부분확정 허용 — 잔여수량 이내) */
    confirm(id, qty) {
        return api.post(`/inventory/moves/${id}/confirm`, { qty });
    },

    /** 이동취소 (잔량 예약 해제 — 실적 없으면 CANCELLED, 부분확정 후면 지시수량 차감 후 DONE) */
    cancel(id) {
        return api.post(`/inventory/moves/${id}/cancel`);
    },
};

/** 이동지시 상태 표시 메타 (DIRECTED에 부분확정이 포함된다 — 진행도는 수량으로 본다) */
export const INV_MOV_STATUS_META = {
    DIRECTED:  { label: '지시', badge: 'bg-indigo-100 text-indigo-700' },
    DONE:      { label: '완료', badge: 'bg-emerald-100 text-emerald-700' },
    CANCELLED: { label: '취소', badge: 'bg-slate-100 text-slate-500' },
};

/**
 * 이동구분 표시 메타. 재고이동 화면의 확정·취소는 INV_MOV(재고이동)만 가능하다 —
 * 적치·피킹 유형은 각자의 화면 경로 전용 (서버도 같은 검증을 한다).
 */
export const INV_MOV_DVSN_META = {
    INV_MOV: { label: '재고이동', badge: 'bg-sky-100 text-sky-700' },
    PTAWY:   { label: '적치',     badge: 'bg-violet-100 text-violet-700' },
    PIKNG:   { label: '피킹',     badge: 'bg-orange-100 text-orange-700' },
};
