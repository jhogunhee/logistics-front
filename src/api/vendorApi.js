// 벤더(납품처) 마스터 API — wms-backend의 com.project.wmsback.master 연동
import api from '@/utils/axios';

export const vendorApi = {
    /** 목록 조회. cond: { vndrCd, vndrNm, useYn } — 빈 값 조건은 빼고 보낸다 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/master/vendors', { params });
    },

    /** 주문 등록용 — 거래중(use_yn='Y') 벤더만. 사용중지 벤더로 새 주문을 만들 수 없다 */
    usable() {
        return api.get('/master/vendors', { params: { useYn: 'Y' } });
    },

    /** 일괄저장 (생성·수정·삭제 한 번에). 상품/로케이션 마스터와 같은 방식 */
    saveAll(rows) {
        return api.post('/master/vendors/bulk', rows);
    },
};