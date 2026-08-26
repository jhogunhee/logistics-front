// 재고조정 API (wms-backend 연동) — 장부와 실물을 함께 증감시키는 의도된 처분(폐기·견본출고).
//
// 재고조사와 갈리는 지점은 「실물이 그 자리에 있느냐」 하나다. 조사는 장부와 실물이 어긋났을 때
// 장부를 실물에 맞추고(조정수량이 실사수량에서 파생), 조정은 둘이 맞는 상태에서 함께 줄인다
// (조정수량이 입력값). 불량 반품을 폐기하는데 실사수량 0으로 적으면 「세어보니 없었다」는
// 거짓 기록이 되므로 경로를 나눈다.
//
// 라인은 두 종류다 — 가용 라인(재고 행 지목, ±)과 보류 라인(보류 건 지목, − 전용).
// 보류 라인은 해제와 차감이 한 트랜잭션이라, 「보류 해제 → 조정」 2단계에서 생기는
// 「폐기 대기분이 가용재고로 뜨는 창」이 없다.
import api from '@/utils/axios';

const clean = (cond) => Object.fromEntries(
    Object.entries(cond).filter(([, v]) => v !== '' && v != null),
);

export const invAdjApi = {
    /**
     * 가용 라인 대상 조회. cond: { prodCd, prodNm, locCd, lotNo, zonCd }
     * 보관 로케이션을 조건과 무관하게 서버가 강제한다 — 스테이징은 적치·출고확정이 소진 중이라
     * 수량이 불안정하다. 가용 0인 행도 내려온다((+) 조정 대상이라 거르지 않는다).
     */
    listTargets(cond = {}) {
        return api.get('/inventory/adjs/targets', { params: clean(cond) });
    },

    /**
     * 보류 라인 대상 조회 — 미해제 잔량이 남은 보류 건. cond는 가용 라인과 같고 rsnCd는 보류사유다.
     * 행 단위가 재고 행이 아니라 보류 「건」인 이유: 같은 재고 행에 사유가 다른 미해제 보류가
     * 여러 건 병존해서, 재고 행만 지목하면 어느 건에서 빠지는지 정해지지 않는다.
     */
    listHldTargets(cond = {}) {
        return api.get('/inventory/adjs/hld-targets', { params: clean(cond) });
    },

    /**
     * 조정 실행. items: [{ prodId, locId, lotId, adjQty, hldId?, rsnCd, rsnDscr }] —
     * 전체가 한 트랜잭션이라 한 건이라도 검증에 걸리면 전량 롤백된다.
     * 발급된 재고조정 번호 목록을 돌려받는다 (재고 이력의 참조 문서번호로도 실린다).
     *
     * adjQty는 부호가 있다 — 양수 증가 / 음수 감소, 0은 거부.
     * hldId를 넣으면 보류 라인이라 감소만 가능하고, 그 건의 해제(사유 ADJ)까지 함께 처리된다.
     *
     * 서버가 거부하는 경우: 스테이징 재고 · Lot이 그 상품의 것이 아님 · 가용 초과(감소) ·
     * 보류 잔량 초과 · 보류 라인의 증가 · 존재하지 않는 재고의 감소 · 같은 대상 중복.
     */
    adjust(items) {
        return api.post('/inventory/adjs', { items });
    },

    /**
     * 실적 조회 (append-only 로그 — 취소 경로가 없어 되돌린 것도 새 행으로 남는다).
     * 무한히 자라는 목록이라 서버 페이징이고 전량 조회는 없다 — 응답은 { rows, totCnt, page, size }.
     */
    list(cond = {}, page = { page: 1, size: 30 }) {
        return api.get('/inventory/adjs', { params: { ...clean(cond), page: page.page, size: page.size } });
    },
};
