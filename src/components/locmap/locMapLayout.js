/**
 * 로케이션 점유 맵의 배치 규칙과 색 규칙 — 화면(StockLocMap)에서 갈라 둔 이유는 둘이다.
 * 하나는 그리는 코드와 「어디에 놓을지 · 무슨 색일지」를 정하는 코드가 섞여 파일이 커졌고,
 * 다른 하나는 배치가 도면의 계약이라 한 곳에서만 바뀌어야 하기 때문이다.
 *
 * <b>자리는 필터로 움직이지 않는다.</b> 존은 온도대(열) × 용도(행) 격자의 고정된 칸에 놓고,
 * 필터에 걸리지 않은 존·칸은 지우는 대신 흐리게 만든다 — 도면은 「무엇이 어디 있는지」를 외우는
 * 그림이라, 필터를 바꿀 때마다 냉동존이 다른 자리로 가면 그 기억이 매번 깨진다.
 */

/** 열 — 실제 센터의 온도대 구획 순서(상온 → 냉장 → 냉동) */
export const TMP_COLS = ['DRY', 'CHL', 'FRZ'];

/** 행 — 용도. 존의 업무구분(biz_dvsn)으로 가른다. 그 외 값은 맨 아래 「기타」로 모은다 */
export const ZONE_ROWS = [
    { key: 'STRG', label: '보관존', dvsn: 'STRG' },
    { key: 'PIKNG', label: '피킹존', dvsn: 'PIKNG' },
    { key: 'RTNGS', label: '반품존', dvsn: 'RTNGS' },
    { key: 'ETC', label: '기타', dvsn: null },
];

const rowKeyOf = (bizDvsn) =>
    ZONE_ROWS.some(r => r.dvsn === bizDvsn) ? bizDvsn : 'ETC';

/** 존 접두를 뗀 나머지에서 [통로, 베이, 레벨]을 읽는다. 끝 두 토큰이 숫자가 아니면 null */
export const parseCell = (locCd, zonCd) => {
    const rest = locCd.startsWith(zonCd + '-') ? locCd.slice(zonCd.length + 1) : locCd;
    const tokens = rest.split('-');
    if (tokens.length < 2) return null;
    const [level, bay] = [tokens[tokens.length - 1], tokens[tokens.length - 2]];
    if (!/^\d+$/.test(level) || !/^\d+$/.test(bay)) return null;
    return { aisle: tokens.slice(0, -2).join('-'), bay, level };
};

export const pctOf = (r) => (r.maxQty ? Math.round((r.onHandQty / r.maxQty) * 100) : null);

// 보충 미달은 서버 판정(fxngShort)을 그대로 쓴다 — 정기보충 산정과 같은 식(현재고 + 지정 상품 유입 < min)이라,
// 여기서 현재고만 보고 다시 계산하면 보충지시가 이미 뜬 자리를 아침마다 미달로 칠해 보충 화면과 어긋난다
export const isShort = (r) => r.fxngShort === true;

/** 상한을 넘겨 쌓인 자리 — 관리자가 가장 먼저 손대야 하는 이상 상태 */
export const isOver = (r) => r.maxQty != null && r.onHandQty > r.maxQty;

/**
 * 존 → 통로 → 칸으로 접고, 통로마다 베이 합산본(구조도용)을 만든다.
 * @param rows    맵 전체 행 (필터로 걸러내지 않는다 — 자리를 고정해야 하므로)
 * @param matches 이 행이 현재 필터에 걸리는지 판정하는 함수. 안 걸리면 dim 처리된다
 */
export const buildZones = (rows, matches) => {
    const byZon = new Map();
    for (const r of rows) {
        if (!byZon.has(r.zonCd)) {
            byZon.set(r.zonCd, {
                zonCd: r.zonCd, zonNm: r.zonNm, bizDvsn: r.bizDvsn, tmpZon: r.tmpZon,
                rowKey: rowKeyOf(r.bizDvsn), all: [], aisles: new Map(), flat: [],
            });
        }
        const zone = byZon.get(r.zonCd);
        const cell = { ...r, dim: !matches(r) };
        zone.all.push(cell);
        const parsed = parseCell(r.locCd, r.zonCd);
        if (!parsed) {
            zone.flat.push(cell);
            continue;
        }
        if (!zone.aisles.has(parsed.aisle)) zone.aisles.set(parsed.aisle, []);
        zone.aisles.get(parsed.aisle).push({ ...cell, ...parsed });
    }

    // 상온 → 냉장 → 냉동. 구조도는 격자가 자리를 정하지만 랙 상세는 이 순서를 그대로 쓴다
    return [...byZon.values()]
        .sort((a, b) => (TMP_COLS.indexOf(a.tmpZon) + 1 || 99) - (TMP_COLS.indexOf(b.tmpZon) + 1 || 99)
            || a.zonCd.localeCompare(b.zonCd))
        .map(zone => {
            const withMax = zone.all.filter(r => r.maxQty != null);
            const capacity = withMax.reduce((s, r) => s + r.maxQty, 0);
            const onHand = withMax.reduce((s, r) => s + r.onHandQty, 0);
            return {
                ...zone,
                dim: zone.all.every(r => r.dim), // 한 칸도 안 걸리면 존 전체를 흐리게
                occupancy: capacity > 0 ? Math.round((onHand / capacity) * 100) : null,
                shortCount: zone.all.filter(isShort).length,
                overCount: zone.all.filter(isOver).length,
                aisles: [...zone.aisles.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([aisle, cells]) => {
                        const bays = [...new Set(cells.map(c => c.bay))].sort();
                        const levels = [...new Set(cells.map(c => c.level))].sort().reverse(); // 레벨 1이 맨 아래
                        const at = new Map(cells.map(c => [`${c.bay}|${c.level}`, c]));
                        const bayAgg = bays.map(bay => {
                            const ls = cells.filter(c => c.bay === bay)
                                .sort((a, b) => a.level.localeCompare(b.level));
                            const lsMax = ls.filter(c => c.maxQty != null);
                            const cap = lsMax.reduce((s, c) => s + c.maxQty, 0);
                            const oh = lsMax.reduce((s, c) => s + c.onHandQty, 0);
                            return {
                                bay, aisle, cells: ls,
                                prefix: ls[0].locCd.slice(0, ls[0].locCd.lastIndexOf('-')),
                                onHand: ls.reduce((s, c) => s + c.onHandQty, 0),
                                aloc: ls.reduce((s, c) => s + c.alocQty, 0),
                                hld: ls.reduce((s, c) => s + c.hldQty, 0),
                                capacity: cap || null,
                                pct: cap > 0 ? Math.round((oh / cap) * 100) : null,
                                fxngs: ls.filter(c => c.fxngProdCd != null),
                                short: ls.some(isShort),
                                over: ls.some(isOver),
                                dim: ls.every(c => c.dim),
                            };
                        });
                        return { aisle, bays, levels, at, bayAgg };
                    }),
            };
        });
};

/** 격자 한 칸(용도 행 × 온도대 열)에 들어갈 존들 — 비어 있으면 빈 칸으로 그려 자리를 유지한다 */
export const gridOf = (zones) => ZONE_ROWS
    .map(row => ({
        ...row,
        cols: TMP_COLS.map(tmpZon => ({
            tmpZon,
            zones: zones.filter(z => z.rowKey === row.key && z.tmpZon === tmpZon),
        })),
    }))
    .filter(row => row.cols.some(c => c.zones.length > 0)); // 그 용도의 존이 하나도 없으면 행 자체를 뺀다

// ── 오버레이 ────────────────────────────────────────────────────────────────
// 같은 도면에 다른 질문을 얹는다. 색이 점유율 하나면 「예약으로 잠긴 자리가 어디냐」·
// 「보충이 급한 자리가 어디냐」에 답하려고 화면을 옮겨야 한다.

/** 칸을 오버레이 공통 형태로 — 구조도(베이 합산)와 랙 상세(로케이션)가 같은 색 규칙을 쓰게 한다 */
export const cellFacts = (x) => ('bay' in x)
    ? { onHand: x.onHand, aloc: x.aloc, hld: x.hld, pct: x.pct, short: x.short, fxng: x.fxngs.length > 0 }
    : { onHand: x.onHandQty, aloc: x.alocQty, hld: x.hldQty, pct: pctOf(x), short: isShort(x), fxng: x.fxngProdCd != null };

/** 점유율 — 농도가 얼마나 찼는지를 말한다 */
const occupancyFill = ({ pct, onHand }) => {
    if (pct == null) return onHand > 0 ? 'bg-indigo-300 text-indigo-950' : null; // 상한 없음
    if (pct > 100) return 'bg-rose-500 text-white';
    if (pct === 100) return 'bg-indigo-600 text-white';
    if (pct >= 75) return 'bg-indigo-500 text-white';
    if (pct >= 50) return 'bg-indigo-400 text-white';
    if (pct >= 25) return 'bg-indigo-200 text-indigo-900';
    if (pct > 0) return 'bg-indigo-100 text-indigo-900';
    return null; // 빈 자리
};

/** 예약·보류 — 「있지만 못 쓰는」 재고 비중. 창고에 있는데 출고에 못 쓰는 물건이 어디 몰렸는지 */
const lockFill = ({ onHand, aloc, hld }) => {
    if (onHand <= 0) return null;
    const locked = Math.round(((aloc + hld) / onHand) * 100);
    if (locked <= 0) return 'bg-emerald-100 text-emerald-900';
    if (locked >= 100) return 'bg-rose-500 text-white';
    if (locked >= 67) return 'bg-amber-500 text-white';
    if (locked >= 34) return 'bg-amber-300 text-amber-950';
    return 'bg-amber-100 text-amber-900';
};

/** 보충상태 — 고정 자리만 색을 갖는다. 비고정 자리는 이 질문의 대상이 아니라 회색 */
const spmtFill = ({ fxng, short }) => {
    if (!fxng) return 'bg-slate-100 text-slate-400';
    return short ? 'bg-amber-400 text-amber-950' : 'bg-emerald-400 text-emerald-950';
};

export const OVERLAYS = [
    {
        key: 'occupancy', label: '점유율', hint: '농도 = 얼마나 찼는지',
        fill: occupancyFill,
        legend: [
            ['bg-white border border-dashed border-slate-300', '빈 자리'],
            ['bg-indigo-100', ''], ['bg-indigo-300', ''], ['bg-indigo-600', '만재'],
            ['bg-rose-500', '초과'],
        ],
    },
    {
        key: 'lock', label: '예약·보류', hint: '보유 중 예약+보류가 차지한 비중 — 있는데 못 쓰는 재고',
        fill: lockFill,
        legend: [
            ['bg-emerald-100', '전량 가용'],
            ['bg-amber-300', ''], ['bg-amber-500', '대부분 잠김'],
            ['bg-rose-500', '전량 잠김'],
        ],
    },
    {
        key: 'spmt', label: '보충상태', hint: '고정 자리만 — 보충이 급한 자리가 어디인지',
        fill: spmtFill,
        legend: [
            ['bg-slate-100', '고정 아님'],
            ['bg-emerald-400', '정상'],
            ['bg-amber-400', '보충 미달'],
        ],
    },
];

export const overlayOf = (key) => OVERLAYS.find(o => o.key === key) ?? OVERLAYS[0];
