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
 * 입고단위(발주단위) 1개 = 낱개(EA) 몇 개인가. 화면의 「환산수량」은 이 낱개 기준이다 —
 * 출고단위 환산은 상품마다 단위(EA/BOX)가 갈려 합계가 어색해서 표시용으로 쓰지 않는다
 * (그쪽은 주문 확정 시 서버의 Prod.toOutbQty()가 ASN 예정수량을 만들 때만 쓴다).
 *
 * 상품 마스터 응답(uoms 포함)과 입고주문 라인 응답(서버가 계산한 inbEaQty) 어느 쪽이 와도 동작한다.
 * 포장이 아직 없는 단위면 1을 돌려준다 — 환산 없음으로 그리는 편이 NaN보다 낫고,
 * 실제 저장은 서버가 막는다.
 */
export const eaQtyPerInbUomOf = (prodOrLine) =>
    prodOrLine?.inbEaQty
    ?? prodOrLine?.uoms?.find(u => u.uomCd === prodOrLine?.inbUomCd)?.eaQty
    ?? 1;

/** 온도대 표시 메타 (라벨/뱃지 색) */
export const TEMP_ZONE_META = {
    DRY: { label: '상온', badge: 'bg-amber-100 text-amber-700' },
    CHL: { label: '냉장', badge: 'bg-sky-100 text-sky-700' },
    FRZ: { label: '냉동', badge: 'bg-indigo-100 text-indigo-700' },
};