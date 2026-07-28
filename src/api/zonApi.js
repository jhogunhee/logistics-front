// 존 마스터 API (wms-backend 연동). 존은 로케이션의 상위 그룹이다.
import api from '@/utils/axios';

export const zonApi = {
    /** 목록 조회. cond: { zonCd, tmpZon, bizDvsn } — 빈 값 조건은 빼고 보낸다 */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/master/zons', { params });
    },

    /** 신규(C)/수정(U)/삭제(D) 행 일괄 저장. 코드 중복·하위 로케이션 검증은 서버에서 한다 */
    saveAll(rows) {
        return api.post('/master/zons/bulk', rows);
    },
};

/** 보관유형 표시 메타 (공통코드 STRG_TYP) */
export const STRG_TYP_META = {
    RACK: { label: '랙',   badge: 'bg-sky-100 text-sky-700' },
    FLAT: { label: '평치', badge: 'bg-lime-100 text-lime-700' },
    VRTL: { label: '가상', badge: 'bg-slate-100 text-slate-600' },
};

/** 업무구분 표시 메타 (공통코드 BIZ_DVSN) */
export const BIZ_DVSN_META = {
    INB:   { label: '입고작업', badge: 'bg-blue-100 text-blue-700' },
    OUTB:  { label: '출고작업', badge: 'bg-violet-100 text-violet-700' },
    STRG:  { label: '보관',     badge: 'bg-emerald-100 text-emerald-700' },
    PIKNG: { label: '피킹',     badge: 'bg-amber-100 text-amber-700' },
    RTNGS: { label: '반품',     badge: 'bg-rose-100 text-rose-700' },
    WRK:   { label: '작업',     badge: 'bg-slate-100 text-slate-600' },
};
