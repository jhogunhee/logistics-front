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
 * 입고단위 1개 = 출고단위 몇 개인가. 상품 응답의 포장 목록(uoms)에서 낱개를 매개로 파생한다 —
 * 서버의 `Prod.toOutbQty()`와 같은 식이다 (`ea_qty(입고) / ea_qty(출고)`).
 *
 * 환산수량을 상품에 한 칸으로 두지 않기로 해서(docs/design.md 「계량단위와 환산」) 응답에
 * 그런 필드가 없다. 화면이 발주 수량 옆에 「몇 개가 들어오는지」를 미리 보여주려면 여기서 만든다.
 *
 * 포장이 아직 없는 단위면 1을 돌려준다 — 환산 없음으로 그리는 편이 NaN보다 낫고, 실제 저장은
 * 서버가 막는다. 나누어떨어짐은 ProdService·ProdUomService가 저장 시점에 보장한다.
 */
export const cnvrQtyOf = (prod) => {
    const eaQtyOf = (uomCd) => prod?.uoms?.find(u => u.uomCd === uomCd)?.eaQty;
    const inb = eaQtyOf(prod?.inbUomCd);
    const outb = eaQtyOf(prod?.outbUomCd);
    return inb && outb ? inb / outb : 1;
};

/** 온도대 표시 메타 (라벨/뱃지 색) */
export const TEMP_ZONE_META = {
    DRY: { label: '상온', badge: 'bg-amber-100 text-amber-700' },
    CHL: { label: '냉장', badge: 'bg-sky-100 text-sky-700' },
    FRZ: { label: '냉동', badge: 'bg-indigo-100 text-indigo-700' },
};