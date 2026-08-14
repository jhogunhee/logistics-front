// 상품 마스터 API (wms-backend 연동)
import api from '@/utils/axios';

export const prodApi = {
    /** 목록 조회. cond: { prodCd, prodNm, tmpZon } — 빈 값 조건은 빼고 보낸다 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/master/prods', { params });
    },

    /** 신규(C)/수정(U) 행 일괄 저장. 신규 행의 상품 코드는 서버가 채번한다 */
    saveAll(rows) {
        return api.post('/master/prods/bulk', rows);
    },
};

/**
 * 입고단위(발주단위) 1개 = 낱개(EA) 몇 개인가. 재고 저장 단위가 낱개(EA)라
 * 이 값 하나로 화면의 모든 환산이 끝난다 — 「환산수량」 표시도, 검수 화면이
 * 입고단위 입력값과 EA 저장값(예정/누계/이력) 사이를 오가는 것도 전부 이것이다.
 *
 * 상품 마스터 응답과 입고주문 라인 응답 모두 서버가 계산한 inbEaQty를 실어 온다.
 * 값이 없으면 1 — 환산 없음으로 그리는 편이 NaN보다 낫고, 실제 저장은 서버가 막는다.
 */
export const eaQtyPerInbUomOf = (prodOrLine) => prodOrLine?.inbEaQty ?? 1;