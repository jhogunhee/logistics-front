// 로케이션 마스터 API — 현재는 mock. 백엔드 API가 생기면 함수 내부만 axios 호출로 교체한다.

let seq = 11;
let locs = [
    { locId: 1,  locCd: 'RCV-STAGE',   zoneCd: 'RCV-STAGE', tempZone: 'DRY', locType: 'STAGE',   pickPrty: 0 },
    { locId: 2,  locCd: 'DRY-A-01-01', zoneCd: 'DRY',       tempZone: 'DRY', locType: 'STORAGE', pickPrty: 1 },
    { locId: 3,  locCd: 'DRY-A-01-02', zoneCd: 'DRY',       tempZone: 'DRY', locType: 'STORAGE', pickPrty: 2 },
    { locId: 4,  locCd: 'DRY-A-02-01', zoneCd: 'DRY',       tempZone: 'DRY', locType: 'STORAGE', pickPrty: 3 },
    { locId: 5,  locCd: 'DRY-B-01-01', zoneCd: 'DRY',       tempZone: 'DRY', locType: 'STORAGE', pickPrty: 4 },
    { locId: 6,  locCd: 'CHL-A-01-01', zoneCd: 'CHL',       tempZone: 'CHL', locType: 'STORAGE', pickPrty: 1 },
    { locId: 7,  locCd: 'CHL-A-01-02', zoneCd: 'CHL',       tempZone: 'CHL', locType: 'STORAGE', pickPrty: 2 },
    { locId: 8,  locCd: 'CHL-B-01-01', zoneCd: 'CHL',       tempZone: 'CHL', locType: 'STORAGE', pickPrty: 3 },
    { locId: 9,  locCd: 'FRZ-A-01-01', zoneCd: 'FRZ',       tempZone: 'FRZ', locType: 'STORAGE', pickPrty: 1 },
    { locId: 10, locCd: 'FRZ-A-01-02', zoneCd: 'FRZ',       tempZone: 'FRZ', locType: 'STORAGE', pickPrty: 2 },
];

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));

export const locApi = {
    /** 목록 조회. cond: { locCd, zoneCd, locType } */
    async list(cond = {}) {
        await delay();
        return locs.filter(l =>
            (!cond.locCd || l.locCd.toLowerCase().includes(cond.locCd.toLowerCase())) &&
            (!cond.zoneCd || l.zoneCd === cond.zoneCd) &&
            (!cond.locType || l.locType === cond.locType)
        ).map(l => ({ ...l }));
    },

    /** 신규(C)/수정(U) 행 일괄 저장 */
    async saveAll(rows) {
        await delay();
        for (const row of rows) {
            if (row._status === 'C') {
                if (locs.some(l => l.locCd === row.locCd)) {
                    throw new Error(`이미 존재하는 로케이션 코드입니다: ${row.locCd}`);
                }
                locs.push({ locId: seq++, locCd: row.locCd, zoneCd: row.zoneCd, tempZone: row.tempZone, locType: row.locType, pickPrty: Number(row.pickPrty) });
            } else if (row._status === 'U') {
                const target = locs.find(l => l.locId === row.locId);
                if (target) {
                    target.zoneCd = row.zoneCd;
                    target.tempZone = row.tempZone;
                    target.locType = row.locType;
                    target.pickPrty = Number(row.pickPrty);
                }
            }
        }
    },
};

/** 로케이션 유형 표시 메타 */
export const LOC_TYPE_META = {
    STAGE:   { label: '스테이징', badge: 'bg-rose-100 text-rose-700' },
    STORAGE: { label: '보관',     badge: 'bg-emerald-100 text-emerald-700' },
};
