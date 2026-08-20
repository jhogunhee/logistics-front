// 적치 API (wms-backend 연동) — 2단계: 적치지시 발행 → 지시 실행(실물 MOVE)
import api from '@/utils/axios';

export const putawayApi = {
    /**
     * 지시 대상 (라인, Lot) 배치. cond: { ibNo, vndrNm, dateFrom, dateTo, prodCd, prodNm } — 날짜는 Lot 입고일자 기준.
     * 유통기한 오름차순(FEFO)으로 내려오고, 이 순서가 곧 로케이션 용량 선점 순서라 추천 요청 시 그대로 보내야 한다.
     */
    lines(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inbound/putaway/lines', { params });
    },

    /** 대상 로케이션 후보 (상품 온도대와 일치하는 STORAGE, pikngPrty 오름차순). availQty null = 최대적재수량 미설정 */
    candidateLocs(ibLineId) {
        return api.get(`/inbound/putaway/lines/${ibLineId}/candidate-locs`);
    },

    /**
     * 적치 전략 시뮬레이션. items: [{ ibLineId, lotId, qty }] — 저장하지 않고 배정 결과만 돌려준다.
     * 응답 item의 strategySelected=false면 그 배치에 맞는 전략이 없다는 뜻이고(수동 지시로 폴백),
     * remainQty>0이면 로케이션 용량이 모자라 다 배정하지 못했다는 뜻이다.
     */
    previewTasks(items) {
        return api.post('/inbound/putaway/tasks/preview', { items });
    },

    /**
     * 적치지시 발행. items: [{ ibLineId, lotId, assignments: [{ locId, qty }] }] —
     * 전체가 한 트랜잭션이라 한 건이라도 검증에 걸리면 전량 롤백된다.
     */
    createTasks(items) {
        return api.post('/inbound/putaway/tasks', { items });
    },

    /** 지시 목록 조회. cond: { ibNo, prodCd, prodNm, toLocCd, status } — 미완료(DIRECTED)가 먼저, 그 안에서 유통기한 순 */
    tasks(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inbound/putaway/tasks', { params });
    },

    /** 지시 실행 (부분 실행 허용 — 잔여수량 이내). RCV-STAGE → 지시된 로케이션으로 실물 이동 */
    execute(taskId, qty) {
        return api.post(`/inbound/putaway/tasks/${taskId}/execute`, { qty });
    },

    /**
     * 일괄 실행. items: [{ taskId, qty }] — 한 상품이 여러 로케이션으로 쪼개진 지시를
     * 한 번에 소진할 때 쓴다. 전체가 한 트랜잭션이라 한 건이라도 실패하면 전량 롤백된다
     * (건별 execute를 N번 부르면 부분 실패 시 무엇이 반영됐는지 알 수 없다).
     */
    executeAll(items) {
        return api.post('/inbound/putaway/tasks/execute', { items });
    },

    /**
     * 지시 로케이션 변경·분할. qty가 잔여 전량(미실행)이면 목적지만 바뀌고,
     * 일부면 그만큼 새 지시로 떨어져 나간다 — 부분 실행된 지시의 잔여분도 이 경로로 옮긴다
     */
    changeLoc(taskId, locId, qty) {
        return api.post(`/inbound/putaway/tasks/${taskId}/change-loc`, { locId, qty });
    },

    /** 지시 취소 — 실행 실적이 있으면 서버가 거부한다 */
    cancel(taskId) {
        return api.post(`/inbound/putaway/tasks/${taskId}/cancel`);
    },
};

/** 적치지시 상태 표시 메타 (DIRECTED에 부분 실행이 포함된다 — 진행도는 수량으로 본다) */
export const PUTAWAY_TASK_STATUS_META = {
    DIRECTED:  { label: '지시', badge: 'bg-indigo-100 text-indigo-700' },
    DONE:      { label: '완료', badge: 'bg-emerald-100 text-emerald-700' },
    CANCELLED: { label: '취소', badge: 'bg-slate-100 text-slate-500' },
};
