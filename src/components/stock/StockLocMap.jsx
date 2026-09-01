import { useEffect, useMemo, useState } from 'react';
import { PackageSearch, Pin, Table2, TriangleAlert, Truck, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { invApi } from '@/api/invApi';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { num } from '@/utils/format';
import { Badge } from '@/components/common/Badge';
import { StatTile } from '@/components/common/StatTile';
import { ProdThumb } from '@/components/common/ProdThumb';
import RackGrid, { MapCell } from '@/components/locmap/RackGrid';
import {
    OVERLAYS, TMP_COLS, buildZones, cellFacts, gridOf, isOver, isShort, overlayOf, pctOf,
} from '@/components/locmap/locMapLayout';

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

// 「현재고/min」에 오고 있는 지시 잔량을 덧붙인다 — min 아래인데 미달이 아닌 칸의 이유가 읽히게
const fxngQtyText = (r) => `${num(r.fxngOnHandQty)}/${num(r.fxngMinQty)}`
    + (r.fxngInflowQty > 0 ? ` (+유입 ${num(r.fxngInflowQty)})` : '');

export default function StockLocMap({ focusLocCd, onGoTable }) {
    const [rows, setRows] = useState(null);
    const [stageRows, setStageRows] = useState([]);
    const [mode, setMode] = useState('plan'); // plan(구조도) | rack(랙 상세)
    const [overlay, setOverlay] = useState('occupancy'); // 같은 도면에 얹는 질문 — locMapLayout.OVERLAYS
    const [tmpZon, setTmpZon] = useState('');
    const [zonCd, setZonCd] = useState('');
    const [shortOnly, setShortOnly] = useState(false);
    const [overOnly, setOverOnly] = useState(false);
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

    /* 필터는 「거르기」가 아니라 「강조」다 — 걸리지 않은 칸도 자리에 남기고 흐리게만 한다.
       도면에서 자리가 움직이면 어디에 무엇이 있는지 외운 것이 매번 깨지기 때문이다 */
    const matches = useMemo(() => (r) =>
        (!tmpZon || r.tmpZon === tmpZon) && (!zonCd || r.zonCd === zonCd)
        && (!shortOnly || isShort(r)) && (!overOnly || isOver(r)),
    [tmpZon, zonCd, shortOnly, overOnly]);

    /* 지표는 드롭다운(온도대·존)이 좁힌 범위까지만 따른다 — 미달·초과 토글은 「그 자리가 어디냐」를
       도면에서 강조하는 스위치이지 모수를 바꾸는 조건이 아니다. 토글에 따라 세면 초과만 남겼을 때
       「전체 점유율 186%」처럼 이름과 어긋나는 숫자가 나오고, 건수 자체도 늘 자기 자신이 된다 */
    const scoped = useMemo(() => (rows ?? []).filter(r =>
        (!tmpZon || r.tmpZon === tmpZon) && (!zonCd || r.zonCd === zonCd)),
    [rows, tmpZon, zonCd]);

    // 점유율은 수량 가중(Σ보유 ÷ Σ상한)
    const summary = useMemo(() => {
        const withMax = scoped.filter(r => r.maxQty != null);
        const onHand = withMax.reduce((s, r) => s + r.onHandQty, 0);
        const capacity = withMax.reduce((s, r) => s + r.maxQty, 0);
        return {
            short: scoped.filter(isShort).length,
            over: scoped.filter(isOver).length,
            occupancy: capacity > 0 ? Math.round((onHand / capacity) * 100) : null,
        };
    }, [scoped]);

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

    // 존 → 통로 → 셀. 자리를 고정해야 하므로 전건으로 만들고, 필터에 안 걸린 칸은 dim으로 표시한다
    const zones = useMemo(() => buildZones(rows ?? [], matches), [rows, matches]);

    // 용도(행) × 온도대(열) 격자 — 필터가 바뀌어도 존의 자리는 그대로다
    const grid = useMemo(() => gridOf(zones), [zones]);
    const view = overlayOf(overlay);

    if (rows == null) return <p className="text-sm text-slate-400 py-8 text-center">조회 중…</p>;

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 관리자 지표 — 「재고가 어떻더라」가 아니라 「지금 손댈 일이 어디 있나」.
                누르면 그 자리만 도면에서 강조되거나(미달·초과) 그 자리의 재고가 오른쪽에 열린다(도크) */}
            <div className="flex gap-3">
                <StatTile label="입고 대기" value={num(docks.rcv.onHand)}
                          sub={docks.rcv.prods.size > 0 ? `${num(docks.rcv.prods.size)}종 · 적치 전` : '없음'}
                          accent={docks.rcv.onHand > 0 ? 'text-emerald-600' : 'text-slate-300'}
                          onClick={() => selectLoc(dockLoc(docks.rcv))} />
                <StatTile label="출고 대기" value={num(docks.ship.onHand)}
                          sub={docks.ship.prods.size > 0 ? `${num(docks.ship.prods.size)}종 · 반출 전` : '없음'}
                          accent={docks.ship.onHand > 0 ? 'text-rose-600' : 'text-slate-300'}
                          onClick={() => selectLoc(dockLoc(docks.ship))} />
                {/* 0건이면 누를 것이 없다 — 눌리게 두면 도면이 통째로 흐려지기만 한다 */}
                <StatTile label="보충 미달" value={num(summary.short)} sub="고정 자리 기준"
                          accent={summary.short > 0 ? 'text-amber-600' : 'text-slate-300'}
                          active={shortOnly}
                          onClick={summary.short > 0 ? () => { setShortOnly(v => !v); setOverOnly(false); } : undefined} />
                <StatTile label="초과 적재" value={num(summary.over)} sub="상한 초과"
                          accent={summary.over > 0 ? 'text-rose-600' : 'text-slate-300'}
                          active={overOnly}
                          onClick={summary.over > 0 ? () => { setOverOnly(v => !v); setShortOnly(false); } : undefined} />
                <StatTile label="전체 점유율" value={summary.occupancy != null ? `${summary.occupancy}%` : '—'}
                          sub="Σ보유 ÷ Σ상한" />
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
                {/* 오버레이 — 같은 도면에 다른 질문을 얹는다. 랙 상세는 채움 높이가 점유율을 말하므로 구조도에서만 */}
                {mode === 'plan' && (
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                        {OVERLAYS.map((o, i) => (
                            <button key={o.key} onClick={() => { setOverlay(o.key); setTip(null); }}
                                    title={o.hint}
                                    className={`px-2.5 py-1.5 ${i > 0 ? 'border-l border-slate-200' : ''} ${overlay === o.key
                                        ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                                {o.label}
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-2.5 ml-auto text-[11px] text-slate-500">
                    {mode === 'plan' ? (
                        <span className="flex items-center gap-1.5">
                            {view.legend.map(([cls, label], i) => (
                                <span key={i} className="flex items-center gap-1">
                                    <span className={`inline-block w-3.5 h-3.5 rounded-[3px] ${cls}`} />
                                    {label}
                                </span>
                            ))}
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
                                <p className="text-sm text-slate-400 py-10 text-center">보관 로케이션이 없습니다.</p>
                            ) : (
                                /* 용도(행) × 온도대(열) 격자 — 존은 늘 같은 칸에 있다.
                                   행 사이 넓은 여백이 주 통로, 존 안 통로가 랙 사이 소통로다 */
                                <div className="relative px-16 pt-6 pb-10 flex flex-col gap-7">
                                    {grid.map(row => (
                                        <div key={row.key} className="flex items-start gap-2">
                                            <span className="w-10 shrink-0 pt-4 text-[10px] font-bold text-slate-400 text-right leading-tight">
                                                {row.label}
                                            </span>
                                            {/* 존 폭은 랙(베이) 수를 따라간다 — 자리 6개짜리와 1개짜리가 같은 덩치면
                                                도면에서 면적 감각이 사라진다. 그래서 칸을 늘리지 않고(items-start) 내용 폭 그대로 둔다 */}
                                            <div className="flex-1 grid gap-x-8 gap-y-4 items-start"
                                                 style={{ gridTemplateColumns: `repeat(${TMP_COLS.length}, minmax(0, 1fr))` }}>
                                                {row.cols.map(col => (
                                                    <div key={col.tmpZon} className="flex flex-col gap-3 items-start">
                                                        {col.zones.map(zone => (
                                                            <PlanZoneRoom key={zone.zonCd} zone={zone} selCd={sel?.query}
                                                                          fill={view.fill}
                                                                          onBay={selectBay} onLoc={selectLoc} onHover={setTip} />
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* ── 랙 상세: 존 → 통로 → 베이×레벨 입면 ── */
                <div className="flex-1 min-w-0 min-h-0 overflow-auto flex flex-col gap-4 pb-2">
                    <RackGrid zones={zones} selectedLocCd={sel?.query}
                              onSelect={selectLoc} onHover={setTip} />
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

/**
 * 존 룸 — 통로(가로줄) 하나가 랙 한 줄. 칸은 틈 없이 붙여 랙 바처럼 보이게 한다.
 * 헤더에 점유율 막대와 이상 건수(초과·미달)를 함께 둬, 도면을 훑는 것만으로 손댈 존이 걸러지게 했다.
 * 필터에 안 걸린 존은 지우지 않고 흐리게만 한다(자리 고정 — locMapLayout 머리말).
 */
const PlanZoneRoom = ({ zone, selCd, fill, onBay, onLoc, onHover }) => (
    <section className={`relative w-fit min-w-[8.5rem] max-w-full rounded-lg border-2 px-3 pt-2 pb-3
            flex flex-col gap-1.5 overflow-hidden
            transition-opacity ${zone.dim ? 'opacity-25' : ''}
            ${ROOM_TINT[zone.tmpZon] ?? 'border-slate-300 bg-white/70'}`}>
        {/* 존 코드 워터마크 — 실제 평면도가 구역에 큰 글자를 박는 방식 */}
        <span className="absolute -bottom-3 right-1 text-4xl font-black text-slate-900/[0.05] tracking-tight select-none">
            {zone.zonCd}
        </span>
        {/* 머리글은 두 줄로 고정한다 — 한 줄에 몰면 헤더 폭이 방 폭을 정해버려 랙 수에 따른 면적 차이가 사라지고,
            접히게 두면 존마다 줄 수가 갈려 도면이 들쭉날쭉해진다 */}
        <div className="relative flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-bold text-slate-700">{zone.zonCd}</h3>
                <Badge meta={TEMP_ZONE_META} value={zone.tmpZon} show="label" />
            </div>
            <div className="flex items-center gap-1.5">
                {zone.occupancy != null && (
                    <span className="w-9 h-1 rounded-full bg-slate-900/10 overflow-hidden shrink-0">
                        <span className={`block h-full rounded-full ${zone.occupancy > 100 ? 'bg-rose-500' : 'bg-slate-600'}`}
                              style={{ width: `${Math.min(zone.occupancy, 100)}%` }} />
                    </span>
                )}
                <span className="text-[10px] text-slate-500 tabular-nums font-medium">
                    {zone.occupancy != null ? `${zone.occupancy}%` : `${num(zone.all.length)}자리`}
                </span>
                {zone.overCount > 0 && (
                    <span className="text-[9px] font-bold text-rose-600 bg-rose-100 rounded px-1 py-px">초과 {zone.overCount}</span>
                )}
                {zone.shortCount > 0 && (
                    <span className="text-[9px] font-bold text-amber-700 bg-amber-100 rounded px-1 py-px">미달 {zone.shortCount}</span>
                )}
            </div>
        </div>
        <div className="relative flex flex-col gap-2.5">
            {zone.aisles.map(({ aisle, bayAgg }) => (
                <div key={aisle || '(단일)'} className="flex items-center gap-1.5">
                    {aisle && <span className="w-3 text-[9px] font-bold text-slate-400 text-center">{aisle}</span>}
                    {/* 랙 바 — 칸 사이 1px이 랙 프레임처럼 보인다 */}
                    <div className="flex gap-px bg-slate-400/60 rounded-[3px] overflow-hidden ring-1 ring-slate-400/60">
                        {bayAgg.map(b => (
                            <PlanCell key={b.bay} b={b} selected={selCd === b.prefix} fill={fill}
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

/** 구조도 칸 — 랙 자리 하나(레벨 합산). 색이 무엇을 말하는지는 오버레이가 정한다 */
const PlanCell = ({ b, selected, fill: fillOf, onClick, onHover }) => {
    const fill = fillOf(cellFacts(b));
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
    // 자리가 바뀌면 앞 자리의 목록을 그대로 두지 않으려고 응답에 조회어를 같이 담는다 —
    // 조회 시작에 비우면(setState) 렌더 연쇄가 되고, 그러지 않으면 남의 재고가 잠깐 보인다
    // (LocStockPanel과 같은 방식)
    const [loaded, setLoaded] = useState(null);   // { query, rows }
    const query = sel?.query;
    const stocks = loaded && loaded.query === query ? loaded.rows : null;   // null = 조회 중

    useEffect(() => {
        if (!query) return undefined;
        let live = true;
        invApi.list({ locCd: query })
            .then(data => { if (live) setLoaded({ query, rows: data }); })
            .catch((e) => {
                if (!live) return;
                toast.error(e.message || '재고 조회에 실패했습니다.');
                setLoaded({ query, rows: [] });
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
