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
        /**
         * 할당 슬롯의 구현체 목록 (백엔드 AlocRstrct·AlocDstrb enum). slotTyp: 'RSTRCT' | 'DSTRB'
         * — 구현체 축이 없는 'INVN_FLTR'(정의 전체가 조건) · 'INVN_SRT' · 'ODR_SRT'
         * (정의 전체가 정렬 기준 목록)는 빈 배열이 온다.
         */
        allocationComponents(slotTyp) {
            return api.get(`/strategy/meta/allocation-components/${slotTyp}`);
        },
        /** 정렬 기준 목록. domain: 'allocation-invn'(재고) | 'allocation-order'(주문) | 'putaway-loc'(적치 후보). [{ value, label }] */
        sortFields(domain) {
            return api.get(`/strategy/meta/sort-fields/${domain}`);
        },
        /**
         * 조건 필드 목록. domain: 'putaway-target'(단계 조건) | 'putaway-loc'(적치위치 — BIZ_DVSN뿐)
         * | 'wave-order'(웨이브 조건) | 'allocation-target'(할당 적용대상) | 'allocation-invn'(재고위치 계층)
         * | 'allocation-line'(분배 대상). [{ code, label, allowedOps, optionSource }]
         */
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
        /**
         * 검수 입력 전 힌트 — 저장본 정책 기준으로 상품·입고일자마다 입고 가능한 가장 이른 제조일자.
         * payload: { items: [{ prodId, receiptDt }] } → { items: [{ prodId, receiptDt, minMfgDt, rules: [{ ruleCd, ruleName, minMfgDt }] }] }
         */
        minMfgDts(payload) {
            return api.post('/strategy/inspection-policy/min-mfg-dt', payload);
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
        /** 미저장 정의 미리보기. payload: { definition, expctDe } — 대상 출고예정일 하루 필수, DB 변경 없음 */
        preview(payload) {
            return api.post('/strategy/wave-strategies/preview', payload);
        },
        /**
         * 저장본 미리보기. payload: { expctDe } — 대상 출고예정일 하루 필수, 정의는 서버가 저장본에서 채운다.
         * 편성 화면이 "실행하면 무엇이 편입되나"를 실행 전에 확인하는 데 쓴다 (DB 변경 없음).
         */
        previewSaved(id, payload) {
            return api.post(`/strategy/wave-strategies/${id}/preview`, payload);
        },
        /**
         * 전략 실행 — 실제 편성(웨이브 생성 + 주문 편입). 전략 관리가 아니라 업무 API다.
         * payload: { wavStgyId?: 없으면 전 전략 순회, expctDe: 대상 출고예정일(하루 필수) }
         */
        execute(payload) {
            return api.post('/outbound/waves/stgy-exec', payload);
        },
    },

    /**
     * 할당 전략. 슬롯 5종(재고위치·출고제약·재고정렬·주문순서·분배)이 코드의 기본 동작을 덮어쓴다 —
     * 전략을 하나도 만들지 않으면 할당은 기본 동작(FEFO·점포 잔여수명·순차 소진)으로 돈다.
     */
    allocationStrategies: {
        list() {
            return api.get('/strategy/allocation-strategies');
        },
        get(id) {
            return api.get(`/strategy/allocation-strategies/${id}`);
        },
        create(definition) {
            return api.post('/strategy/allocation-strategies', definition);
        },
        update(id, definition) {
            return api.put(`/strategy/allocation-strategies/${id}`, definition);
        },
        remove(id) {
            return api.delete(`/strategy/allocation-strategies/${id}`);
        },
        /** 미저장 정의 미리보기. payload: { definition, wavIds } — 락도 저장도 하지 않는다 */
        preview(payload) {
            return api.post('/strategy/allocation-strategies/preview', payload);
        },
        /** 저장본 미리보기. payload: { wavIds } — 정의는 서버가 저장본에서 채운다 */
        previewSaved(id, payload) {
            return api.post(`/strategy/allocation-strategies/${id}/preview`, payload);
        },
        /** 미리보기 대상 웨이브 목록 — 업무 API 재사용 (할당 대상 = 잔량 남은 PLANNED 웨이브) */
        targetWaves() {
            return api.get('/outbound/allocations/waves');
        },
    },

    /**
     * 리비전 이력 (조회 전용 감사 이력) — 네 전략이 같은 엔드포인트를 쓴다.
     * stgyTyp: 'INSP' | 'PTAWY' | 'WAV' | 'ALOC', stgyId: 검수는 inspPlcyId
     */
    revisions(stgyTyp, stgyId) {
        return api.get('/strategy/revisions', { params: { stgyTyp, stgyId } });
    },
    revision(stgyTyp, stgyId, rvsnNo) {
        return api.get(`/strategy/revisions/${rvsnNo}`, { params: { stgyTyp, stgyId } });
    },

    /**
     * 실행 로그. stgyTyp: 'INSP' | 'PTAWY' | 'WAV' | 'ALOC'.
     * trgrTyps를 주지 않으면 서버가 실행 기록만(MANUAL·AUTO) 돌려준다 —
     * 미리보기 기록까지 보려면 ['MANUAL','AUTO','PREVIEW']처럼 명시한다.
     */
    executions(stgyTyp, stgyId, trgrTyps) {
        return api.get('/strategy/executions', {
            params: {
                stgyTyp,
                ...(stgyId ? { stgyId } : {}),
                ...(trgrTyps?.length ? { trgrTyp: trgrTyps.join(',') } : {}),
            },
        });
    },
};
