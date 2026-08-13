// 재고 보류 API (wms-backend 연동) — 등록 즉시 발효(inv.hld_qty 증가), 해제는 특정 건 지목·부분 허용
import api from '@/utils/axios';

export const invHldApi = {
    /**
     * 보류 등록. items: [{ invId, qty, rsnCd, rsnDscr }] — 전체가 한 트랜잭션이라
     * 한 건이라도 검증에 걸리면 전량 롤백된다. 발급된 보류 번호 목록을 돌려받는다.
     * rsnDscr는 사유코드가 ETC(기타)일 때만 필수 — 그 외 코드에서는 서버가 무시한다.
     */
    register(items) {
        return api.post('/inventory/holds', { items });
    },

    /** 보류 건 목록 조회. cond: { hldNo, prodCd, prodNm, locCd, lotNo, rsnCd, status } — 빈 값 조건은 빼고 보낸다 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inventory/holds', { params });
    },

    /**
     * 보류 해제. items: [{ hldId, qty, rsnCd, rsnDscr }] — 등록과 같이 전체가 한 트랜잭션이라
     * 한 건이라도 검증에 걸리면 전량 롤백된다. 건마다 잔량 이내의 부분 해제를 허용한다.
     * 오등록 취소도 이 경로다 (사유: 오등록).
     */
    release(items) {
        return api.post('/inventory/holds/release', { items });
    },

    /** 보류 실적 조회 (등록 append-only 로그) */
    listAcrst(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inventory/holds/acrsts', { params });
    },

    /** 해제 실적 조회 (append-only 로그 — 부분 해제 N번이면 N행) */
    listRlzAcrst(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inventory/holds/rlz-acrsts', { params });
    },
};
