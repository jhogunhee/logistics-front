// 재고이력 API (wms-backend 연동)
import api from '@/utils/axios';

export const invHistApi = {
    /** 재고이력 조회. cond: { prodCd, prodNm, locCd, txType, refDocNo, dateFrom, dateTo } — 빈 값 조건은 빼고 보낸다. */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/inventory/history', { params });
    },
};

/** 유형 표시 메타 (라벨/뱃지 색) — 백엔드 TxType과 1:1 */
export const TX_TYPE_META = {
    RECEIVE: { label: '입고', badge: 'bg-emerald-100 text-emerald-700' },
    MOVE:    { label: '이동', badge: 'bg-sky-100 text-sky-700' },
    ADJUST:  { label: '조정', badge: 'bg-violet-100 text-violet-700' },
    PICK:    { label: '피킹', badge: 'bg-amber-100 text-amber-700' },
    SHIP:    { label: '출고확정', badge: 'bg-rose-100 text-rose-700' },
};

/** 유형 검색 드롭다운 옵션 */
export const TX_TYPE_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(TX_TYPE_META).map(([value, m]) => ({ value, label: m.label })),
];