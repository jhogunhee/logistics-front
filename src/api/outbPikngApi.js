// 피킹지시 · 피킹 API (wms-backend 연동)
//
// 발행 단위는 웨이브이고 지시 행(pikng_task)은 할당 레코드와 1:1이다 — 상품별로 뭉치는
// 배치 피킹이 없어, 집품한 것을 주문별로 다시 나누는 분배 공정도 없다.
// 발행은 재고에 손대지 않고(예약은 할당이 이미 잡았다), 실행이 보관 → SHIP-STAGE로
// 실물을 옮기며 예약을 소진한다.
import api from '@/utils/axios';

const params = (cond = {}) => Object.fromEntries(
    Object.entries(cond).filter(([, v]) => v !== '' && v != null)
);

export const outbPikngApi = {
    /**
     * 피킹지시 화면의 웨이브 목록 — 할당이 있는 편성중(PLANNED, 발행 대상) + 지시발행(ISSUED,
     * 확인·취소 대상). 발행된 웨이브도 피킹 전이면 실적 0 조건으로 취소할 수 있어 목록에 남는다.
     *
     * cond: { wavNo, prodCd, outbNo, storeCd, status, expctDeFrom, expctDeTo }
     * ⚠ 주문 쪽 조건은 할당 화면과 같은 EXISTS — 라인이 아니라 웨이브를 거른다.
     */
    taskWaves(cond = {}) {
        return api.get('/outbound/picking-tasks/waves', { params: params(cond) });
    },

    /**
     * 웨이브 상세. 발행 전에는 할당 행이 발행될 순서 그대로 오고(발행 미리보기),
     * 발행 후에는 지시 행(스냅샷)이 srt_seq 순으로 온다.
     * noAllocOrders(할당 0건 주문)가 비어 있지 않으면 발행이 차단된다.
     */
    taskDetail(wavId) {
        return api.get(`/outbound/waves/${wavId}/picking-tasks`);
    },

    /**
     * 피킹지시 발행. 여러 웨이브를 보내도 <b>한 트랜잭션</b>이다 — 할당 0건 주문이 섞인
     * 웨이브가 하나라도 있으면 전체가 롤백된다. 부분할당 주문은 막지 않는다 —
     * 미할당 잔량은 부족 출고로 진행한다(백오더 없음).
     */
    issue(wavIds) {
        return api.post('/outbound/picking-tasks/issue', { wavIds });
    },

    /**
     * 지시취소 — 웨이브 단위, 실적 0일 때만. 지시 행은 삭제가 아니라 취소(CANCELLED)로 남고
     * 웨이브는 PLANNED로 복귀한다. 재고 변동 없음(발행이 재고에 손대지 않았으므로).
     */
    cancel(wavIds) {
        return api.post('/outbound/picking-tasks/cancel', { wavIds });
    },

    /** 지시의 실행 실적 로그 (부분 피킹이 N번이면 N행) — 실적 내역 모달 */
    acrsts(taskId) {
        return api.get(`/outbound/picking-tasks/${taskId}/acrsts`);
    },

    /** 피킹 화면의 웨이브 목록 — ISSUED 웨이브의 지시/피킹/잔량 집계. cond: { wavNo, prodCd, expctDeFrom, expctDeTo } */
    pickingWaves(cond = {}) {
        return api.get('/outbound/picking/waves', { params: params(cond) });
    },

    /**
     * 피킹 실행. items: [{ pikngTaskId, qty }] — 행마다 부분 수량 허용(잔량은 재피킹으로 소진),
     * 요청은 한 트랜잭션(한 건이라도 걸리면 전량 롤백). 재고가 보관 → SHIP-STAGE로 실제 이동한다.
     */
    execute(items) {
        return api.post('/outbound/picking/execute', { items });
    },

    /**
     * 결품 종결. items: [{ pikngTaskId, rsnCd, rsnDscr }] — 수량은 보내지 않는다(잔량 전부가 결품).
     * 시킨 만큼 실물이 없어 끝내 못 집을 때, 지시·할당수량을 실적까지 낮춰 닫고 잔량만큼의
     * 예약을 푼다. 실적이 있는 지시만 대상이다 — 실적 0은 웨이브 단위 지시취소가 덮는다.
     * 장부에만 남은 수량은 건드리지 않는다(재고조사 소관) — 다만 예약이 풀려 그 실사가 열린다.
     */
    closeShort(items) {
        return api.post('/outbound/picking/close-short', { items });
    },
};
