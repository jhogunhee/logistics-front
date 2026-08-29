// 메뉴 마스터 API — wms-backend의 com.project.mdm.mnu 연동. 시스템관리자만 열린다
import api from '@/utils/axios';

export const mnuApi = {
    /** 목록 조회. { menus, uncoveredEndpoints } — 뒤엣것은 어느 메뉴도 관장하지 않는 저장 API다 */
    list(dvsn) {
        return api.get('/master/mnus', { params: dvsn ? { dvsn } : {} });
    },

    /** 일괄저장 (생성·수정·삭제 한 번에). 다른 마스터와 같은 방식 */
    saveAll(rows) {
        return api.post('/master/mnus/bulk', rows);
    },

    /** 권한 격자 — 행이 메뉴, 열이 역할 */
    roleGrid(dvsn) {
        return api.get('/master/mnus/roles', { params: dvsn ? { dvsn } : {} });
    },

    /** 그 구분(WEB/PDA)의 매핑을 통째로 교체한다 — 안 보낸 메뉴는 권한이 없어진다 */
    replaceRoles(dvsn, rows) {
        return api.put('/master/mnus/roles', rows, { params: dvsn ? { dvsn } : {} });
    },
};
