// 전략 시스템 API (검수 정책 · 적치 전략 · 메타데이터)
// 편집 폼의 선택지는 전부 meta API에서 온다 — 화면에 하드코딩된 선택지를 만들지 않는다 (P1).
import api from '@/utils/axios';

export const strategyApi = {
    meta: {
        /** 검수 규칙 Descriptor 목록. [{ code, name, description, deprecated, params: [ParamSpec] }] */
        inspectionRules() {
            return api.get('/strategy/meta/inspection-rules');
        },
        /** 적치 방식 Descriptor 목록 */
        putawayMethods() {
            return api.get('/strategy/meta/putaway-methods');
        },
        /** 조건 필드 목록. domain: 'putaway-target' | 'putaway-loc'. [{ code, label, allowedOps, optionSource }] */
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
        revisions() {
            return api.get('/strategy/inspection-policy/revisions');
        },
        revision(rvsnNo) {
            return api.get(`/strategy/inspection-policy/revisions/${rvsnNo}`);
        },
        restore(rvsnNo) {
            return api.post(`/strategy/inspection-policy/revisions/${rvsnNo}/restore`);
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
        /** 삭제된 전략 목록 (리비전에만 남은 것) — restore(stgyId, lastRvsnNo)로 새 전략으로 복원 */
        deleted() {
            return api.get('/strategy/putaway-strategies/deleted');
        },
        /** 미저장 정의 미리보기. payload: { definition, ibLineId?, lotId?, prodId?, qty } */
        preview(payload) {
            return api.post('/strategy/putaway-strategies/preview', payload);
        },
        revisions(id) {
            return api.get(`/strategy/putaway-strategies/${id}/revisions`);
        },
        revision(id, rvsnNo) {
            return api.get(`/strategy/putaway-strategies/${id}/revisions/${rvsnNo}`);
        },
        restore(id, rvsnNo) {
            return api.post(`/strategy/putaway-strategies/${id}/revisions/${rvsnNo}/restore`);
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
