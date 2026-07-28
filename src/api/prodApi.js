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

/** 온도대 표시 메타 (라벨/뱃지 색) */
export const TEMP_ZONE_META = {
    DRY: { label: '상온', badge: 'bg-amber-100 text-amber-700' },
    CHL: { label: '냉장', badge: 'bg-sky-100 text-sky-700' },
    FRZ: { label: '냉동', badge: 'bg-indigo-100 text-indigo-700' },
};