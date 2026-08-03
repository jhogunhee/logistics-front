// 재고 할당 API (wms-backend 연동)
//
// 실행 단위는 웨이브이고 결과는 출고주문 라인에 남는다 — 그래서 웨이브를 고르는 API와
// 라인/할당을 다루는 API가 섞여 있다. 웨이브 하나에 매인 것만 /outbound/waves/{wavId} 아래 둔다.
import api from '@/utils/axios';

export const outbAllocApi = {
    /**
     * 할당 대상 웨이브 목록 — 잔량이 남은 편성중(PLANNED) 웨이브.
     *
     * cond: { wavNo, prodCd, outbNo, storeCd, expctDeFrom, expctDeTo }
     *
     * ⚠ 상품·출고번호·점포 조건은 <b>라인이 아니라 웨이브를 거른다</b>. 조건에 맞는 라인이
     * 하나라도 있으면 그 웨이브가 통째로 걸리므로, 특정 출고번호로 검색해도 결과는 그 웨이브
     * 전체다. 할당의 실행 단위가 웨이브라 그 아래만 골라 실행할 수 없기 때문이고,
     * 화면은 하단 라인 그리드에서 일치 행을 강조해 이 사실을 설명한다.
     */
    targetWaves(cond = {}) {
        const params = Object.fromEntries(
            Object.entries(cond).filter(([, v]) => v !== '' && v != null)
        );
        return api.get('/outbound/allocations/waves', { params });
    },

    /** 웨이브의 라인별 주문/할당/잔량 + 할당 레코드 목록 */
    detail(wavId) {
        return api.get(`/outbound/waves/${wavId}/allocations`);
    },

    /**
     * 자동할당 (FEFO). 웨이브를 여러 건 보낼 수 있지만 서버는 <b>한 트랜잭션</b>으로 처리한다 —
     * 도중 실패하면 이번 실행 전체가 롤백된다(부분 성공 없음).
     *
     * 재고가 모자라는 것은 실패가 아니다. 부분할당으로 정상 종료하고 못 채운 만큼이 shortQty로 온다.
     */
    execute(wavIds) {
        return api.post('/outbound/allocations/execute', { wavIds });
    },

    /**
     * 수동할당 후보 재고. 자동할당과 같은 후보 집합이되 <b>잔여수명 미달을 걸러내지 않고</b>
     * lifeRate·lifePass로 함께 내려준다 — 경고는 화면이 하고 판단은 사람이 한다.
     * 유통기한이 지난 Lot만은 서버가 뺀다(비율과 무관한 하드 가드).
     */
    candidates(outbLineId) {
        return api.get('/outbound/allocations/candidates', { params: { outbLineId } });
    },

    /** 수동할당. items: [{ outbLineId, invId, qty }] */
    allocateManual(wavId, items) {
        return api.post(`/outbound/waves/${wavId}/allocations/manual`, { items });
    },

    /**
     * 할당해제 (다건, 한 트랜잭션). 피킹이 시작된 할당(pikngQty > 0)은 서버가 거부한다.
     * DELETE가 아닌 이유는 삭제와 함께 재고 예약을 되돌리는 업무 처리이기 때문이다
     * (웨이브 편성 해제와 같은 판단).
     */
    release(allocIds) {
        return api.post('/outbound/allocations/release', { allocIds });
    },
};
