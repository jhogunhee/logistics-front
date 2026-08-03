// 점포(납품처) 마스터 API — wms-backend의 com.project.mdm.store 연동
import api from '@/utils/axios';

export const storeApi = {
    /** 전체 목록 (점포코드 순). 응답: [{ storeId, storeCd, storeNm, outbLifeRate }]
     *  조회 전용이다 — 점포 관리 화면이 아직 없어 서버에도 등록·수정 경로가 없다 */
    list() {
        return api.get('/master/stores');
    },
};
