import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

import { invApi } from '@/api/invApi';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { num } from '@/utils/format';
import { Badge } from '@/components/common/Badge';
import ConfirmModal from '@/components/common/ConfirmModal';
import RackGrid from '@/components/locmap/RackGrid';
import { buildZones } from '@/components/locmap/locMapLayout';
import { targetLocOf } from './putawayTask';

/**
 * 적치 도면 — 선택 입고건의 지시가 「어디로 가는지」를 보여주고, 왼쪽 기둥에서 끌어온 카드를 받아 목적지를 바꾼다.
 *
 * 바뀌는 것은 <b>지시의 목적지</b>뿐이고 적치 실행은 아니다. 실물 적치는 작업자가 선반 앞에서 하는
 * 일이라(모바일 적치 화면이 그 자리다) 끌어 놓는 동작에는 「진짜 옮겼다」는 근거가 없다.
 * 드롭은 표 탭의 로케이션 변경 팝업과 <b>같은 담아두기</b>(`stageLoc`)에 실릴 뿐이고,
 * 서버 반영은 두 탭 공통인 [적치 저장]이 지시 변경 → 실행 순으로 한다.
 *
 * 가만히 있을 때도 도면이 말한다 — 지시 목적지 칸에 ▶잔여, 담아둔 변경은 +들어올/−나갈 표식과
 * 원래 칸 → 새 칸 점선 화살표. 카드에 마우스를 올리면 그 칸이, 칸에 올리면 그 카드가 켜진다(부모가 잇는다).
 * 끌기 시작하면 그 상품 온도대의 존으로 스크롤하고 놓을 수 있는 칸만 진하게 남긴다.
 *
 * 드롭 가능 판정은 서버 규칙(`PutawayTaskService.validateToLoc` + 적재가능수량)과 같은 셋이다 —
 * 보관 로케이션 · 반품존 아님 · 상품 온도대 일치. 여기서 막는 것은 편의고, 최종 판정은 서버가 한다.
 *
 * @param tasks       선택 입고건의 지시 행들 (`_pendingLoc` · `_virtualOf` 포함 — Putaway가 관리한다)
 * @param dragTask    끌리는 중인 지시 (없으면 null) — 드래그 원천은 왼쪽 기둥이라 부모가 들고 있다
 * @param onDragEnd   () => void — 드롭을 받았거나 끌기가 끝났을 때
 * @param hoverLocCd  왼쪽 카드가 가리키는 칸 — 켠다
 * @param onHoverCell (locCd | null) => void — 칸 hover를 부모에 알려 카드를 켜게 한다
 * @param focusLoc    { locCd, seq } — 카드 클릭으로 요청된 「그 칸으로 이동」. seq가 바뀌면 다시 간다
 * @param onStage     (task, loc, qty) => boolean — 담아두기
 * @param reloadKey   값이 바뀌면 맵을 다시 조회한다 (저장 후 적재가능수량 갱신)
 */
export default function PutawayLocMap({ tasks, dragTask, onDragEnd, hoverLocCd, onHoverCell, focusLoc, onStage, reloadKey }) {
    const [rows, setRows] = useState(null);
    const [dragOverLocCd, setDragOverLocCd] = useState(null);
    const [drop, setDrop] = useState(null); // 드롭 후 수량 입력 { task, loc, qty, baseRemaining, cap }
    const [arrows, setArrows] = useState([]);
    const canvasRef = useRef(null); // 도면 + 화살표 겹침 상자 (스크롤 내용물이라 좌표가 스크롤과 무관)
    const scrollRef = useRef(null);
    const qtyInputRef = useRef(null);

    useEffect(() => {
        invApi.locMap()
            .then(setRows)
            .catch((e) => {
                toast.error(e.message || '로케이션 맵 조회에 실패했습니다.');
                setRows([]);
            });
    }, [reloadKey]);

    useEffect(() => { qtyInputRef.current?.select(); }, [drop]);

    /** 칸별 표식: ▶잔여(지시 목적지) · +들어올(담아둔 변경의 새 칸) · −나갈(원래 칸) */
    const { marks, links } = useMemo(() => {
        const marks = new Map();
        const at = (cd) => { if (!marks.has(cd)) marks.set(cd, { drct: 0, pendingIn: 0, pendingOut: 0 }); return marks.get(cd); };
        const links = [];
        for (const t of tasks) {
            if (!t._pendingLoc) {
                at(t.toLocCd).drct += t.remainingQty;
                continue;
            }
            if (t._virtualOf) {
                // 분할 예정 — 원 행은 잔여가 줄어든 채 위에서 drct로 잡히고, 이 행이 새 칸으로 가는 몫이다
                at(t._pendingLoc.locCd).pendingIn += t.drctQty;
                at(t._fromLocCd).pendingOut += t.drctQty;
                links.push({ key: t.putawayTaskId, from: t._fromLocCd, to: t._pendingLoc.locCd, qty: t.drctQty });
            } else {
                // 전량 변경 — 원래 칸엔 남는 게 없다
                at(t._pendingLoc.locCd).pendingIn += t.remainingQty;
                at(t.toLocCd).pendingOut += t.remainingQty;
                links.push({ key: t.putawayTaskId, from: t.toLocCd, to: t._pendingLoc.locCd, qty: t.remainingQty });
            }
        }
        return { marks, links };
    }, [tasks]);

    // ── 드래그 ───────────────────────────────────────────────────────────────
    const activeTask = drop?.task ?? dragTask;

    /** 드롭 가능 판정 — 서버 규칙과 같은 셋. 수량은 아직 모르므로 「한 개라도 들어가나」까지만 본다 */
    const droppableOf = useMemo(() => (r) => {
        if (!activeTask) return { ok: false, reason: '왼쪽에서 지시를 끌어오세요' };
        if (r.bizDvsn === 'RTNGS') return { ok: false, reason: '반품존에는 적치할 수 없습니다' };
        if (r.tmpZon !== activeTask.tmpZon) return { ok: false, reason: `온도대가 다릅니다 (상품 ${activeTask.tmpZon} / 로케이션 ${r.tmpZon})` };
        if (r.locCd === targetLocOf(activeTask)) return { ok: false, reason: '현재 지시 위치입니다' };
        if (r.availQty === 0) return { ok: false, reason: '적재가능수량이 없습니다' };
        return { ok: true };
    }, [activeTask]);

    // 가만히 있을 땐 아무것도 흐리지 않는다 — 도면은 「이 입고건이 어디로 가나」를 보여주는 그림이다
    const zones = useMemo(
        () => buildZones(rows ?? [], (r) => (activeTask ? droppableOf(r).ok : true)),
        [rows, activeTask, droppableOf],
    );

    /*
     * 온도대로 접고, 그 안에서 존을 가로로 편다.
     *
     * 지시 하나가 갈 수 있는 자리는 그 상품 온도대의 보관존·피킹존 둘뿐이라, 존 9개를 세로로 쌓으면
     * 화면의 대부분이 구조적으로 못 놓는 자리가 된다(반품존 3개는 아예 영구 불가). 그래서 이 입고건이
     * 실제로 쓰는 온도대만 펼치고 나머지는 한 줄로 접는다 — 자동 스크롤은 그 증상을 덮던 것이었다.
     *
     * 센터 평면도(구조도의 U자)를 여기 쓰지 않는 이유는 둘이다. ① 구조도의 칸은 베이 합산이라
     * 레벨까지 특정해야 하는 적치 목적지를 가리킬 수 없다. ② 그 U자는 loc에 좌표가 없어 하드코딩한
     * 그림이다 — 훑어보는 화면에선 무해해도, 작업 지시인 이 화면이 실제 동선을 말한다고 믿게 하면 안 된다.
     * loc에 좌표 컬럼이 생기면 그때는 진짜 배치를 그릴 수 있다.
     */
    const groups = useMemo(() => {
        const TMP_ORDER = ['DRY', 'CHL', 'FRZ'];      // 실제 센터의 온도대 구획 순서 (locMapLayout.TMP_COLS와 같다)
        const DVSN_ORDER = ['STRG', 'PIKNG', 'RTNGS']; // 보관 → 피킹 → 반품. 적치가 쓰는 순서다
        const rank = (list, v) => (list.indexOf(v) + 1) || 99;
        const byTmp = new Map();
        for (const z of zones) {
            if (!byTmp.has(z.tmpZon)) byTmp.set(z.tmpZon, []);
            byTmp.get(z.tmpZon).push(z);
        }
        return [...byTmp.entries()]
            .sort(([a], [b]) => rank(TMP_ORDER, a) - rank(TMP_ORDER, b))
            .map(([tmpZon, zs]) => ({
                tmpZon,
                zones: [...zs].sort((a, b) =>
                    rank(DVSN_ORDER, a.bizDvsn) - rank(DVSN_ORDER, b.bizDvsn) || a.zonCd.localeCompare(b.zonCd)),
                cellCount: zs.reduce((s, z) => s + z.all.length, 0),
                drctQty: zs.reduce((s, z) => s + z.all.reduce((a, c) => a + (marks.get(c.locCd)?.drct ?? 0), 0), 0),
            }));
    }, [zones, marks]);

    // 펼침은 「이 입고건이 쓰는 온도대」로 시작하고, 그 뒤로는 사용자가 접고 펼 수 있다.
    // 입고건이 바뀌어 온도대 구성이 달라지면 다시 맞춘다 — effect로 되돌리면 한 번 잘못 그린 뒤 고치는 꼴이라
    // 렌더 중에 키를 비교해 바로 파생시킨다(React의 「props로 state 조정하기」 패턴).
    // 문자열 키인 이유는 담아두기로 tasks가 바뀌어도 온도대 구성이 같으면 펼침이 안 튀게 하려는 것이다
    const tmpZonKey = [...new Set(tasks.map(t => t.tmpZon))].sort().join(',');
    const [openState, setOpenState] = useState({ key: tmpZonKey, open: new Set(tmpZonKey ? tmpZonKey.split(',') : []) });
    const openTmpZons = openState.key === tmpZonKey
        ? openState.open
        : new Set(tmpZonKey ? tmpZonKey.split(',') : []);
    if (openState.key !== tmpZonKey) {
        setOpenState({ key: tmpZonKey, open: openTmpZons });
    }
    const toggleTmpZon = (z) => setOpenState(prev => {
        const next = new Set(prev.key === tmpZonKey ? prev.open : openTmpZons);
        if (next.has(z)) next.delete(z); else next.add(z);
        return { key: tmpZonKey, open: next };
    });

    // block은 'start'다 — 'nearest'는 섹션이 스크롤 상자 위로 완전히 벗어나 있을 때 Chrome에서 아무것도 안 했다(2026-08-26 실측)
    const scrollToTmpZon = (tmpZon) => {
        scrollRef.current?.querySelector(`section[data-tmpzon="${tmpZon}"]`)
            ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    const scrollToLoc = (locCd, behavior = 'smooth') => {
        scrollRef.current?.querySelector(`[data-loccd="${CSS.escape(locCd)}"]`)
            ?.scrollIntoView({ block: 'center', behavior });
    };

    // 입고건을 고르면 첫 지시의 목적지까지 도면을 옮겨 둔다 — 도면이 상온존부터 시작하는데 냉장 입고건을
    // 골라 놓고 목적지를 찾아 내려가야 한다면 「어디로 가는지」가 한눈에 보인다는 말이 거짓이 된다.
    // 한 번 더 미뤄서 맞추는 이유: 고정상품 이미지가 늦게 실리면 위쪽 칸들이 자라 목적지가 아래로 밀린다
    const firstTargetCd = tasks.length > 0 ? targetLocOf(tasks[0]) : null;
    const firstIbNo = tasks[0]?.ibNo ?? null;
    useEffect(() => {
        if (!rows || !firstTargetCd) return undefined;
        scrollToLoc(firstTargetCd, 'auto');
        const t = setTimeout(() => scrollToLoc(firstTargetCd, 'auto'), 500);
        return () => clearTimeout(t);
        // 입고건이 바뀔 때만 — 담아두기로 카드가 바뀌는 것까지 따라가면 작업 중에 도면이 튄다
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, firstIbNo]);

    // 끌기 시작 → 그 온도대 존으로. 입고건 하나에 냉장·냉동이 섞여 있어도 헤매지 않게
    const dragTmpZon = dragTask?.tmpZon ?? null;
    useEffect(() => { if (dragTmpZon) scrollToTmpZon(dragTmpZon); }, [dragTmpZon]);

    // 왼쪽 카드 클릭 → 그 칸으로
    useEffect(() => { if (focusLoc?.locCd) scrollToLoc(focusLoc.locCd); }, [focusLoc]);

    const onDropTo = (loc) => {
        if (!dragTask) return;
        const baseRemaining = dragTask.drctQty - dragTask.cmplQty;
        // 적재가능수량이 잔여보다 적으면 그만큼만 옮기는 것이 기본값이다 — 남는 분은 분할되어 원래 자리에 남는다
        const cap = loc.availQty == null ? baseRemaining : Math.min(baseRemaining, loc.availQty);
        setDrop({ task: dragTask, loc, qty: String(cap), baseRemaining, cap });
        onDragEnd();
    };

    const confirmDrop = () => {
        if (Number(drop.qty) > drop.cap) {
            toast.error(`적재가능수량(${num(drop.cap)})을 초과했습니다.`);
            return;
        }
        if (onStage(drop.task, drop.loc, drop.qty)) setDrop(null);
    };

    // ── 변경 화살표 — 원래 칸 → 새 칸. 칸의 DOM 좌표를 재서 겹침 상자 기준으로 그린다.
    //    상자가 스크롤 내용물 안에 있어 스크롤엔 영향받지 않고, 배치가 바뀔 때(존·표식·크기)만 다시 잰다 ──
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const measure = () => {
            const box = canvas.getBoundingClientRect();
            const centerOf = (cd) => {
                const el = canvas.querySelector(`[data-loccd="${CSS.escape(cd)}"]`);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
            };
            setArrows(links.flatMap(l => {
                const a = centerOf(l.from);
                const b = centerOf(l.to);
                return a && b ? [{ ...l, ...a, x2: b.x, y2: b.y }] : [];
            }));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(canvas);
        return () => ro.disconnect();
    }, [links, zones]);

    if (rows === null) {
        return <p className="text-sm text-slate-400 py-8 text-center">로케이션 맵을 불러오는 중…</p>;
    }

    const highlightLocCds = hoverLocCd ? new Set([hoverLocCd]) : undefined;

    return (
        <div className="flex flex-col gap-2 h-full min-h-0">
            <div className="flex items-center gap-3 text-[11px] text-slate-400 shrink-0 flex-wrap">
                <span className="flex items-center gap-1"><MapPin size={12} className="text-indigo-500" />
                    {activeTask
                        ? <span className="text-indigo-600 font-medium">{activeTask.prodNm} — 놓을 수 있는 칸만 진하게 보입니다</span>
                        : '카드에 올리면 그 칸이, 칸에 올리면 그 카드가 켜집니다'}
                </span>
                {/* 범례에 숫자를 넣지 않는다 — 「969 적재가능」처럼 쓰면 어느 칸의 실제 값으로 읽힌다 */}
                <span className="ml-auto flex items-center gap-2">
                    <Legend cls="bg-indigo-600 text-white">▶n</Legend> 지시 목적지(잔여)
                    <Legend cls="bg-amber-400 text-amber-950">+n</Legend> 변경 예정
                    <Legend cls="bg-white border border-slate-300 text-slate-500">−n</Legend> 나갈 분
                    <span className="text-emerald-600 font-medium">칸 아래 초록 숫자</span> = 적재가능
                </span>
            </div>
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
                <div ref={canvasRef} className="relative flex flex-col gap-3">
                    {groups.length === 0 && (
                        <p className="text-sm text-slate-400 py-8 text-center">보관 로케이션이 없습니다.</p>
                    )}
                    {groups.map(g => {
                        const open = openTmpZons.has(g.tmpZon);
                        return (
                            <div key={g.tmpZon} className="flex flex-col gap-1">
                                <GroupHeader group={g} open={open} onToggle={() => toggleTmpZon(g.tmpZon)} />
                                {open && (
                                    // 가로로 편다 — 보관존과 피킹존이 나란해야 「어디서 어디로 보충되나」가 같이 읽힌다.
                                    // 넘치면 감싼다(스크롤 아님) — 가로 스크롤이 생기면 위에 겹친 화살표 좌표가 어긋난다
                                    <div className="flex flex-wrap gap-3 items-start">
                                        <RackGrid zones={g.zones}
                                                  compact
                                                  droppableOf={activeTask ? droppableOf : undefined}
                                                  onDropTo={onDropTo}
                                                  dragOverLocCd={dragOverLocCd}
                                                  onDragOverCell={(r) => setDragOverLocCd(r?.locCd ?? null)}
                                                  onHover={(tip) => onHoverCell(tip?.r.locCd ?? null)}
                                                  badgeOf={(r) => (r.availQty == null ? '∞' : num(r.availQty))}
                                                  markOf={(r) => marks.get(r.locCd) ?? null}
                                                  highlightLocCds={highlightLocCds} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {arrows.length > 0 && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
                            <defs>
                                <marker id="ptawy-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                                        markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                                    <path d="M 0 0 L 10 5 L 0 10 z" className="fill-amber-500" />
                                </marker>
                            </defs>
                            {arrows.map(a => (
                                <g key={a.key}>
                                    <line x1={a.x} y1={a.y} x2={a.x2} y2={a.y2}
                                          className="stroke-amber-500" strokeWidth="2" strokeDasharray="5 4"
                                          markerEnd="url(#ptawy-arrow)" />
                                    <text x={(a.x + a.x2) / 2} y={(a.y + a.y2) / 2 - 6}
                                          textAnchor="middle" className="fill-amber-700 text-[10px] font-bold"
                                          style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3 }}>
                                        {num(a.qty)}
                                    </text>
                                </g>
                            ))}
                        </svg>
                    )}
                </div>
            </div>

            {/* 드롭 직후 수량 — 기본값은 「넣을 수 있는 만큼 전부」라 그냥 [담기]만 눌러도 된다 */}
            {drop && (
                <ConfirmModal title="대상 로케이션 변경" confirmText="담기"
                              onCancel={() => setDrop(null)} onConfirm={confirmDrop}>
                    <p className="text-sm text-slate-500">
                        <span className="text-slate-400">{drop.task.prodNm} · </span>
                        <b className="font-mono text-slate-600">{targetLocOf(drop.task)}</b>
                        {' → '}
                        <b className="font-mono text-indigo-700">{drop.loc.locCd}</b>
                    </p>
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-slate-600 shrink-0">변경 수량</label>
                        <input ref={qtyInputRef} type="number" min={1} max={drop.cap} value={drop.qty}
                               autoFocus
                               onChange={(e) => setDrop(prev => ({ ...prev, qty: e.target.value }))}
                               className="w-24 input-base text-right tabular-nums" />
                        <span className="text-xs text-slate-400">
                            잔여 {num(drop.baseRemaining)}
                            {drop.cap < drop.baseRemaining && ` · 적재가능 ${num(drop.cap)}`}
                        </span>
                    </div>
                    <p className="text-xs text-slate-400">
                        {Number(drop.qty) < drop.baseRemaining
                            ? `${num(Number(drop.qty) || 0)}개만 새 지시로 분할되고 나머지는 현재 위치에 남습니다`
                            : '잔여 전량을 새 위치로 보냅니다'}
                        {' — 담아두기만 하고 서버에는 [적치 저장]이 반영합니다.'}
                    </p>
                </ConfirmModal>
            )}
        </div>
    );
}

const Legend = ({ cls, children }) => (
    <span className={`px-1 py-0.5 rounded text-[9px] font-bold leading-none ${cls}`}>{children}</span>
);

/** 온도대 묶음 머리 — 접힌 상태에서도 「여기 이 입고건 지시가 몇 개 걸렸나」는 남긴다 */
const GroupHeader = ({ group, open, onToggle }) => {
    const Chevron = open ? ChevronDown : ChevronRight;
    return (
        <button onClick={onToggle}
                title={open ? '접기' : '펼치기'}
                className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs w-full text-left transition-colors
                    ${open ? 'text-slate-500 hover:bg-slate-50'
                           : 'bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-100'}`}>
            <Chevron size={13} className="shrink-0" />
            <Badge meta={TEMP_ZONE_META} value={group.tmpZon} />
            <span className="tabular-nums">{group.zones.length}개 존 · {num(group.cellCount)}자리</span>
            {group.drctQty > 0 && (
                <span className="ml-auto px-1 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-bold leading-none">
                    ▶{num(group.drctQty)}
                </span>
            )}
        </button>
    );
};
