// 로케이션 마스터 API (wms-backend 연동)
import api from '@/utils/axios';

export const locApi = {
    /** 목록 조회. cond: { locCd, zonCd, locTyp } — 빈 값 조건은 빼고 보낸다 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/master/locs', { params });
    },

    /** 신규(C)/수정(U)/삭제(D) 행 일괄 저장. 코드 중복 검증은 서버에서 한다 */
    saveAll(rows) {
        return api.post('/master/locs/bulk', rows);
    },
};

// 존 코드 목록은 존 마스터(zonApi.list)에서 조회한다. 예전엔 여기 상수로 박혀 있었는데
// SHIP-STAGE가 빠져 있어 해당 로케이션의 드롭다운·엑셀 검증이 깨져 있었다.