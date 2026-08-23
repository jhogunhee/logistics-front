import { useEffect, useMemo, useState } from 'react';
import { PackageSearch, Pin, Table2, TriangleAlert, Truck, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { invApi } from '@/api/invApi';
import { BIZ_DVSN_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { num } from '@/utils/format';
import { Badge } from '@/components/common/Badge';
import { StatTile } from '@/components/common/StatTile';
import { ProdThumb } from '@/components/common/ProdThumb';

/**
 * 로케이션 점유 맵 — 두 모드.
 * · 구조도(기본): 센터 평면도 — U자형. 입고·출고 도크가 아래 한 면에 나란하고, 존 룸(통로별
 *   랙 라인, 칸 = 베이로 레벨 합산)은 중앙 섬. 동선은 입고장에서 올라가 건물 가장자리를 따라
 *   돌아 출고장으로 내려오는 큰 U자 하나로 그린다. 위에서 내려다본 그림이라 레벨은 칸 하나로
 *   합치고, 클릭하면 레벨·상품 상세를 펼친다.
 * · 랙 상세: 존 → 통로 → 베이×레벨 입면. 셀은 점유율만큼 아래에서 차오르는 채움(레벨 1이 맨 아래).
 * 로케이션 코드에서 존 접두를 뗀 뒤 끝 두 토큰이 숫자면 베이·레벨로 읽고, 아니면 존 끝에 단순 나열한다.
 *
 * 현재고 조회(`StockStatus`)의 「맵」 탭으로 들어간다. 한때 독립 화면으로 갈랐다가 되돌린 것인데,
 * 갈랐던 이유(모집단·검색조건·요약지표·API가 표와 다르다)는 **둘을 동시에 띄우는 것**을 막는 근거지
 * 탭을 막는 근거가 아니었다 — 탭이면 한 번에 하나만 보이므로 각자 자기 조회를 그대로 갖는다.
 * 갈랐을 때 얻었던 딥링크는 탭 상태를 쿼리스트링(`?view=map&locCd=…`)에 두어 그대로 유지한다.
 *
 * 화면 제목·탭 버튼은 부모(`StockStatus`)가 그린다. 여기서는 요약·필터·맵·상세 패널만 그린다.
 * @param focusLocCd 표에서 건너온 로케이션 — 조건이 아니라 「선택 + 포커스」로 해석한다
 * @param onGoTable  표 탭으로 건너가기. 인자로 준 locCd가 표의 검색조건이 된다
 */

const pctOf = (r) => (r.maxQty ? Math.round((r.onHandQty / r.maxQty) * 100) : null);
// 보충 미달은 서버 판정(fxngShort)을 그대로 쓴다 — 정기보충 산정과 같은 식(현재고 + 지정 상품 유입 < min)이라,
// 여기서 현재고만 보고 다시 계산하면 보충지시가 이미 뜬 자리를 아침마다 미달로 칠해 보충 화면과 어긋난다
const isShort = (r) => r.fxngShort === true;
// 「현재고/min」에 오고 있는 지시 잔량을 덧붙인다 — min 아래인데 미달이 아닌 칸의 이유가 읽히게
const fxngQtyText = (r) => `${num(r.fxngOnHandQty)}/${num(r.fxngMinQty)}`
    + (r.fxngInflowQty > 0 ? ` (+유입 ${num(r.fxngInflowQty)})` : '');

// 랙 상세 채움 색 — 높이가 점유율을 말하므로 색은 상태만 가른다: 정상 indigo, 초과만 rose
const fillColor = (pct) => (pct > 100 ? 'bg-rose-500' : pct === 100 ? 'bg-indigo-600' : 'bg-indigo-400');

// 구조도 칸 색 — 평면도는 높이를 못 쓰니 농도가 점유율을 말한다
const planFill = (pct, onHand) => {
    if (pct == null) return onHand > 0 ? 'bg-indigo-300 text-indigo-950' : null; // 상한 없음
    if (pct > 100) return 'bg-rose-500 text-white';
    if (pct === 100) return 'bg-indigo-600 text-white';
    if (pct >= 75) return 'bg-indigo-500 text-white';
    if (pct >= 50) return 'bg-indigo-400 text-white';
    if (pct >= 25) return 'bg-indigo-200 text-indigo-900';
    if (pct > 0) return 'bg-indigo-100 text-indigo-900';
    return null; // 빈 자리
};

// 존 룸 배치 순서 — 실제 센터처럼 상온 → 냉장 → 냉동
const TMP_ORDER = { DRY: 0, CHL: 1, FRZ: 2 };

/** 존 접두를 뗀 나머지에서 [통로, 베이, 레벨]을 읽는다. 끝 두 토큰이 숫자가 아니면 null */
const parseCell = (locCd, zonCd) => {
    const rest = locCd.startsWith(zonCd + '-') ? locCd.slice(zonCd.length + 1) : locCd;
    const tokens = rest.split('-');
    if (tokens.length < 2) return null;
    const [level, bay] = [tokens[tokens.length - 1], tokens[tokens.length - 2]];
    if (!/^\d+$/.test(level) || !/^\d+$/.test(bay)) return null;
    return { aisle: tokens.slice(0, -2).join('-'), bay, level };
};

export default function StockLocMap({ focusLocCd, onGoTable }) {
    const [rows, setRows] = useState(null);
    const [stageRows, setStageRows] = useState([]);
    const [mode, setMode] = useState('plan'); // plan(구조도) | rack(랙 상세)
    const [tmpZon, setTmpZon] = useState('');
    const [zonCd, setZonCd] = useState('');
    const [shortOnly, setShortOnly] = useState(false);
    const [sel, setSel] = useState(null); // 오른쪽 패널이 보여줄 선택 — selOfLoc / selOfBay
    const [tip, setTip] = useState(null); // { r | bay, x, y }

    const selectLoc = (r) => setSel(selOfLoc(r));
    const selectBay = (b) => setSel(selOfBay(b));

    /*
     * 표에서 건너온 로케이션 — 맵에는 로케이션 필터가 없으므로(필터는 온도대·존·보충미달)
     * 조건이 아니라 「선택 + 포커스」로 해석한다. 그 존만 남겨 찾기 쉽게 하고 상세패널을 연다.
     * 스테이징은 맵에 없는 자리라(STORAGE 전건) 못 찾는 것이 정상 — 그때는 안내만 한다.
     * 조회 응답 안에서 처리한다 — 별도 effect로 빼면 같은 API를 두 번 부르게 된다.
     */
    useEffect(() => {
        invApi.locMap()
            .then((loaded) => {
                setRows(loaded);
                if (!focusLocCd) return;
                const hit = loaded.find(r => r.locCd === focusLocCd);
                if (!hit) {
                    toast(`맵에 없는 로케이션입니다: ${focusLocCd} (보관 로케이션만 표시합니다)`);
                    return;
                }
                setZonCd(hit.zonCd);
                setSel(selOfLoc(hit));
            })
            .catch((e) => {
                toast.error(e.message || '로케이션 맵 조회에 실패했습니다.');
                setRows([]);
            });
        invApi.list({ locTyp: 'STAGE' }).then(setStageRows).catch(() => setStageRows([]));
    }, [focusLocCd]);

    const zonOptions = useMemo(
        () => [...new Map((rows ?? []).map(r => [r.zonCd, r.zonNm])).entries()],
        [rows],
    );

    const filtered = useMemo(() => (rows ?? []).filter(r =>
        (!tmpZon || r.tmpZon === tmpZon) && (!zonCd || r.zonCd === zonCd) && (!shortOnly || isShort(r))),
    [rows, tmpZon, zonCd, shortOnly]);

    // 요약 — 필터된 범위 기준. 점유율은 수량 가중(Σ보유 ÷ Σ상한)
    const summary = useMemo(() => {
        const withMax = filtered.filter(r => r.maxQty != null);
        const onHand = withMax.reduce((s, r) => s + r.onHandQty, 0);
        const capacity = withMax.reduce((s, r) => s + r.maxQty, 0);
        return {
            total: filtered.length,
            empty: filtered.filter(r => r.onHandQty === 0).length,
            fxng: filtered.filter(r => r.fxngProdCd != null).length,
            short: filtered.filter(isShort).length,
            occupancy: capacity > 0 ? Math.round((onHand / capacity) * 100) : null,
        };
    }, [filtered]);

    // 스테이징 재고 합 — 입고장(RCV-STAGE)·출고장(SHIP-STAGE) 도크에 표기
    const docks = useMemo(() => {
        const byLoc = new Map();
        for (const s of stageRows) {
            if (!byLoc.has(s.locCd)) byLoc.set(s.locCd, { locCd: s.locCd, onHand: 0, prods: new Set() });
            const d = byLoc.get(s.locCd);
            d.onHand += Number(s.onHandQty);
            d.prods.add(s.prodCd);
        }
        const of = (cd) => byLoc.get(cd) ?? { locCd: cd, onHand: 0, prods: new Set() };
        return { rcv: of('RCV-STAGE'), ship: of('SHIP-STAGE') };
    }, [stageRows]);

    // 존 → 통로 → 셀. 통로 안은 베이(열)×레벨(행), 구조도용으로 베이 합산본도 만든다
    const zones = useMemo(() => {
        const byZon = new Map();
        for (const r of filtered) {
            if (!byZon.has(r.zonCd)) {
                byZon.set(r.zonCd, { zonCd: r.zonCd, zonNm: r.zonNm, bizDvsn: r.bizDvsn, tmpZon: r.tmpZon, all: [], aisles: new Map(), flat: [] });
            }
            const zone = byZon.get(r.zonCd);
            zone.all.push(r);
            const cell = parseCell(r.locCd, r.zonCd);
            if (!cell) {
                zone.flat.push(r);
                continue;
            }
            if (!zone.aisles.has(cell.aisle)) zone.aisles.set(cell.aisle, []);
            zone.aisles.get(cell.aisle).push({ ...r, ...cell });
        }

        return [...byZon.values()]
            .sort((a, b) => (TMP_ORDER[a.tmpZon] ?? 9) - (TMP_ORDER[b.tmpZon] ?? 9) || a.zonCd.localeCompare(b.zonCd))
            .map(zone => {
                const withMax = zone.all.filter(r => r.maxQty != null);
                const capacity = withMax.reduce((s, r) => s + r.maxQty, 0);
                const onHand = withMax.reduce((s, r) => s + r.onHandQty, 0);
                return {
                    ...zone,
                    occupancy: capacity > 0 ? Math.round((onHand / capacity) * 100) : null,
                    aisles: [...zone.aisles.entries()]
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([aisle, cells]) => {
                            const bays = [...new Set(cells.map(c => c.bay))].sort();
                            const levels = [...new Set(cells.map(c => c.level))].sort().reverse(); // 레벨 1이 맨 아래
                            const at = new Map(cells.map(c => [`${c.bay}|${c.level}`, c]));
                            const bayAgg = bays.map(bay => {
                                const ls = cells.filter(c => c.bay === bay).sort((a, b) => a.level.localeCompare(b.level));
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
                                };
                            });
                            return { aisle, bays, levels, at, bayAgg };
                        }),
                };
            });
    }, [filtered]);

    if (rows == null) return <p className="text-sm text-slate-400 py-8 text-center">조회 중…</p>;

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 요약 지표 */}
            <div className="flex gap-3">
                <StatTile label="전체 점유율" value={summary.occupancy != null ? `${summary.occupancy}%` : '—'}
                          sub="Σ보유 ÷ Σ상한" />
                <StatTile label="보관 로케이션" value={num(summary.total)} />
                <StatTile label="빈 자리" value={num(summary.empty)} accent="text-slate-500" />
                <StatTile label="고정 자리" value={num(summary.fxng)} accent="text-indigo-600" />
                <StatTile label="보충 미달" value={num(summary.short)} accent={summary.short > 0 ? 'text-amber-600' : 'text-slate-300'} />
            </div>

            {/* 모드 · 필터 + 범례 */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                    <button onClick={() => { setMode('plan'); setTip(null); }}
                            title="센터 평면도 — 칸 = 랙 자리(레벨 합산), 농도 = 점유율"
                            className={`px-2.5 py-1.5 ${mode === 'plan'
                                ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                        구조도
                    </button>
                    <button onClick={() => { setMode('rack'); setTip(null); }}
                            title="랙 입면 — 칸 = 레벨 하나, 채움 높이 = 점유율"
                            className={`px-2.5 py-1.5 border-l border-slate-200 ${mode === 'rack'
                                ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                        랙 상세
                    </button>
                </div>
                <select value={tmpZon} onChange={(e) => setTmpZon(e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 bg-white">
                    <option value="">온도대 전체</option>
                    {Object.entries(TEMP_ZONE_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                </select>
                <select value={zonCd} onChange={(e) => setZonCd(e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 bg-white">
                    <option value="">존 전체</option>
                    {zonOptions.map(([cd, nm]) => <option key={cd} value={cd}>{cd} · {nm}</option>)}
                </select>
                <button onClick={() => setShortOnly(v => !v)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${shortOnly
                            ? 'bg-amber-50 border-amber-300 text-amber-700'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300'}`}>
                    <TriangleAlert size={12} /> 보충 미달만
                </button>

                <div className="flex items-center gap-2.5 ml-auto text-[11px] text-slate-500">
                    {mode === 'plan' ? (
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-3.5 h-3.5 rounded-[3px] bg-white border border-dashed border-slate-300" />
                            <span className="inline-block w-3.5 h-3.5 rounded-[3px] bg-indigo-100" />
                            <span className="inline-block w-3.5 h-3.5 rounded-[3px] bg-indigo-300" />
                            <span className="inline-block w-3.5 h-3.5 rounded-[3px] bg-indigo-600" />
                            <span className="inline-block w-3.5 h-3.5 rounded-[3px] bg-rose-500" />
                            빈 자리 → 만재 → 초과
                        </span>
                    ) : (
                        <>
                            <span className="flex items-center gap-1.5">
                                <span className="relative inline-block w-3.5 h-3.5 rounded-[3px] bg-slate-100 border border-slate-200 overflow-hidden">
                                    <span className="absolute bottom-0 inset-x-0 h-[55%] bg-indigo-400" />
                                </span>
                                채움 = 점유율
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="inline-block w-3.5 h-3.5 rounded-[3px] bg-rose-500" />초과
                            </span>
                        </>
                    )}
                    <span className="flex items-center gap-1 pl-2 border-l border-slate-200">
                        <Pin size={12} className="text-indigo-600" />고정상품
                    </span>
                    <span className="flex items-center gap-1">
                        <TriangleAlert size={12} className="text-amber-500" />보충 미달
                    </span>
                </div>
            </div>

            {/* 맵(왼쪽) + 선택한 자리의 재고(오른쪽) — 패널을 상시 두어 칸을 눌러도 맵이 다시 배치되지 않는다 */}
            <div className="flex-1 min-h-0 flex gap-3">
            {mode === 'plan' ? (
                /* ── 구조도: 센터 평면도 — 방안지 바닥 · 벽에 박힌 도크 도어 · 통로로 갈린 랙 블록 ── */
                <div className="flex-1 min-w-0 min-h-0 overflow-auto pb-2">
                    <div className="min-w-fit min-h-full relative flex flex-col
                            border-[3px] border-slate-400 rounded-lg bg-slate-50 overflow-hidden">
                        <FloorGrid />
                        {/* 도크 벽 — 입고·출고 도어가 같은 면에 있는 것이 U자형의 핵심 */}
                        <div className="relative flex items-start">
                            <DockDoor label="입고 도크" dock={docks.rcv} tone="border-emerald-500"
                                      onClick={() => selectLoc(dockLoc(docks.rcv))} />
                            <div className="flex-1 border-t-[6px] border-slate-300" />
                            <DockDoor label="출고 도크" dock={docks.ship} tone="border-rose-400" flip
                                      onClick={() => selectLoc(dockLoc(docks.ship))} />
                        </div>
                        <div className="relative flex-1 min-h-64">
                            <UFlowArrow />
                            {zones.length === 0 ? (
                                <p className="text-sm text-slate-400 py-10 text-center">조건에 맞는 보관 로케이션이 없습니다.</p>
                            ) : (
                                <div className="relative px-16 pt-6 pb-10 flex flex-wrap gap-x-6 gap-y-5 justify-center items-start">
                                    {zones.map(zone => (
                                        <PlanZoneRoom key={zone.zonCd} zone={zone} selCd={sel?.query}
                                                      onBay={selectBay} onLoc={selectLoc} onHover={setTip} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* ── 랙 상세: 존 → 통로 → 베이×레벨 입면 ── */
                <div className="flex-1 min-w-0 min-h-0 overflow-auto flex flex-col gap-4 pb-2">
                    {zones.length === 0 && (
                        <p className="text-sm text-slate-400 py-8 text-center">조건에 맞는 보관 로케이션이 없습니다.</p>
                    )}
                    {zones.map(zone => (
                        <section key={zone.zonCd} className="bg-white border border-slate-200 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <h3 className="text-sm font-bold text-slate-700">{zone.zonCd}</h3>
                                <span className="text-xs text-slate-400">{zone.zonNm}</span>
                                <Badge meta={BIZ_DVSN_META} value={zone.bizDvsn} show="label" />
                                <Badge meta={TEMP_ZONE_META} value={zone.tmpZon} />
                                <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
                                    <span>{num(zone.all.length)}자리</span>
                                    {zone.occupancy != null && (
                                        <>
                                            <span className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                <span className={`block h-full rounded-full ${zone.occupancy > 100 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                                                      style={{ width: `${Math.min(zone.occupancy, 100)}%` }} />
                                            </span>
                                            <span className="font-medium text-slate-500 tabular-nums">점유 {zone.occupancy}%</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-6 flex-wrap items-end">
                                {zone.aisles.map(({ aisle, bays, levels, at }) => (
                                    <div key={aisle || '(단일)'} className="flex flex-col gap-1">
                                        {aisle && <span className="text-[11px] font-bold text-slate-400">통로 {aisle}</span>}
                                        <div className="grid gap-1"
                                             style={{ gridTemplateColumns: `repeat(${bays.length}, minmax(0, 1fr))` }}>
                                            {levels.map(level => bays.map(bay => {
                                                const cell = at.get(`${bay}|${level}`);
                                                return cell
                                                    ? <MapCell key={`${bay}|${level}`} r={cell}
                                                               selected={sel?.query === cell.locCd}
                                                               onClick={() => selectLoc(cell)}
                                                               onHover={setTip} />
                                                    : <span key={`${bay}|${level}`} />;
                                            }))}
                                        </div>
                                        <div className="grid gap-1"
                                             style={{ gridTemplateColumns: `repeat(${bays.length}, minmax(0, 1fr))` }}>
                                            {bays.map(bay => (
                                                <span key={bay} className="text-center text-[10px] text-slate-400">{bay}</span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {zone.flat.map(r => (
                                    <MapCell key={r.locId} r={r} wide selected={sel?.query === r.locCd}
                                             onClick={() => selectLoc(r)} onHover={setTip} />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}

                <DetailPanel sel={sel} onClose={() => setSel(null)} onGoTable={onGoTable} />
            </div>

            {tip && (tip.bay ? <BayTooltip tip={tip} /> : <CellTooltip tip={tip} />)}
        </div>
    );
}

/** 도크도 상한·고정상품이 없는 로케이션일 뿐이라 같은 선택 형태로 만든다 */
const dockLoc = (dock) => ({ locCd: dock.locCd, onHandQty: dock.onHand, alocQty: null, hldQty: null, maxQty: null, fxngProdCd: null });

/** 로케이션 한 칸 선택 — 패널이 쓰는 공통 형태. query가 재고 조회 조건(locCd 부분일치)이다 */
const selOfLoc = (r) => ({
    query: r.locCd, title: r.locCd, tmpZon: r.tmpZon,
    onHand: r.onHandQty, capacity: r.maxQty, aloc: r.alocQty, hld: r.hldQty, pct: pctOf(r),
    levels: null, fxngs: r.fxngProdCd != null ? [r] : [], showLoc: false,
});

/** 랙 자리(베이) 선택 — 전 레벨 합산. 부분일치라 prefix 하나로 레벨이 다 걸린다 */
const selOfBay = (b) => ({
    query: b.prefix, title: b.prefix, tmpZon: b.cells[0]?.tmpZon,
    onHand: b.onHand, capacity: b.capacity, aloc: b.aloc, hld: b.hld, pct: b.pct,
    levels: b.cells, fxngs: b.fxngs, showLoc: true,
});

/** 방안지 바닥 — 평면도로 읽히게 하는 배경. 클릭을 가리지 않는다 */
const FloorGrid = () => (
    <div className="absolute inset-0 pointer-events-none"
         style={{
             backgroundImage: 'linear-gradient(to right, rgb(148 163 184 / 0.18) 1px, transparent 1px),'
                 + 'linear-gradient(to bottom, rgb(148 163 184 / 0.18) 1px, transparent 1px)',
             backgroundSize: '22px 22px',
         }} />
);

/** 도크 도어 — 벽(굵은 윗선)에 박힌 색 구간. 아래로 스테이징 재고 카드가 붙는다 */
const DockDoor = ({ label, dock, tone, onClick, flip }) => (
    <button onClick={onClick}
            title={`${dock.locCd} — 클릭하면 재고 상세`}
            className={`shrink-0 w-48 border-t-[6px] ${tone} bg-white/85 rounded-b-lg px-3 py-2
                flex items-center gap-2.5 hover:bg-white transition-colors`}>
        <Truck size={16} className={`text-slate-400 ${flip ? 'scale-x-[-1]' : ''}`} />
        <span className="flex flex-col items-start leading-tight">
            <span className="text-[11px] font-bold text-slate-600">{label}</span>
            <span className="text-[9px] text-slate-400 font-mono">{dock.locCd}</span>
        </span>
        <span className="ml-auto flex flex-col items-end leading-tight">
            <span className="text-sm font-bold tabular-nums text-slate-700">{num(dock.onHand)}</span>
            <span className="text-[9px] text-slate-400">{dock.prods.size > 0 ? `${num(dock.prods.size)}종` : '비어 있음'}</span>
        </span>
    </button>
);

/** 존 룸 색 — 온도대로 구획을 나눈다(평면도 관례). 칸의 점유율 색과 겹치지 않게 아주 옅게 */
const ROOM_TINT = {
    DRY: 'border-amber-300/80 bg-amber-50/60',
    CHL: 'border-sky-300/80 bg-sky-50/60',
    FRZ: 'border-cyan-400/80 bg-cyan-50/60',
};

/** 존 룸 — 통로(가로줄) 하나가 랙 한 줄. 칸은 틈 없이 붙여 랙 바처럼 보이게 한다 */
const PlanZoneRoom = ({ zone, selCd, onBay, onLoc, onHover }) => (
    <section className={`relative rounded-lg border-2 px-3 pt-2 pb-3 flex flex-col gap-1.5 overflow-hidden
            ${ROOM_TINT[zone.tmpZon] ?? 'border-slate-300 bg-white/70'}`}>
        {/* 존 코드 워터마크 — 실제 평면도가 구역에 큰 글자를 박는 방식 */}
        <span className="absolute -bottom-3 right-1 text-4xl font-black text-slate-900/[0.05] tracking-tight select-none">
            {zone.zonCd}
        </span>
        <div className="relative flex items-center gap-1.5 whitespace-nowrap">
            <h3 className="text-xs font-bold text-slate-700">{zone.zonCd}</h3>
            <Badge meta={TEMP_ZONE_META} value={zone.tmpZon} show="label" />
            <span className="ml-auto pl-3 text-[10px] text-slate-400 tabular-nums">
                {zone.occupancy != null ? `${zone.occupancy}%` : `${num(zone.all.length)}자리`}
            </span>
        </div>
        <div className="relative flex flex-col gap-2.5">
            {zone.aisles.map(({ aisle, bayAgg }) => (
                <div key={aisle || '(단일)'} className="flex items-center gap-1.5">
                    {aisle && <span className="w-3 text-[9px] font-bold text-slate-400 text-center">{aisle}</span>}
                    {/* 랙 바 — 칸 사이 1px이 랙 프레임처럼 보인다 */}
                    <div className="flex gap-px bg-slate-400/60 rounded-[3px] overflow-hidden ring-1 ring-slate-400/60">
                        {bayAgg.map(b => (
                            <PlanCell key={b.bay} b={b} selected={selCd === b.prefix}
                                      onClick={() => onBay(b)} onHover={onHover} />
                        ))}
                    </div>
                </div>
            ))}
            {zone.flat.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                    {zone.flat.map(r => (
                        <MapCell key={r.locId} r={r} wide selected={selCd === r.locCd}
                                 onClick={() => onLoc(r)} onHover={onHover} />
                    ))}
                </div>
            )}
        </div>
    </section>
);

/** U자 동선 — 입고장에서 내려가 건물 안쪽을 돌아 출고장으로 올라온다 */
const UFlowArrow = () => (
    <svg className="absolute inset-0 w-full h-full text-indigo-300 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
            <marker id="uFlowHead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
            </marker>
        </defs>
        <path d="M 5 0 L 5 84 Q 5 94 15 94 L 85 94 Q 95 94 95 84 L 95 6"
              fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="9 6" opacity="0.45"
              vectorEffect="non-scaling-stroke" markerEnd="url(#uFlowHead)" />
    </svg>
);

/** 구조도 칸 — 랙 자리 하나(레벨 합산). 농도 = 점유율 */
const PlanCell = ({ b, selected, onClick, onHover }) => {
    const fill = planFill(b.pct, b.onHand);
    // 링은 하나만 — 랙 바가 overflow-hidden이라 바깥 outline은 잘린다
    const ring = selected ? 'ring-2 ring-inset ring-slate-900'
        : b.short ? 'ring-2 ring-inset ring-amber-400' : '';

    return (
        <button onClick={onClick}
                onMouseEnter={(e) => onHover({ bay: b, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => onHover({ bay: b, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => onHover(null)}
                className={`relative w-11 h-8 flex items-center justify-center
                    text-[11px] font-medium tabular-nums
                    transition-[filter] hover:brightness-95 hover:z-10
                    ${fill ?? 'bg-white text-slate-400'} ${ring} ${selected ? 'z-10' : ''}`}>
            <span>{b.bay}</span>
            {b.fxngs.length > 0 && (
                <Pin size={10} className={`absolute top-0.5 right-0.5 ${fill?.includes('text-white') ? 'text-white/85' : 'text-indigo-600'}`} />
            )}
            {b.short && <TriangleAlert size={10} className="absolute bottom-0.5 right-0.5 text-amber-500 fill-amber-100" />}
        </button>
    );
};

const MapCell = ({ r, wide, selected, onClick, onHover }) => {
    const pct = pctOf(r);
    const short = isShort(r);
    const empty = pct == null || pct === 0;
    const height = pct == null ? 0 : Math.min(Math.max(pct, pct > 0 ? 8 : 0), 100); // 미량도 보이게 최소 8%

    return (
        <button onClick={onClick}
                onMouseEnter={(e) => onHover({ r, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => onHover({ r, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => onHover(null)}
                className={`relative h-11 ${wide ? 'px-3' : 'w-16'} rounded-md overflow-hidden
                    flex items-start justify-center pt-1 text-[11px] font-medium tabular-nums
                    transition-transform hover:scale-105 hover:z-10 hover:shadow-md
                    ${empty
                        ? 'bg-white border border-dashed border-slate-300 text-slate-400'
                        : 'bg-slate-100 border border-slate-200 text-slate-600'}
                    ${selected ? 'ring-2 ring-inset ring-slate-900 z-10' : short ? 'ring-2 ring-amber-400' : ''}`}>
            {/* 점유율만큼 아래에서 차오르는 채움 */}
            {!empty && (
                <span className={`absolute bottom-0 inset-x-0 ${fillColor(pct)} opacity-90`}
                      style={{ height: `${height}%` }} />
            )}
            <span className={`relative ${pct >= 75 ? 'text-white' : ''}`}>
                {wide ? r.locCd : `${r.bay}-${r.level}`}
            </span>
            {/* 고정 자리는 「이 자리는 이 상품 자리」를 그림으로 — 이미지가 없으면 압정으로 되돌아간다.
                구조도(PlanCell)에는 넣지 않는다: 거긴 베이 합산이라 레벨마다 다른 고정상품을 하나로 대표할 수 없다 */}
            {r.fxngProdCd && (r.fxngProdImgUrl
                ? <span className="absolute top-1 right-1"><ProdThumb src={r.fxngProdImgUrl} alt={r.fxngProdNm} size={18} /></span>
                : <Pin size={11} className={`absolute top-1 right-1 ${pct >= 75 ? 'text-white/85' : 'text-indigo-600'}`} />
            )}
            {short && <TriangleAlert size={11} className="absolute bottom-1 right-1 text-amber-500 fill-amber-100" />}
        </button>
    );
};

/** 커서 따라다니는 셀 툴팁 — 화면 오른쪽·아래 끝에서는 반대쪽으로 펼친다 */
const CellTooltip = ({ tip }) => {
    const { r, x, y } = tip;
    const pct = pctOf(r);
    const short = isShort(r);
    const flipX = x > window.innerWidth - 280;
    const flipY = y > window.innerHeight - 170;

    return (
        <div className="fixed z-50 pointer-events-none w-64 bg-slate-800 text-white rounded-lg shadow-xl px-3 py-2.5 text-xs"
             style={{ left: flipX ? x - 268 : x + 14, top: flipY ? y - 150 : y + 14 }}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-mono font-bold">{r.locCd}</span>
                <span className={`font-bold tabular-nums ${pct > 100 ? 'text-rose-300' : 'text-indigo-300'}`}>
                    {pct != null ? `${pct}%` : '상한 없음'}
                </span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center mb-1">
                {[['보유', r.onHandQty], ['상한', r.maxQty], ['할당', r.alocQty], ['보류', r.hldQty]].map(([l, v]) => (
                    <div key={l} className="bg-white/10 rounded px-1 py-0.5">
                        <div className="text-[10px] text-slate-300">{l}</div>
                        <div className="font-bold tabular-nums">{v != null ? num(v) : '—'}</div>
                    </div>
                ))}
            </div>
            {r.fxngProdCd && (
                <div className={`flex items-center gap-1 pt-1 border-t border-white/15 ${short ? 'text-amber-300' : 'text-indigo-200'}`}>
                    <ProdThumb src={r.fxngProdImgUrl} alt={r.fxngProdNm} size={20} />
                    {short ? <TriangleAlert size={11} /> : <Pin size={11} />}
                    <span className="truncate">
                        {r.fxngProdCd} {r.fxngProdNm} · {fxngQtyText(r)}
                        {short && ' — 보충 미달'}
                    </span>
                </div>
            )}
            <div className="text-[10px] text-slate-400 mt-1">클릭하면 재고 상세</div>
        </div>
    );
};

/** 구조도 칸 툴팁 — 레벨 합산 수치와 레벨별 점유율 */
const BayTooltip = ({ tip }) => {
    const { bay: b, x, y } = tip;
    const flipX = x > window.innerWidth - 280;
    const flipY = y > window.innerHeight - 190;

    return (
        <div className="fixed z-50 pointer-events-none w-64 bg-slate-800 text-white rounded-lg shadow-xl px-3 py-2.5 text-xs"
             style={{ left: flipX ? x - 268 : x + 14, top: flipY ? y - 170 : y + 14 }}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-mono font-bold">{b.prefix}</span>
                <span className={`font-bold tabular-nums ${b.pct > 100 ? 'text-rose-300' : 'text-indigo-300'}`}>
                    {b.pct != null ? `${b.pct}%` : '상한 없음'}
                </span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center mb-1">
                {[['보유', b.onHand], ['상한', b.capacity], ['할당', b.aloc], ['보류', b.hld]].map(([l, v]) => (
                    <div key={l} className="bg-white/10 rounded px-1 py-0.5">
                        <div className="text-[10px] text-slate-300">{l}</div>
                        <div className="font-bold tabular-nums">{v != null ? num(v) : '—'}</div>
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-300">
                {b.cells.map(c => {
                    const p = pctOf(c);
                    return <span key={c.locId} className="bg-white/10 rounded px-1 py-0.5 tabular-nums">
                        {Number(c.level)}단 {p != null ? `${p}%` : '—'}
                    </span>;
                })}
            </div>
            {b.fxngs.map(c => (
                <div key={c.locId} className={`flex items-center gap-1 pt-1 mt-1 border-t border-white/15 ${isShort(c) ? 'text-amber-300' : 'text-indigo-200'}`}>
                    <ProdThumb src={c.fxngProdImgUrl} alt={c.fxngProdNm} size={26} />
                    {isShort(c) ? <TriangleAlert size={11} /> : <Pin size={11} />}
                    <span className="truncate">
                        {Number(c.level)}단 · {c.fxngProdCd} {c.fxngProdNm} · {fxngQtyText(c)}
                        {isShort(c) && ' — 보충 미달'}
                    </span>
                </div>
            ))}
            <div className="text-[10px] text-slate-400 mt-1">클릭하면 레벨·재고 상세</div>
        </div>
    );
};

/**
 * 선택한 자리의 재고 — 맵 오른쪽에 상시 붙는 패널. 모달과 달리 맵을 가리지 않아
 * 여러 자리를 연달아 눌러 비교할 수 있다. 재고는 기존 현재고 API(locCd 부분일치)로 부른다.
 */
const DetailPanel = ({ sel, onClose, onGoTable }) => {
    const [stocks, setStocks] = useState(null);
    const query = sel?.query;

    useEffect(() => {
        if (!query) return;
        setStocks(null);
        let live = true;
        invApi.list({ locCd: query })
            .then(data => live && setStocks(data))
            .catch((e) => {
                if (!live) return;
                toast.error(e.message || '재고 조회에 실패했습니다.');
                setStocks([]);
            });
        return () => { live = false; };
    }, [query]);

    return (
        <aside className="w-[19rem] shrink-0 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
            {!sel ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
                    <PackageSearch size={26} className="text-slate-300" />
                    <p className="text-xs text-slate-400 leading-relaxed">
                        맵에서 자리를 클릭하면<br />그 자리의 재고가 여기 표시됩니다.
                    </p>
                </div>
            ) : (
                <>
                    <div className="px-4 py-3 border-b border-slate-200 flex flex-col gap-2">
                        <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-bold text-slate-800 font-mono">{sel.title}</h3>
                            <Badge meta={TEMP_ZONE_META} value={sel.tmpZon} show="label" />
                            <button onClick={onClose} className="ml-auto text-slate-300 hover:text-slate-600">
                                <X size={16} />
                            </button>
                        </div>
                        {/* 점유율 막대 — 상한이 없으면(스테이징) 생략 */}
                        {sel.pct != null && (
                            <div className="flex items-center gap-2">
                                <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                    <span className={`block h-full rounded-full ${sel.pct > 100 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                                          style={{ width: `${Math.min(sel.pct, 100)}%` }} />
                                </span>
                                <span className={`text-xs font-bold tabular-nums ${sel.pct > 100 ? 'text-rose-600' : 'text-slate-600'}`}>
                                    {sel.pct}%
                                </span>
                            </div>
                        )}
                        <div className="grid grid-cols-4 gap-1 text-center">
                            {[['보유', sel.onHand], ['상한', sel.capacity], ['할당', sel.aloc], ['보류', sel.hld]].map(([l, v]) => (
                                <div key={l} className="bg-slate-50 rounded px-1 py-1">
                                    <div className="text-[10px] text-slate-400">{l}</div>
                                    <div className="text-xs font-bold tabular-nums text-slate-700">{v != null ? num(v) : '—'}</div>
                                </div>
                            ))}
                        </div>
                        {/* 표로 건너뛰기 — sel.title이 아니라 sel.query를 넘긴다.
                            베이 선택이면 query가 prefix(DRY-A-01)이고 locCd가 부분일치라 레벨 전부가 걸린다 */}
                        <button onClick={() => onGoTable(sel.query)}
                                className="flex items-center justify-center gap-1 w-full py-1.5 rounded-lg border border-slate-200
                                           text-[11px] font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                                title="이 자리의 재고를 현재고 조회 화면에서 봅니다">
                            <Table2 size={12} /> 현재고 조회로 보기
                        </button>
                        {sel.levels && (
                            <div className="flex items-center gap-1 flex-wrap">
                                {sel.levels.map(c => {
                                    const p = pctOf(c);
                                    return (
                                        <span key={c.locId} className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 tabular-nums">
                                            {Number(c.level)}단 {p != null ? `${p}%` : '—'}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-h-0 overflow-auto px-4 py-3 flex flex-col gap-2">
                        {sel.fxngs.map(c => (
                            <p key={c.locId} className={`text-[11px] rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 ${isShort(c)
                                ? 'bg-amber-50 text-amber-700 font-bold' : 'bg-indigo-50 text-indigo-700'}`}>
                                <ProdThumb src={c.fxngProdImgUrl} alt={c.fxngProdNm} size={26} />
                                {isShort(c) ? <TriangleAlert size={12} className="shrink-0" /> : <Pin size={12} className="shrink-0" />}
                                <span>
                                    {sel.levels && `${Number(c.level)}단 `}고정 {c.fxngProdCd} {c.fxngProdNm}
                                    {' — '}{fxngQtyText(c)}
                                    {isShort(c) && ' 보충 미달'}
                                </span>
                            </p>
                        ))}
                        <StockList stocks={stocks} showLoc={sel.showLoc} />
                    </div>
                </>
            )}
        </aside>
    );
};

/** 패널 폭이 좁아 표 대신 행 카드로 — 상품·Lot이 위, 수량 4종이 아래 */
const StockList = ({ stocks, showLoc }) => {
    if (stocks == null) return <p className="text-xs text-slate-400 py-4 text-center">조회 중…</p>;
    if (stocks.length === 0) return <p className="text-xs text-slate-400 py-4 text-center">이 자리에 재고가 없습니다.</p>;

    return (
        <>
            <p className="text-[11px] text-slate-400 font-medium">재고 {num(stocks.length)}건</p>
            {stocks.map(s => (
                <div key={s.invId} className="border border-slate-200 rounded-lg px-2.5 py-2 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                        <ProdThumb src={s.prodImgUrl} alt={s.prodNm} tmpZon={s.tmpZon} size={36} />
                        <span className="text-xs font-bold text-slate-700">{s.prodCd}</span>
                        <span className="text-[11px] text-slate-500 truncate">{s.prodNm}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        {showLoc && <span className="font-mono text-slate-500">{s.locCd}</span>}
                        <span>{s.lotNo}</span>
                        <span className="ml-auto">{s.expiryDt ?? '기한 미관리'}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-center pt-0.5 border-t border-slate-100">
                        {[
                            ['보유', s.onHandQty, 'text-slate-700'],
                            ['할당', s.alocQty, s.alocQty > 0 ? 'text-amber-600' : 'text-slate-300'],
                            ['보류', s.hldQty, s.hldQty > 0 ? 'text-rose-600' : 'text-slate-300'],
                            ['가용', s.avalQty, s.avalQty <= 0 ? 'text-rose-500' : 'text-emerald-600'],
                        ].map(([l, v, cls]) => (
                            <div key={l}>
                                <div className="text-[9px] text-slate-400">{l}</div>
                                <div className={`text-[11px] font-bold tabular-nums ${cls}`}>{num(v)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </>
    );
};
