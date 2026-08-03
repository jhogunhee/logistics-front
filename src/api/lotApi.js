// Lot 조회 API (wms-backend 연동). Lot 생성은 검수의 소관이라 조회만 있다.
import api from '@/utils/axios';

export const lotApi = {
    /** 상품별 Lot 목록 (유통기한 빠른 순). 재고조사의 라인 수동 추가에서 Lot을 고를 때 쓴다 */
    listByProd(prodId) {
        return api.get('/master/lots', { params: { prodId } });
    },
};
