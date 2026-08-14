// 점포(납품처) 마스터 API — wms-backend의 com.project.mdm.store 연동
import api from '@/utils/axios';

export const storeApi = {
    /** 목록 조회. cond: { storeCd, storeNm, storeGrp, storeTyp } — 빈 값 조건은 빼고 보낸다.
     *  인자 없이 부르면 전체 (납품처 선택 팝업이 이 형태로 쓴다) */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/master/stores', { params });
    },

    /** 일괄저장 (생성·수정·삭제 한 번에). 벤더/상품 마스터와 같은 방식 */
    saveAll(rows) {
        return api.post('/master/stores/bulk', rows);
    },
};
