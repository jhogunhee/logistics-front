// 단위(상품 포장) API. 상품마다 낱개·박스·파렛트를 등록하고 낱개수량·중량을 정한다.
// 단위 코드 목록 자체는 공통코드 UOM 그룹이 갖는다 (codeApi.list('UOM')).
import api from '@/utils/axios';

// 목록 조회는 없다 — 단위 관리 화면은 상품 목록(prodApi.list)에 실려 오는 uoms를 쓴다
export const prodUomApi = {
    /** 신규(C)/수정(U)/삭제(D) 행 일괄 저장. 중복·입출고단위 삭제 차단은 서버가 한다 */
    saveAll(rows) {
        return api.post('/master/prod-uoms/bulk', rows);
    },
};
