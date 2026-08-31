import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

import { invApi } from '@/api/invApi';
import { putawayApi } from '@/api/putawayApi';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { num } from '@/utils/format';
import { Badge } from '@/components/common/Badge';
import ConfirmModal from '@/components/common/ConfirmModal';
import RackGrid from '@/components/locmap/RackGrid';
import { buildZones } from '@/components/locmap/locMapLayout';
import LocStockPanel from './LocStockPanel';
import { targetLocOf } from './putawayTask';

/** 도면에 순위를 붙일 후보 개수 — 셋을 넘기면 「추천」이 아니라 또 하나의 목록이 된다 */
const RANK_COUNT = 3;

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
 * @param hoverTask   왼쪽에서 마우스를 올린 지시 — 끌지 않아도 추천 순위를 띄운다(판단은 끌기 전에 한다)
 * @param onHoverCell (locCd | null) => void — 칸 hover를 부모에 알려 카드를 켜게 한다
 * @param focusLoc    { locCd, seq } — 카드 클릭으로 요청된 「그 칸으로 이동」. seq가 바뀌면 다시 간다
 * @param onStage     (task, loc, qty) => boolean — 담아두기
 * @param reloadKey   값이 바뀌면 맵을 다시 조회한다 (저장 후 적재가능수량 갱신)
 */
export default function PutawayLocMap({ tasks, dragTask, onDragEnd, hoverLocCd, hoverTask, onHoverCell, focusLoc, onStage, reloadKey }) {
    const [rows, setRows] = useState(null);
    const [dragOverLocCd, setDragOverLocCd] = useState(null);
    const [pickedLoc, setPickedLoc] = useState(null);   // 칸 클릭 → 오른쪽 상세 패널
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

    /*
     * 추천 순위 — 「놓을 수 있다」(밝은 칸)와 「여기가 좋다」는 다른 질문이다.
     * 온도대만 맞으면 수십 칸이 밝아지므로, 그중 어디가 나은지는 도면이 따로 말해야 한다.
     *
     * 순위의 주인은 서버다(적치 우선순위 `ptawy_prty` 순 · 반품존 제외 · 적재가능수량 포함) —
     * 화면이 자기 기준으로 다시 매기면 지시를 낸 전략과 조용히 갈라진다.
     * 지금 목적지는 빼고 센다: 옮기려고 끌었는데 1순위가 원래 자리면 답이 되지 않는다.
     */
    // ibLineId → 후보 목록. 한 번 받은 라인은 다시 가리켜도 조회하지 않는다
    const [candidatesByLine, setCandidatesByLine] = useState(new Map());
    const inFlight = useRef(new Set());

    // 흐림·드롭 판정은 activeTask 그대로다 — hover만으로 도면이 어두워지면 훑어보기가 방해된다
    const rankTask = activeTask ?? hoverTask;

    /*
     * 입고건을 고르는 순간 그 지시들의 후보를 미리 받아 둔다.
     *
     * hover 시점에 부르면 늦다 — 원격 DB라 이 조회가 2초쯤 걸려서, 마우스를 올렸다 옮기는
     * 사이에 응답이 와 「추천이 있다는데 화면엔 안 뜨는」 상태가 된다. 카드를 보고 손을 옮기는
     * 시간이면 충분히 받아 두므로, 가리키는 즉시 순위가 뜬다.
     */
    // 살아 있는지는 언마운트로만 판단한다 — effect 정리에서 껐다가는 담아두기로 tasks가 바뀔 때마다
    // 진행 중이던 조회가 버려져, 매번 다시 부르면서 영영 채워지지 않는다
    // setup에서 다시 켜는 것이 중요하다 — StrictMode는 개발에서 마운트를 한 번 접었다 펴는데,
    // 그때 꺼진 채로 남으면 이후 응답이 전부 버려져 순위가 영영 안 뜬다
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    useEffect(() => {
        for (const ibLineId of new Set(tasks.map(t => t.ibLineId).filter(Boolean))) {
            if (candidatesByLine.has(ibLineId) || inFlight.current.has(ibLineId)) continue;
            inFlight.current.add(ibLineId);
            const remember = (list) => {
                inFlight.current.delete(ibLineId);
                if (mounted.current) setCandidatesByLine(prev => new Map(prev).set(ibLineId, list));
            };
            putawayApi.candidateLocs(ibLineId)
                .then(remember)
                // 순위는 보조 정보다 — 못 받아도 드롭은 그대로 되므로 토스트로 방해하지 않고 빈 목록으로 둔다
                .catch(() => remember([]));
        }
    }, [tasks, candidatesByLine]);

    const rankByLocCd = useMemo(() => {
        const candidates = rankTask ? candidatesByLine.get(rankTask.ibLineId) : null;
        if (!candidates) return new Map();
        const here = targetLocOf(rankTask);
        const ranked = new Map();
        candidates
            .filter(c => c.locCd !== here && c.availQty !== 0)
            .slice(0, RANK_COUNT)
            .forEach((c, i) => ranked.set(c.locCd, i + 1));
        return ranked;
    }, [rankTask, candidatesByLine]);

    /** 1순위 칸 — 안내 줄이 코드로 보여 주고, 눌러서 그 자리로 간다 */
    const topRankLocCd = [...rankByLocCd.entries()].find(([, rank]) => rank === 1)?.[0] ?? null;

    /*
     * 칸 아래 적재가능수량 — 칸마다 붙는 값이라 세기를 갈라야 읽힌다.
     * 지금 옮기려는 수량이 다 들어가지 않는 칸만 주황으로 세우고, 넉넉한 칸은 흐리게 둔다 —
     * 66칸이 전부 같은 초록이면 「어디가 빠듯한가」를 숫자를 하나씩 읽어야 안다.
     * 가리키는 지시가 없으면 기준이 없으므로 전부 흐리다(그때는 훑어보는 화면이다).
     */
    const availBadgeOf = useMemo(() => {
        const need = rankTask?.remainingQty ?? null;
        return (r) => {
            if (r.availQty == null) return { text: '∞', tone: 'muted' };
            const tone = need == null ? 'muted' : r.availQty < need ? 'tight' : 'ok';
            return { text: num(r.availQty), tone };
        };
    }, [rankTask]);

    /** 드롭 가능 판정 — 서버 규칙과 같은 셋. 수량은 아직 모르므로 「한 개라도 들어가나」까지만 본다 */
    const droppableOf = useMemo(() => (r) => {
        if (!activeTask) return { ok: false, reason: '왼쪽에서 지시를 끌어오세요' };
        if (r.bizDvsn === 'RTNGS') return { ok: false, reason: '반품존에는 적치할 수 없습니다' };
        if (r.tmpZon !== activeTask.tmpZon) return { ok: false, reason: `온도대가 다릅니다 (상품 ${activeTask.tmpZon} / 로케이션 ${r.tmpZon})` };
        if (r.locCd === targetLocOf(activeTask)) return { ok: false, reason: '현재 지시 위치입니다' };
        if (r.availQty === 0) return { ok: false, reason: '적재가능수량이 없습니다' };
        return { ok: true };
    }, [activeTask]);

    /*
     * 이 입고건이 갈 수 있는 자리만 그린다 — 다른 온도대와 반품존은 아예 빼 버린다.
     *
     * 접어서 한 줄로 두던 것을 없앤 이유는 그 자리가 「지금 못 쓰는」이 아니라 <b>이 화면에서
     * 영구히 못 쓰는</b> 자리라서다. 온도대 불일치도 반품존도 서버가 거부하고(반품 입고여도
     * 적치 목적지가 아니다 — 불량이 반품존으로 가는 것은 검수 단계다), 후보 산출도 이미 뺀다.
     *
     * 다만 <b>지시가 이미 가리키는 칸은 예외 없이 남긴다</b> — 옛 데이터로 그런 지시가 있으면
     * 칸이 사라져 ▶표식과 화살표가 갈 곳을 잃는다. 도면은 먼저 「지금 무엇이 어디로 가나」다.
     */
    const visibleRows = useMemo(() => {
        const tmpZons = new Set(tasks.map(t => t.tmpZon).filter(Boolean));
        const pinned = new Set(tasks.flatMap(t => [t.toLocCd, t._pendingLoc?.locCd]).filter(Boolean));
        return (rows ?? []).filter(r => pinned.has(r.locCd)
            || (r.bizDvsn !== 'RTNGS' && (tmpZons.size === 0 || tmpZons.has(r.tmpZon))));
    }, [rows, tasks]);

    // 가만히 있을 땐 아무것도 흐리지 않는다 — 도면은 「이 입고건이 어디로 가나」를 보여주는 그림이다
    const zones = useMemo(
        () => buildZones(visibleRows, (r) => (activeTask ? droppableOf(r).ok : true)),
        [visibleRows, activeTask, droppableOf],
    );

    /*
     * 온도대로 접고, 그 안에서 존을 가로로 편다.
     *
     * 지시 하나가 갈 수 있는 자리는 그 상품 온도대의 보관존·피킹존 둘뿐이다. 나머지(다른 온도대·
     * 반품존)는 위 `visibleRows`가 아예 걸러 내므로 여기 오지 않는다 — 한때 접어서 한 줄로 뒀는데,
     * 이 화면에서 영구히 못 쓰는 자리를 굳이 자리 잡아 둘 이유가 없었다.
     * 온도대가 섞인 입고건이면 그만큼 묶음이 여럿 뜨고, 접기는 그때 쓰인다.
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

    // 카드를 가리키면 그 온도대를 펼친다 — 접힌 묶음 안에 순위를 붙여 봐야 「추천이 있다는데 안 보인다」가 된다.
    // 위 펼침과 같은 렌더 중 조정이고, 접었다가 다시 가리키면 또 펼쳐진다(추천은 숨을 자리가 아니다)
    const [lastRankTmpZon, setLastRankTmpZon] = useState(null);
    const rankTmpZon = rankTask?.tmpZon ?? null;
    if (rankTmpZon !== lastRankTmpZon) {
        setLastRankTmpZon(rankTmpZon);
        if (rankTmpZon && !openTmpZons.has(rankTmpZon)) {
            setOpenState({ key: tmpZonKey, open: new Set([...openTmpZons, rankTmpZon]) });
        }
    }

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
            {/* 한 줄로 고정한다(h-5 · nowrap · truncate) — 카드를 가리킬 때마다 문구가 길어져 줄이 늘면
                그만큼 도면이 아래로 밀려, 보려던 칸이 눈앞에서 움직인다 */}
            <div className="flex items-center gap-3 text-[11px] text-slate-400 shrink-0 h-5 overflow-hidden">
                <span className="flex items-center gap-1 min-w-0 whitespace-nowrap">
                    <MapPin size={12} className="text-indigo-500 shrink-0" />
                    {activeTask && (
                        <span className="text-indigo-600 font-medium truncate">
                            {activeTask.prodNm} — 놓을 수 있는 칸만 진하게, 추천 자리에는 순위가 붙습니다
                        </span>
                    )}
                    {!activeTask && rankTask && (
                        <span className="flex items-center gap-1.5 min-w-0">
                            <span className="text-emerald-700 font-medium truncate">{rankTask.prodNm}</span>
                            {/* 지금 지시가 향하는 칸 — 66칸에 파란 배지 하나라 눈으로 찾기 어렵다.
                                「지금 어디로 가나」가 이 화면의 첫 질문이므로 추천보다 앞에 둔다 */}
                            <button type="button" onClick={() => scrollToLoc(targetLocOf(rankTask))}
                                    title="지금 지시 위치로 이동"
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded shrink-0
                                               bg-indigo-50 text-indigo-700 font-mono font-bold
                                               hover:bg-indigo-100 transition-colors">
                                <span className="text-[9px] font-sans">지금</span>
                                {targetLocOf(rankTask)}
                            </button>
                            {topRankLocCd && (
                                // 추천 칸이 스크롤 밖일 수 있다 — 순위만 칠해 두면 「추천이 있다는데 안 보인다」가 된다.
                                // 코드를 눌러 그 자리로 갈 수 있게 해 두면 도면이 길어져도 한 번에 닿는다
                                <button type="button" onClick={() => scrollToLoc(topRankLocCd)}
                                        title="추천 1순위 자리로 이동"
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded shrink-0
                                                   bg-emerald-50 text-emerald-700 font-mono font-bold
                                                   hover:bg-emerald-100 transition-colors">
                                    <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white
                                                     flex items-center justify-center text-[9px]">1</span>
                                    {topRankLocCd}
                                </button>
                            )}
                        </span>
                    )}
                    {!rankTask && <span className="truncate">카드에 올리면 그 칸이, 칸에 올리면 그 카드가 켜집니다</span>}
                </span>
                {/* 범례에 숫자를 넣지 않는다 — 「969 적재가능」처럼 쓰면 어느 칸의 실제 값으로 읽힌다 */}
                <span className="ml-auto flex items-center gap-2 shrink-0 whitespace-nowrap">
                    <Legend cls="bg-emerald-600 text-white">1</Legend>
                    <Legend cls="bg-white border border-emerald-500 text-emerald-700">2</Legend> 추천 순위
                    <Legend cls="bg-indigo-600 text-white">▶n</Legend> 지시
                    <Legend cls="bg-amber-400 text-amber-950">+n</Legend>
                    <Legend cls="bg-white border border-slate-300 text-slate-500">−n</Legend> 변경 예정
                    <span className="text-emerald-600 font-medium">초록 숫자</span> 적재가능
                </span>
            </div>
            <div className="flex-1 min-h-0 flex gap-3">
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
                                                  selectedLocCd={pickedLoc?.locCd}
                                                  onSelect={(r) => setPickedLoc(prev => (prev?.locCd === r.locCd ? null : r))}
                                                  badgeOf={availBadgeOf}
                                                  markOf={(r) => marks.get(r.locCd) ?? null}
                                                  rankOf={(r) => rankByLocCd.get(r.locCd) ?? null}
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
            {/* 칸을 누르면 그 자리에 무엇이 쌓여 있는지 — 상품·Lot·유통기한·예약까지 */}
            <LocStockPanel loc={pickedLoc} prodCd={rankTask?.prodCd ?? tasks[0]?.prodCd}
                           onClose={() => setPickedLoc(null)} />
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
