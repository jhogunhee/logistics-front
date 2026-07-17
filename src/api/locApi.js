// 로케이션 마스터 API (wms-backend 연동)
import api from '@/utils/axios';

export const locApi = {
    /** 목록 조회. cond: { locCd, zoneCd, locType } — 빈 값 조건은 빼고 보낸다 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/master/locs', { params });
    },

    /** 신규(C)/수정(U)/삭제(D) 행 일괄 저장. 코드 중복 검증은 서버에서 한다 */
    saveAll(rows) {
        return api.post('/master/locs/bulk', rows);
    },
};

/** 로케이션 유형 표시 메타 */
export const LOC_TYPE_META = {
    STAGE:   { label: '스테이징', badge: 'bg-rose-100 text-rose-700' },
    STORAGE: { label: '보관',     badge: 'bg-emerald-100 text-emerald-700' },
};

/** 존 코드 목록 (존 마스터가 따로 없어 화면 상수로 관리) */
export const ZONE_CODES = ['RCV-STAGE', 'DRY', 'CHL', 'FRZ'];