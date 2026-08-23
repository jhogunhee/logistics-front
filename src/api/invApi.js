// 현재고 조회 API (wms-backend 연동)
import api from '@/utils/axios';

export const invApi = {
    /** 현재고 조회. cond: { prodCd, prodNm, locCd, zonCd, lotNo, tmpZon, locTyp } — 빈 값 조건은 빼고 보낸다. */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inventory/stock', { params });
    },

    /**
     * 예약 대사 — 재고 키마다 inv.aloc_qty(장부)와 원천별 미소진 합(할당 · 이동지시 · 스테이징 피킹분).
     * 예약은 이력에 남지 않아 이 비교가 잔류·누락을 잡는 유일한 수단이다. diff ≠ 0 이면 코드 결함.
     */
    alocReconciliation() {
        return api.get('/inventory/stock/aloc-reconciliation');
    },

    /** 로케이션 점유 맵 — STORAGE 전건. 점유율·보충 미달은 화면이 파생한다 */
    locMap() {
        return api.get('/inventory/stock/map');
    },
};