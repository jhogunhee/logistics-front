// 수시보충 API (wms-backend 연동)
//
// 보충지시는 피킹지시 발행이 만든다 — 보관존에 잡힌 할당분마다 「도착지(피킹존)에서 집으라는 피킹지시」와
// 「보관존 → 도착지로 옮기라는 보충지시」가 짝으로 나간다. 여기서는 그 보충지시의 확정·취소만 한다.
// 보충지시는 예약을 잡지 않는다(할당이 든다). 확정이 실물과 예약을 함께 피킹존으로 옮기고 할당이
// 그 행을 가리키게 한다. 짝 피킹지시는 보충이 확정돼야 실행할 수 있다.
import api from '@/utils/axios';

const params = (cond = {}) => Object.fromEntries(
    Object.entries(cond).filter(([, v]) => v !== '' && v != null)
);

export const rplnApi = {
    /** 보충지시가 있는 지시발행(ISSUED) 웨이브 — 미확정(openCount)이 0이 아니면 화면이 강조한다. cond: { wavNo, prodCd, expctDeFrom, expctDeTo } */
    waves(cond = {}) {
        return api.get('/outbound/replenishment/waves', { params: params(cond) });
    },

    /** 웨이브의 보충지시 — 짝 피킹지시의 순번 순. 취소된 것은 오지 않는다 */
    rows(wavId) {
        return api.get(`/outbound/waves/${wavId}/replenishments`);
    },

    /**
     * 보충 확정 — <b>전량</b>. 보관존 → 피킹존 실물 이동 + 예약 동행 + 할당 재지정.
     * 여러 건을 보내도 한 트랜잭션(하나가 걸리면 전부 롤백).
     */
    confirm(taskIds) {
        return api.post('/outbound/replenishment/confirm', { taskIds });
    },

    /**
     * 보충 취소 — 예약 변화 없음(할당이 계속 든다). 짝 피킹지시는 보충 없이는 실행되지 않으므로,
     * 다시 내려면 피킹지시 화면에서 그 지시를 취소하고 추가 발행한다.
     */
    cancel(taskIds) {
        return api.post('/outbound/replenishment/cancel', { taskIds });
    },
};
