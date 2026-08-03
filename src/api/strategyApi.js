// 전략 시스템 API (검수 정책 · 적치 전략 · 메타데이터)
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
        /** 조건 필드 목록. domain: 'putaway-target'(단계 조건) | 'putaway-loc'(적치위치 — BIZ_DVSN뿐). [{ code, label, allowedOps, optionSource }] */
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

    /** 실행 로그. stgyTyp: 'INSP' | 'PTAWY' */
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
