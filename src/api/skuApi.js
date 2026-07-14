// SKU 마스터 API — 현재는 mock. 백엔드 API가 생기면 함수 내부만 axios 호출로 교체한다.
// (예: list -> api.get('/master/skus', { params }), saveAll -> api.post('/master/skus/bulk', rows))

let seq = 13;
let skus = [
    { skuId: 1,  skuCd: 'SKU-0001', skuNm: '컵라면 (매운맛)',     tempZone: 'DRY', shelfLifeDays: 180 },
    { skuId: 2,  skuCd: 'SKU-0002', skuNm: '생수 2L',            tempZone: 'DRY', shelfLifeDays: 365 },
    { skuId: 3,  skuCd: 'SKU-0003', skuNm: '탄산음료 500ml',      tempZone: 'DRY', shelfLifeDays: 270 },
    { skuId: 4,  skuCd: 'SKU-0004', skuNm: '초코 과자',           tempZone: 'DRY', shelfLifeDays: 240 },
    { skuId: 5,  skuCd: 'SKU-0005', skuNm: '흰우유 1L',           tempZone: 'CHL', shelfLifeDays: 14  },
    { skuId: 6,  skuCd: 'SKU-0006', skuNm: '샌드위치 (햄치즈)',   tempZone: 'CHL', shelfLifeDays: 3   },
    { skuId: 7,  skuCd: 'SKU-0007', skuNm: '요거트 4입',          tempZone: 'CHL', shelfLifeDays: 21  },
    { skuId: 8,  skuCd: 'SKU-0008', skuNm: '슬라이스 햄',         tempZone: 'CHL', shelfLifeDays: 30  },
    { skuId: 9,  skuCd: 'SKU-0009', skuNm: '냉동만두 1kg',        tempZone: 'FRZ', shelfLifeDays: 365 },
    { skuId: 10, skuCd: 'SKU-0010', skuNm: '아이스크림 바',       tempZone: 'FRZ', shelfLifeDays: 540 },
    { skuId: 11, skuCd: 'SKU-0011', skuNm: '냉동피자',            tempZone: 'FRZ', shelfLifeDays: 300 },
    { skuId: 12, skuCd: 'SKU-0012', skuNm: '삼각김밥 (참치)',     tempZone: 'CHL', shelfLifeDays: 2   },
];

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));

export const skuApi = {
    /** 목록 조회. cond: { skuCd, skuNm, tempZone } */
    async list(cond = {}) {
        await delay();
        return skus.filter(s =>
            (!cond.skuCd || s.skuCd.toLowerCase().includes(cond.skuCd.toLowerCase())) &&
            (!cond.skuNm || s.skuNm.toLowerCase().includes(cond.skuNm.toLowerCase())) &&
            (!cond.tempZone || s.tempZone === cond.tempZone)
        ).map(s => ({ ...s }));
    },

    /** 신규(C)/수정(U) 행 일괄 저장 */
    async saveAll(rows) {
        await delay();
        for (const row of rows) {
            if (row._status === 'C') {
                if (skus.some(s => s.skuCd === row.skuCd)) {
                    throw new Error(`이미 존재하는 SKU 코드입니다: ${row.skuCd}`);
                }
                skus.push({ skuId: seq++, skuCd: row.skuCd, skuNm: row.skuNm, tempZone: row.tempZone, shelfLifeDays: Number(row.shelfLifeDays) });
            } else if (row._status === 'U') {
                const target = skus.find(s => s.skuId === row.skuId);
                if (target) {
                    target.skuNm = row.skuNm;
                    target.tempZone = row.tempZone;
                    target.shelfLifeDays = Number(row.shelfLifeDays);
                }
            }
        }
    },
};

/** 온도대 표시 메타 (라벨/뱃지 색) */
export const TEMP_ZONE_META = {
    DRY: { label: '상온', badge: 'bg-amber-100 text-amber-700' },
    CHL: { label: '냉장', badge: 'bg-sky-100 text-sky-700' },
    FRZ: { label: '냉동', badge: 'bg-indigo-100 text-indigo-700' },
};
