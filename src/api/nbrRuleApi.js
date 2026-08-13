// 채번 규칙 마스터 API (wms-backend 연동). 상품/벤더 코드, 입고·출고 번호 등의 공통 채번 규칙을 관리한다.
import api from '@/utils/axios';

export const nbrRuleApi = {
    /** 목록 조회. cond: { ruleCd, ruleNm } — 빈 값 조건은 빼고 보낸다 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/master/nbr-rules', { params });
    },

    /** 신규(C)/수정(U)/삭제(D) 행 일괄 저장. 조립 조건 검증·동적키유형 변경 차단은 서버에서 한다 */
    saveAll(rows) {
        return api.post('/master/nbr-rules/bulk', rows);
    },

    /** 선택한 규칙의 현재 발급 카운터(동적키/현재값/최종발급시각) 읽기전용 목록 */
    seqs(ruleCd) {
        return api.get(`/master/nbr-rules/${ruleCd}/seqs`);
    },

    /** 조립 결과 미리보기. 저장 전 형식 확인용 — DB를 건드리지 않고 오늘 날짜 + seq=1로 렌더링만 한다 */
    preview({ prfx, prfxDlmt, deDlmt, seqDgt, dyncKyTyp }) {
        return api.post('/master/nbr-rules/preview', { prfx, prfxDlmt, deDlmt, seqDgt, dyncKyTyp });
    },
};
