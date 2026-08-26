// 사용자 마스터 API — wms-backend의 com.project.mdm.usr 연동. 조회까지 시스템관리자만 열린다
import api from '@/utils/axios';

export const usrApi = {
    /** 목록 조회. cond: { keyword } — 아이디·사용자명 부분일치 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/master/usrs', { params });
    },

    /** 일괄저장 (생성·수정·삭제 한 번에). 다른 마스터와 같은 방식 */
    saveAll(rows) {
        return api.post('/master/usrs/bulk', rows);
    },
};
