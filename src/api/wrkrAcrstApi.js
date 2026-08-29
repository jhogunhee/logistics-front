// 작업자 실적 API (wms-backend의 com.project.wmsback.worker 연동).
// 실적 전용 테이블이 아니라 재고이력(inv_hist)의 감사 컬럼(created_by)을 집계한 것이다.
import api from '@/utils/axios';

/** 빈 값 조건은 빼고 보낸다 — 서버가 null을 「조건 없음」으로 읽는다 */
const clean = (cond = {}) => Object.fromEntries(Object.entries(cond).filter(([, v]) => v));

export const wrkrAcrstApi = {
    /** 작업자별 요약. cond: { loginId, workTyp, dateFrom, dateTo } */
    summary(cond = {}) {
        return api.get('/wrkr/acrst/summary', { params: clean(cond) });
    },

    /** 일자별 추이 — 실적이 있는 날만 온다 (빈 날 채우기는 화면 몫) */
    daily(cond = {}) {
        return api.get('/wrkr/acrst/daily', { params: clean(cond) });
    },

    /** 기간 안에 실적이 있는 작업자 — 필터 선택지. 작업자·종류 조건은 서버가 무시한다 */
    workers(cond = {}) {
        return api.get('/wrkr/acrst/workers', { params: clean(cond) });
    },

    /**
     * 드릴다운 (서버 페이징). 요약과 같은 조건·같은 다리만 나오므로 목록 건수가 요약 합계와 맞는다.
     * page/size는 빈 값 제거 뒤에 따로 붙인다 — cond에 섞으면 습관적으로 넘긴 0이 조용히 사라진다.
     */
    detail(cond = {}, page = { page: 1, size: 30 }) {
        return api.get('/wrkr/acrst/detail', { params: { ...clean(cond), page: page.page, size: page.size } });
    },
};
