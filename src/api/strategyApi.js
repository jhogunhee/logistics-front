// 전략 시스템 API (검수 정책 · 적치 전략 · 웨이브 전략 · 메타데이터)
// 편집 폼의 선택지는 전부 meta API에서 온다 — 화면에 하드코딩된 선택지를 만들지 않는다 (P1).
import api from '@/utils/axios';

export const strategyApi = {
    meta: {
        /** 검수 규칙 목록 (백엔드 InspectionRule enum). [{ code, name, dscr, deprecated }] — 파라미터 폼은 RuleParamForm에 고정 */
        inspectionRules() {
            return api.get('/strategy/meta/inspection-rules');
        },
        /** 적치 방식 목록 (백엔드 PutawayMethod enum) */
        putawayMethods() {
            return api.get('/strategy/meta/putaway-methods');
        },
        /** 조건 필드 목록. domain: 'putaway-target'(단계 조건) | 'putaway-loc'(적치위치 — BIZ_DVSN뿐) | 'wave-order'(웨이브 조건). [{ code, label, allowedOps, optionSource }] */
        fields(domain) {
            return api.get(`/strategy/meta/fields/${domain}`);
        },
        /** 동적 선택지. [{ value, label }] */
        options(source) {
            return api.get(`/strategy/meta/options/${source}`);
        },
    },

    /** 검수 정책 (전역 1개 — 경로에 id 없음) */
    inspectionPolicy: {
        get() {
            return api.get('/strategy/inspection-policy');
        },
        create(definition) {
            return api.post('/strategy/inspection-policy', definition);
        },
        update(definition) {
            return api.put('/strategy/inspection-policy', definition);
        },
        remove() {
            return api.delete('/strategy/inspection-policy');
        },
        /** 미저장 정의 미리보기. payload: { definition, lots: [{ prodId, mfgDt, receiptDt }] } */
        preview(payload) {
            return api.post('/strategy/inspection-policy/preview', payload);
        },
        /** 리비전 이력 (조회 전용 감사 이력) */
        revisions() {
            return api.get('/strategy/inspection-policy/revisions');
        },
        revision(rvsnNo) {
            return api.get(`/strategy/inspection-policy/revisions/${rvsnNo}`);
        },
    },

    /** 적치 전략 */
    putawayStrategies: {
        list() {
            return api.get('/strategy/putaway-strategies');
        },
        get(id) {
            return api.get(`/strategy/putaway-strategies/${id}`);
        },
        create(definition) {
            return api.post('/strategy/putaway-strategies', definition);
        },
        update(id, definition) {
            return api.put(`/strategy/putaway-strategies/${id}`, definition);
        },
        remove(id) {
            return api.delete(`/strategy/putaway-strategies/${id}`);
        },
        /** 미저장 정의 미리보기. payload: { definition, ibLineId?, lotId?, prodId?, qty } */
        preview(payload) {
            return api.post('/strategy/putaway-strategies/preview', payload);
        },
        /** 리비전 이력 (조회 전용 감사 이력) */
        revisions(id) {
            return api.get(`/strategy/putaway-strategies/${id}/revisions`);
        },
        revision(id, rvsnNo) {
            return api.get(`/strategy/putaway-strategies/${id}/revisions/${rvsnNo}`);
        },
    },

    /** 웨이브 전략 */
    waveStrategies: {
        list() {
            return api.get('/strategy/wave-strategies');
        },
        get(id) {
            return api.get(`/strategy/wave-strategies/${id}`);
        },
        create(definition) {
            return api.post('/strategy/wave-strategies', definition);
        },
        update(id, definition) {
            return api.put(`/strategy/wave-strategies/${id}`, definition);
        },
        remove(id) {
            return api.delete(`/strategy/wave-strategies/${id}`);
        },
        /** 미저장 정의 미리보기. payload: { definition, expctDeFrom?, expctDeTo? } — DB 변경 없음 */
        preview(payload) {
            return api.post('/strategy/wave-strategies/preview', payload);
        },
        /**
         * 저장본 미리보기. payload: { expctDeFrom?, expctDeTo? } — 정의는 서버가 저장본에서 채운다.
         * 편성 화면이 "실행하면 무엇이 편입되나"를 실행 전에 확인하는 데 쓴다 (DB 변경 없음).
         */
        previewSaved(id, payload) {
            return api.post(`/strategy/wave-strategies/${id}/preview`, payload);
        },
        /** 리비전 이력 (조회 전용 감사 이력) */
        revisions(id) {
            return api.get(`/strategy/wave-strategies/${id}/revisions`);
        },
        revision(id, rvsnNo) {
            return api.get(`/strategy/wave-strategies/${id}/revisions/${rvsnNo}`);
        },
        /**
         * 전략 실행 — 실제 편성(웨이브 생성 + 주문 편입). 전략 관리가 아니라 업무 API다.
         * payload: { wavStgyId?: 없으면 전 전략 순회, expctDeFrom?, expctDeTo? }
         */
        execute(payload) {
            return api.post('/outbound/waves/stgy-exec', payload);
        },
    },

    /** 실행 로그. stgyTyp: 'INSP' | 'PTAWY' | 'WAV' */
    executions(stgyTyp, stgyId) {
        return api.get('/strategy/executions', { params: { stgyTyp, ...(stgyId ? { stgyId } : {}) } });
    },
};

/** 연산자 표시 라벨 (백엔드 enum과 1:1) */
export const OP_LABELS = {
    EQ: '=',
    NE: '≠',
    IN: '포함 (IN)',
    NOT_IN: '제외 (NOT IN)',
    GE: '≥',
    LE: '≤',
    BETWEEN: '범위',
    LIKE: '포함 문자',
};
