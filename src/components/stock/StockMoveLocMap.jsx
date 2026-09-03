import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, PackageSearch, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { invApi } from '@/api/invApi';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { fmtDe, num } from '@/utils/format';
import { Badge } from '@/components/common/Badge';
import ConfirmModal from '@/components/common/ConfirmModal';
import { ProdThumb } from '@/components/common/ProdThumb';
import LocStockPanel from '@/components/locmap/LocStockPanel';
import RackGrid from '@/components/locmap/RackGrid';
import { buildZones } from '@/components/locmap/locMapLayout';

/** 재고 조회 결과를 locCd → Lot 집합으로 접는다 — 추천이 「같은 Lot인가」를 보기 때문 */
const foldByLoc = (list) => {
    const byLoc = new Map();
    for (const x of list) {
        if (!byLoc.has(x.locCd)) byLoc.set(x.locCd, new Set());
        byLoc.get(x.locCd).add(x.lotNo);
    }
    return byLoc;
};

/** 도면에 순위를 붙일 후보 개수 — 적치 도면과 같은 수. 셋을 넘기면 「추천」이 아니라 또 하나의 목록이다 */
const RANK_COUNT = 3;

/** 이 수 이하면 상품 묶음을 전부 펼친 채로 연다 — 검색으로 좁힌 뒤에는 클릭 한 번이 아깝다 */
const AUTO_OPEN_MAX = 5;

/**
 * 재고이동 도면 — 왼쪽 기둥의 재고 카드를 오른쪽 창고 도면의 칸으로 끌어다 도착지를 정한다.
 *
 * 적치 도면(`PutawayLocMap`)과 같은 격자(`RackGrid`)·같은 상세 패널(`LocStockPanel`)을 쓰지만
 * 다루는 것이 다르다 — 적치는 이미 난 지시의 목적지를 고치는 화면이고, 여기는 아직 없는 지시를
 * 만드는 화면이다. 그래서 ▶은 「내 지시」가 아니라 그 자리로 이미 오기로 된 남의 물량이다.
 *
 * 자리를 정하는 방법이 셋인데 <b>기본은 클릭</b>이다 — 카드를 고르고 칸을 누르면 담긴다.
 * 적치 도면은 목적지가 이미 정해져 있고 가끔 고치는 화면이라 끌어놓기가 맞지만, 이동은
 * <b>모든 행이 목적지를 새로 정해야 해서</b> 그 동작이 매번 반복된다 — 32건이면 화면을 32번
 * 가로질러야 한다. 끌어놓기도 그대로 되고, 추천 1순위는 카드의 버튼 하나로 끝난다.
 *
 * 무엇으로 담든 서버에는 아무것도 가지 않는다 — 표 탭의 「이동수량 · 도착 로케이션」 두 칸을 채울 뿐이고
 * 등록은 두 탭 공통인 [이동지시 등록]이 한다. 도면은 드롭다운을 대신하는 입력기다:
 * 보관 자리가 100칸을 넘으면서 코드 목록에서 고르는 방식으로는 「어디가 비었나」를 알 수 없게 됐다.
 *
 * 드롭 가능 판정은 서버 규칙(`InvMovService.registerOne`)에 하나를 더한다 — 출발지 아님 ·
 * 상품 온도대 일치 · 적재가능수량 남음(보관 로케이션 여부는 맵이 STORAGE 전건이라 이미 만족),
 * 그리고 <b>반품존 아님</b>. 서버는 반품존행을 막지 않지만 실무에서 하지 않는 이동이라 도면에서
 * 아예 그리지 않는다. 반품존에서 <b>빼는</b> 이동은 정상 업무라 출발 칸이면 남긴다.
 * 정말 반품존에 넣어야 하면 표 탭의 드롭다운에서 고른다 — 서버 규칙은 그대로다.
 *
 * @param rows      이동 후보 재고 행들 (`qty` · `toLocCd`를 부모가 관리한다 — 표 탭과 같은 값)
 * @param loading   재고 조회가 아직 진행 중 — 빈 목록을 「없다」로 말하지 않으려고 받는다
 * @param onStage   (row, loc, qty) => void — 도착지·수량을 부모 행에 채운다
 * @param onUnstage (row) => void — 담아둔 도착지·수량을 지운다
 * @param reloadKey 값이 바뀌면 맵을 다시 조회한다 (등록 후 적재가능수량 갱신)
 */
export default function StockMoveLocMap({ rows, loading, onStage, onUnstage, reloadKey }) {
    const [mapRows, setMapRows] = useState(null);
    const [pickedInvId, setPickedInvId] = useState(null);  // 왼쪽 카드 클릭 → 고정. 추천 순위의 기준
    const [dragInvId, setDragInvId] = useState(null);
    const [dragOverLocCd, setDragOverLocCd] = useState(null);
    const [hoverLocCd, setHoverLocCd] = useState(null);    // 도면 hover → 그 칸이 출발·도착인 카드를 켠다
    const [pickedLoc, setPickedLoc] = useState(null);      // 칸 클릭 → 오른쪽 상세 패널
    const [drop, setDrop] = useState(null);                // { row, loc, qty, cap }
    const [arrows, setArrows] = useState([]);
    const canvasRef = useRef(null);
    const scrollRef = useRef(null);
    const qtyInputRef = useRef(null);

    useEffect(() => {
        invApi.locMap()
            .then(setMapRows)
            .catch((e) => {
                toast.error(e.message || '로케이션 맵 조회에 실패했습니다.');
                setMapRows([]);
            });
    }, [reloadKey]);

    useEffect(() => { qtyInputRef.current?.select(); }, [drop]);

    const byId = (id) => rows.find(r => r.invId === id) ?? null;
    const dragRow = dragInvId != null ? byId(dragInvId) : null;
    const pickedRow = pickedInvId != null ? byId(pickedInvId) : null;
    // 흐림·드롭 판정은 끌리는 카드만 본다 — 골라 두기만 해도 도면이 어두워지면 훑어보기가 방해된다
    const activeRow = drop?.row ?? dragRow;
    const rankRow = activeRow ?? pickedRow;

    /*
     * 칸별 표식 두 겹.
     *  ▶n      이미 나 있는 미완료 유입 — 적치지시 + 이동지시 잔량(맵의 inflowQty).
     *          적재가능수량에는 이미 빠져 있지만 숫자만으로는 「1,200자리인데 왜 적재가능이 300이지」에
     *          답할 수 없다. 적치 도면이 지시 목적지를 ▶로 그리는 것과 같은 자리다.
     *  +n / −n 이 화면에서 담아둔 것. 아직 서버에 없다.
     */
    const { marks, links } = useMemo(() => {
        const marks = new Map();
        const at = (cd) => {
            if (!marks.has(cd)) marks.set(cd, { drct: 0, pendingIn: 0, pendingOut: 0 });
            return marks.get(cd);
        };
        for (const m of mapRows ?? []) {
            if (m.inflowQty > 0) at(m.locCd).drct = m.inflowQty;
        }
        const links = [];
        for (const r of rows) {
            const qty = Number(r.qty) || 0;
            if (!r.toLocCd || qty <= 0) continue;
            at(r.locCd).pendingOut += qty;
            at(r.toLocCd).pendingIn += qty;
            links.push({ key: r.invId, from: r.locCd, to: r.toLocCd, qty });
        }
        return { marks, links };
    }, [rows, mapRows]);

    /*
     * 「이 상품이 이미 있는 자리」 — 추천의 재료이자 도면에 그리는 표시다. 이동의 첫 이유가
     * 흩어진 재고를 합치는 것이라, 관리자가 도면을 켜고 처음 하는 질문이 「내 상품이 지금 어디어디
     * 있나」다. 고정 자리(fxngProdCd)는 맵이 이미 갖고 있지만 이건 재고 조회라야 안다.
     *
     * Lot까지 들고 있는 이유는 같은 상품이라고 다 좋은 자리가 아니어서다. 같은 Lot이면 합치는
     * 것이고, 다른 Lot이면 한 칸에 유통기한이 섞여 선반 앞의 작업자가 눈으로 갈라야 한다.
     * 재고 키가 상품+로케이션+Lot이라 시스템은 허용하고 FEFO 할당도 갈라내지만, 실물이 섞인다.
     *
     * 가리키는 것마다 부르지 않고 고정(클릭)·끌기일 때만 부른다 — 카드 위를 스치는 것만으로
     * 상품 수만큼 요청이 나가면 원격 DB에서 화면이 멈춘다.
     */
    const [sameProdLocs, setSameProdLocs] = useState(new Map());
    const inFlight = useRef(new Set());
    // StrictMode가 마운트를 접었다 편다 — setup에서 다시 켜지 않으면 이후 응답이 전부 버려진다
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const rankProdCd = rankRow?.prodCd ?? null;
    useEffect(() => {
        if (!rankProdCd || sameProdLocs.has(rankProdCd) || inFlight.current.has(rankProdCd)) return;
        inFlight.current.add(rankProdCd);
        const remember = (list) => {
            inFlight.current.delete(rankProdCd);
            if (mounted.current) setSameProdLocs(prev => new Map(prev).set(rankProdCd, foldByLoc(list)));
        };
        invApi.list({ prodCd: rankProdCd, locTyp: 'STORAGE' })
            .then(remember)
            // 추천은 보조 정보다 — 못 받아도 드롭은 그대로 되므로 토스트로 방해하지 않는다
            .catch(() => remember([]));
    }, [rankProdCd, sameProdLocs]);

    /**
     * 이 칸에 지금 고른 재고의 상품이 이미 있나 — 'lot'(같은 Lot) · 'prod'(같은 상품 다른 Lot) · null.
     * 출발 칸은 뺀다: 「여기 같은 Lot이 있다」는 자기 자신이라 아무것도 말해 주지 않는다.
     */
    // 바깥에서 목록을 꺼내 두지 않고 안에서 찾는다 — 판정 함수만 돌려주는 형태라야
    // React Compiler가 이 useMemo를 그대로 지킨다(droppableOf와 같은 모양)
    const sameProdOf = useMemo(() => (r) => {
        const byLoc = rankRow ? sameProdLocs.get(rankRow.prodCd) : null;
        if (!byLoc || r.locCd === rankRow.locCd) return null;
        const lots = byLoc.get(r.locCd);
        if (!lots) return null;
        return lots.has(rankRow.lotNo) ? 'lot' : 'prod';
    }, [rankRow, sameProdLocs]);

    /** 드롭 가능 판정 — 서버 규칙(InvMovService.registerOne)과 같은 셋 */
    const droppableOf = useMemo(() => (r) => {
        if (!activeRow) return { ok: false, reason: '왼쪽에서 재고를 끌어오세요' };
        return canDrop(activeRow, r);
    }, [activeRow]);

    /*
     * 추천 순위 — 「놓을 수 있다」(밝은 칸)와 「여기가 좋다」는 다른 질문이다.
     *
     * 적치는 순위의 주인이 서버(적치 우선순위 ptawy_prty)지만 이동에는 그런 전략이 없다 —
     * 서버가 내려주는 순서가 없으므로 화면이 정한다. 갈라질 서버 기준이 없어서 생기는 차이다.
     * 이동을 하는 이유대로 매긴다: ① 그 상품의 고정 자리(보충 성격) ② 같은 상품 같은 Lot이 있는 자리
     * (합치면 자리가 하나 빈다) ③ 빈 자리 ④ 같은 상품 다른 Lot ⑤ 다른 상품이 있는 자리.
     *
     * 같은 상품이어도 Lot이 다르면 뒤로 민다 — 한 칸에 유통기한이 섞이면 선반 앞의 작업자가 눈으로
     * 갈라야 한다. 그래도 빈 자리 바로 다음에 두는 것은, 한 자리에 한 상품이 유지되는 편이
     * 재고조사와 적치 동선에 낫기 때문이다(다른 상품과 섞이는 것보다는 낫다).
     *
     * 같은 등급 안에서는 로케이션 코드 오름차순 — 코드가 「존-통로-랙-층」이라 통로 → 랙 → 층 순이
     * 되어 적치 우선순위와 같은 동선을 탄다.
     *
     * 필요한 만큼 안 들어가는 칸은 뺀다 — 나눠 담을 수는 있어도 「추천」은 아니다.
     */
    const rankByLocCd = useMemo(() => {
        if (!rankRow || !mapRows) return new Map();
        const need = Number(rankRow.qty) || rankRow.avalQty;
        const grade = (r) => {
            if (r.fxngProdCd === rankRow.prodCd) return 0;
            const kind = sameProdOf(r);
            if (kind === 'lot') return 1;
            if (r.onHandQty === 0) return 2;
            if (kind === 'prod') return 3;
            return 4;
        };
        // 판정 기준은 rankRow다 — droppableOf는 끌 때만 값이 있는 activeRow를 본다
        const usable = (r) => canDrop(rankRow, r).ok && (r.availQty == null || r.availQty >= need);
        return new Map(mapRows
            .filter(usable)
            .sort((a, b) => grade(a) - grade(b) || a.locCd.localeCompare(b.locCd))
            .slice(0, RANK_COUNT)
            .map((r, i) => [r.locCd, i + 1]));
    }, [rankRow, mapRows, sameProdOf]);

    /*
     * 왼쪽 목록을 상품별로 묶는다 — 이동의 첫 이유가 <b>흩어진 재고 합치기</b>인데,
     * 평평한 목록에서는 「삼다수가 일곱 자리에 있다」를 눈으로 세어야 했다.
     * 흩어진 상품이 위로 오게 자리 수 내림차순 — 합칠 대상이 곧 위쪽이다.
     */
    const prodGroups = useMemo(() => {
        const byProd = new Map();
        for (const r of rows) {
            if (!byProd.has(r.prodCd)) {
                byProd.set(r.prodCd, {
                    prodCd: r.prodCd, prodNm: r.prodNm, tmpZon: r.tmpZon, imgUrl: r.prodImgUrl, rows: [],
                });
            }
            byProd.get(r.prodCd).rows.push(r);
        }
        return [...byProd.values()].map(g => ({
            ...g,
            locCount: new Set(g.rows.map(r => r.locCd)).size,
            totalQty: g.rows.reduce((t, r) => t + r.avalQty, 0),
            stagedCount: g.rows.filter(r => r.toLocCd && Number(r.qty) > 0).length,
        })).sort((a, b) => b.locCount - a.locCount || a.prodNm.localeCompare(b.prodNm));
    }, [rows]);

    /*
     * 펼침 기본값 — 상품이 적으면(검색으로 좁힌 뒤) 전부 펼쳐 클릭 한 번을 아끼고,
     * 많으면(전건 조회) 전부 접어 「무엇이 몇 자리에 흩어졌나」부터 보이게 한다.
     */
    const prodKey = prodGroups.map(g => g.prodCd).join(',');
    const defaultOpenProds = () => new Set(
        prodGroups.length <= AUTO_OPEN_MAX ? prodGroups.map(g => g.prodCd) : []);
    const [prodOpen, setProdOpen] = useState(() => ({ key: prodKey, open: defaultOpenProds() }));
    const openProdCds = prodOpen.key === prodKey ? prodOpen.open : defaultOpenProds();
    if (prodOpen.key !== prodKey) {
        setProdOpen({ key: prodKey, open: openProdCds });
    }
    const toggleProd = (cd) => setProdOpen(prev => {
        const next = new Set(prev.key === prodKey ? prev.open : openProdCds);
        if (next.has(cd)) next.delete(cd); else next.add(cd);
        return { key: prodKey, open: next };
    });

    const topRankLocCd = [...rankByLocCd.entries()].find(([, rank]) => rank === 1)?.[0] ?? null;
    /** 추천 1순위 칸 자체 — 고른 카드에 「여기로」 버튼을 달아 클릭 한 번으로 끝내려고 든다 */
    const topRankLoc = topRankLocCd ? (mapRows ?? []).find(m => m.locCd === topRankLocCd) ?? null : null;

    /*
     * 칸 아래 적재가능수량 — 지금 옮기려는 만큼 안 들어가는 칸만 주황으로 세우고 넉넉한 칸은 흐리게 둔다.
     * 100칸이 전부 같은 초록이면 「어디가 빠듯한가」를 숫자로 하나씩 읽어야 안다.
     */
    const availBadgeOf = useMemo(() => {
        const need = rankRow ? (Number(rankRow.qty) || rankRow.avalQty) : null;
        return (r) => {
            if (r.availQty == null) return { text: '∞', tone: 'muted' };
            const tone = need == null ? 'muted' : r.availQty < need ? 'tight' : 'ok';
            return { text: num(r.availQty), tone };
        };
    }, [rankRow]);

    /*
     * 그릴 칸 — 이 화면에서 <b>영구히</b> 못 쓰는 자리는 그리지 않는다.
     *
     * <b>카드를 고르면 그 온도대만</b> 그린다. 온도대를 넘는 이동은 서버가 거부하므로
     * (`InvMovService.registerOne`) 다른 온도대는 그 카드로는 영원히 못 쓰는 자리다 —
     * 상온 재고 하나를 고르면 냉장 28칸 + 냉동 16칸이 화면의 40%를 차지하고 있었다.
     * 적치 도면이 입고건의 온도대만 그리는 것과 같은 처리다.
     * 고르지 않았으면 목록에 있는 온도대를 전부 그린다 — 그때는 훑어보는 화면이다.
     *
     * 반품존도 뺀다(넣지 않기로 한 자리). 다만 출발 칸과 담아둔 도착 칸은 예외 없이 남긴다 —
     * 반품존에서 빼는 이동이 정상 업무라 그 칸이 사라지면 −나갈 표식과 화살표가 갈 곳을 잃는다.
     * 카드를 고른 동안에는 <b>그 카드의 것만</b> 남긴다: 다른 건의 반품존 출발지까지 남기면
     * 지금 쓸 수 없는 칸이 도로 낀다.
     */
    const visibleRows = useMemo(() => {
        const tmpZons = rankRow
            ? new Set([rankRow.tmpZon])
            : new Set(rows.map(r => r.tmpZon).filter(Boolean));
        const pinSource = rankRow ? [rankRow] : rows;
        const pinned = new Set(pinSource.flatMap(r => [r.locCd, r.toLocCd]).filter(Boolean));
        return (mapRows ?? []).filter(r => pinned.has(r.locCd)
            || (r.bizDvsn !== 'RTNGS' && (tmpZons.size === 0 || tmpZons.has(r.tmpZon))));
    }, [mapRows, rows, rankRow]);

    // 가만히 있을 땐 아무것도 흐리지 않는다 — 도면은 먼저 「무엇이 어디로 가나」를 보여주는 그림이다
    const zones = useMemo(
        () => buildZones(visibleRows, (r) => (activeRow ? droppableOf(r).ok : true)),
        [visibleRows, activeRow, droppableOf],
    );

    /** 온도대로 접고 그 안에서 존을 가로로 편다 — 적치 도면과 같은 묶음 규칙 */
    const groups = useMemo(() => {
        const TMP_ORDER = ['DRY', 'CHL', 'FRZ'];
        const DVSN_ORDER = ['STRG', 'PIKNG', 'RTNGS'];
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
                pendingQty: zs.reduce((s, z) =>
                    s + z.all.reduce((a, c) => a + (marks.get(c.locCd)?.pendingIn ?? 0), 0), 0),
            }));
    }, [zones, marks]);

    // 펼침은 목록의 온도대로 시작하고 그 뒤로는 사용자가 접고 편다. 온도대 구성이 바뀌면 다시 맞춘다 —
    // effect로 되돌리면 한 번 잘못 그린 뒤 고치는 꼴이라 렌더 중에 키를 비교해 파생시킨다
    const tmpZonKey = [...new Set(rows.map(r => r.tmpZon).filter(Boolean))].sort().join(',');
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

    /*
     * 펼침 상태. 카드를 고르면 위 `visibleRows`가 그 온도대만 남기므로 묶음이 하나뿐이고,
     * 그 하나를 펼친다. 선택을 풀면 다시 전부 펼친다 — 그때가 훑어보는 화면이다.
     *
     * 접기는 <b>고르지 않았을 때</b>의 장치로 남는다(온도대가 섞인 목록을 훑을 때).
     */
    const [lastRankTmpZon, setLastRankTmpZon] = useState(null);
    const rankTmpZon = rankRow?.tmpZon ?? null;
    if (rankTmpZon !== lastRankTmpZon) {
        setLastRankTmpZon(rankTmpZon);
        const next = rankTmpZon
            ? new Set([rankTmpZon])
            : new Set(tmpZonKey ? tmpZonKey.split(',') : []);
        setOpenState({ key: tmpZonKey, open: next });
    }

    // block은 'start'다 — 'nearest'는 섹션이 스크롤 상자 밖일 때 Chrome에서 아무것도 하지 않는다
    const scrollToTmpZon = (tmpZon) => {
        scrollRef.current?.querySelector(`section[data-tmpzon="${tmpZon}"]`)
            ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    const scrollToLoc = (locCd) => {
        scrollRef.current?.querySelector(`[data-loccd="${CSS.escape(locCd)}"]`)
            ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    // 카드를 고르면 그 온도대 존으로 — 상온 도면 앞에서 냉동 재고를 찾아 내려가지 않게
    useEffect(() => { if (rankTmpZon) scrollToTmpZon(rankTmpZon); }, [rankTmpZon]);

    const openDrop = (row, loc) => {
        // 적재가능수량이 가용보다 적으면 그만큼만 담는 것이 기본값이다 — 나머지는 다른 자리로 다시 담는다
        const cap = loc.availQty == null ? row.avalQty : Math.min(row.avalQty, loc.availQty);
        setDrop({ row, loc, qty: String(cap), cap });
    };

    const onDropTo = (loc) => {
        if (!dragRow) return;
        openDrop(dragRow, loc);
        setDragInvId(null);
    };

    /*
     * 칸 클릭의 뜻은 <b>카드를 골랐는지</b>로 갈린다.
     *   고른 상태 = 자리를 정하는 중 → 담기(수량 모달). 상세도 함께 열어 두어, 취소하면
     *               그 칸에 무엇이 있는지 보고 다시 정할 수 있다.
     *   안 고른 상태 = 훑어보는 중 → 상세만.
     * 끌어놓기 하나로는 32건을 매번 화면 가로질러 옮겨야 해서, 주된 동작을 클릭으로 옮겼다.
     */
    const onCellClick = (loc) => {
        if (!pickedRow) {
            setPickedLoc(prev => (prev?.locCd === loc.locCd ? null : loc));
            return;
        }
        setPickedLoc(loc);
        const verdict = canDrop(pickedRow, loc);
        if (!verdict.ok) {
            toast.error(verdict.reason);
            return;
        }
        openDrop(pickedRow, loc);
    };

    const confirmDrop = () => {
        const qty = Number(drop.qty);
        if (!(qty > 0)) {
            toast.error('이동수량은 1 이상이어야 합니다.');
            return;
        }
        if (qty > drop.cap) {
            toast.error(`담을 수 있는 수량(${num(drop.cap)})을 초과했습니다.`);
            return;
        }
        onStage(drop.row, drop.loc, qty);
        setDrop(null);
    };

    // ── 이동 화살표 — 출발 칸 → 도착 칸. 칸의 DOM 좌표를 재서 겹침 상자 기준으로 그린다.
    //    상자가 스크롤 내용물 안이라 스크롤엔 영향받지 않고, 배치가 바뀔 때만 다시 잰다 ──
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

    if (mapRows === null) {
        return <p className="text-sm text-slate-400 py-8 text-center">로케이션 맵을 불러오는 중…</p>;
    }

    // 고른 카드가 있으면 칸 상세에서 바로 보낼 수 있다 — 칸을 눌러 내용을 확인한 그 자리가 결정하는 자리다
    const panelDrop = pickedLoc && pickedRow ? { ...canDrop(pickedRow, pickedLoc), row: pickedRow } : null;

    return (
        <div className="flex gap-3 h-full min-h-0">
            {/* 왼쪽 기둥: 「무엇을」 — 조회된 재고 카드. 끌어서 도면에 놓거나, 골라 두고 칸 상세에서 보낸다 */}
            <aside className="w-64 shrink-0 flex flex-col min-h-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100 shrink-0 flex items-center gap-2">
                    <PackageSearch size={14} className="text-indigo-600" />
                    <span className="text-xs font-bold text-slate-700">이동할 재고</span>
                    <span className="ml-auto text-[11px] text-slate-400 tabular-nums">
                        {loading ? '…' : `${num(prodGroups.length)}상품 · ${num(rows.length)}건`}
                    </span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {rows.length === 0 && (
                        <p className="py-8 text-center text-xs text-slate-400">
                            {loading ? '불러오는 중…' : '조회된 보관 재고가 없습니다'}
                        </p>
                    )}
                    {prodGroups.map(g => (
                        <div key={g.prodCd}>
                            <ProdGroupHeader group={g}
                                             open={openProdCds.has(g.prodCd)}
                                             onToggle={() => toggleProd(g.prodCd)} />
                            {openProdCds.has(g.prodCd) && g.rows.map(r => (
                                <StockCard key={r.invId} row={r}
                                           topRankLoc={pickedInvId === r.invId ? topRankLoc : null}
                                           onSendTop={() => openDrop(r, topRankLoc)}
                                           picked={pickedInvId === r.invId}
                                           dragging={dragInvId === r.invId}
                                           highlight={hoverLocCd != null && (hoverLocCd === r.locCd || hoverLocCd === r.toLocCd)}
                                           onPick={() => setPickedInvId(prev => (prev === r.invId ? null : r.invId))}
                                           onDragStart={() => { setDragInvId(r.invId); setPickedInvId(r.invId); }}
                                           onDragEnd={() => setDragInvId(null)}
                                           onGoTo={() => scrollToLoc(r.toLocCd || r.locCd)}
                                           onUnstage={() => onUnstage(r)} />
                            ))}
                        </div>
                    ))}
                </div>
            </aside>

            <div className="flex-1 min-w-0 flex flex-col gap-2 min-h-0">
                {/* 한 줄로 고정한다(h-5 · nowrap · truncate) — 문구가 길어져 줄이 늘면 그만큼 도면이 아래로 밀린다 */}
                <div className="flex items-center gap-3 text-[11px] text-slate-400 shrink-0 h-5 overflow-hidden">
                    <span className="flex items-center gap-1 min-w-0 whitespace-nowrap">
                        <MapPin size={12} className="text-indigo-500 shrink-0" />
                        {activeRow && (
                            <span className="text-indigo-600 font-medium truncate">
                                {activeRow.prodNm} — 놓을 수 있는 칸만 진하게, 추천 자리에는 순위가 붙습니다
                            </span>
                        )}
                        {!activeRow && rankRow && (
                            <span className="flex items-center gap-1.5 min-w-0">
                                <span className="text-emerald-700 font-medium truncate">{rankRow.prodNm}</span>
                                <span className="shrink-0 text-emerald-700">— 칸을 누르면 담깁니다</span>
                                <button type="button" onClick={() => scrollToLoc(rankRow.locCd)}
                                        title="출발 자리로 이동"
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded shrink-0
                                                   bg-slate-100 text-slate-600 font-mono font-bold
                                                   hover:bg-slate-200 transition-colors">
                                    <span className="text-[9px] font-sans">출발</span>
                                    {rankRow.locCd}
                                </button>
                                {topRankLocCd && (
                                    // 추천 칸이 스크롤 밖일 수 있다 — 눌러 그 자리로 갈 수 있게 코드를 함께 적는다
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
                        {!rankRow && <span className="truncate">왼쪽에서 재고를 고른 뒤 칸을 누르면 도착지가 정해집니다 (끌어다 놓아도 됩니다)</span>}
                    </span>
                    <span className="ml-auto flex items-center gap-2 shrink-0 whitespace-nowrap">
                        <Legend cls="bg-emerald-600 text-white">1</Legend>
                        <Legend cls="bg-white border border-emerald-500 text-emerald-700">2</Legend> 추천
                        <Legend cls="bg-white ring-2 ring-inset ring-indigo-500 text-white">·</Legend> 같은 Lot
                        <Legend cls="bg-white ring-2 ring-inset ring-amber-400 text-white">·</Legend> 다른 Lot
                        <Legend cls="bg-indigo-600 text-white">▶n</Legend> 기존 지시
                        <Legend cls="bg-amber-400 text-amber-950">+n</Legend>
                        <Legend cls="bg-white border border-slate-300 text-slate-500">−n</Legend> 담아둔 이동
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
                                            <div className="flex flex-wrap gap-3 items-start">
                                                <RackGrid zones={g.zones}
                                                          compact
                                                          droppableOf={activeRow ? droppableOf : undefined}
                                                          onDropTo={onDropTo}
                                                          dragOverLocCd={dragOverLocCd}
                                                          onDragOverCell={(r) => setDragOverLocCd(r?.locCd ?? null)}
                                                          onHover={(tip) => setHoverLocCd(tip?.r.locCd ?? null)}
                                                          selectedLocCd={pickedLoc?.locCd}
                                                          onSelect={onCellClick}
                                                          badgeOf={availBadgeOf}
                                                          markOf={(r) => marks.get(r.locCd) ?? null}
                                                          rankOf={(r) => rankByLocCd.get(r.locCd) ?? null}
                                                          sameProdOf={sameProdOf} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {arrows.length > 0 && (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
                                    <defs>
                                        <marker id="invmov-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                                                markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                                            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-amber-500" />
                                        </marker>
                                    </defs>
                                    {arrows.map(a => (
                                        <g key={a.key}>
                                            <line x1={a.x} y1={a.y} x2={a.x2} y2={a.y2}
                                                  className="stroke-amber-500" strokeWidth="2" strokeDasharray="5 4"
                                                  markerEnd="url(#invmov-arrow)" />
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

                    {/* 칸을 누르면 그 자리에 무엇이 쌓여 있는지 — 고른 재고가 있으면 여기서 바로 보낸다 */}
                    <LocStockPanel loc={pickedLoc} prodCd={rankRow?.prodCd}
                                   onClose={() => setPickedLoc(null)}
                                   action={panelDrop && (
                                       <button type="button" disabled={!panelDrop.ok}
                                               title={panelDrop.ok ? undefined : panelDrop.reason}
                                               onClick={() => openDrop(panelDrop.row, pickedLoc)}
                                               className="w-full btn-primary justify-center disabled:opacity-40">
                                           {panelDrop.ok ? '이 자리로 보내기' : panelDrop.reason}
                                       </button>
                                   )} />
                </div>
            </div>

            {/* 드롭 직후 수량 — 기본값은 「넣을 수 있는 만큼 전부」라 그냥 [담기]만 눌러도 된다 */}
            {drop && (
                <ConfirmModal title="도착 로케이션 지정" confirmText="담기"
                              onCancel={() => setDrop(null)} onConfirm={confirmDrop}>
                    <p className="text-sm text-slate-500">
                        <span className="text-slate-400">{drop.row.prodNm} · {drop.row.lotNo} · </span>
                        <b className="font-mono text-slate-600">{drop.row.locCd}</b>
                        {' → '}
                        <b className="font-mono text-indigo-700">{drop.loc.locCd}</b>
                    </p>
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-slate-600 shrink-0">이동수량</label>
                        <input ref={qtyInputRef} type="number" min={1} max={drop.cap} value={drop.qty}
                               autoFocus
                               onChange={(e) => setDrop(prev => ({ ...prev, qty: e.target.value }))}
                               className="w-24 input-base text-right tabular-nums" />
                        <span className="text-xs text-slate-400">
                            가용 {num(drop.row.avalQty)}
                            {drop.cap < drop.row.avalQty && ` · 적재가능 ${num(drop.cap)}`}
                        </span>
                    </div>
                    <p className="text-xs text-slate-400">
                        화면에 담아두기만 하고 서버에는 [이동지시 등록]이 반영합니다 — 등록 시점에 재고가 예약됩니다.
                    </p>
                </ConfirmModal>
            )}
        </div>
    );
}

/**
 * 도착지로 쓸 수 있나 — 서버 규칙(`InvMovService.registerOne`) 셋에 반품존 금지를 더한 넷.
 * 보관 로케이션 여부는 맵이 STORAGE 전건이라 이미 만족하고, 가용재고 초과는 수량 입력에서 막는다.
 */
const canDrop = (row, loc) => {
    if (loc.locCd === row.locCd) return { ok: false, reason: '출발지와 같은 자리입니다' };
    if (loc.bizDvsn === 'RTNGS') return { ok: false, reason: '반품존은 이동 도착지가 아닙니다' };
    if (loc.tmpZon !== row.tmpZon) {
        return { ok: false, reason: `온도대가 다릅니다 (상품 ${row.tmpZon} / 로케이션 ${loc.tmpZon})` };
    }
    if (loc.availQty === 0) return { ok: false, reason: '적재가능수량이 없습니다' };
    return { ok: true };
};

const Legend = ({ cls, children }) => (
    <span className={`px-1 py-0.5 rounded text-[9px] font-bold leading-none ${cls}`}>{children}</span>
);

/** 온도대 묶음 머리 — 접힌 상태에서도 「여기로 담아둔 게 얼마나 되나」는 남긴다 */
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
            {group.pendingQty > 0 && (
                <span className="ml-auto px-1 py-0.5 rounded bg-amber-400 text-amber-950 text-[9px] font-bold leading-none">
                    +{num(group.pendingQty)}
                </span>
            )}
        </button>
    );
};

/**
 * 상품 묶음 머리 — 「이 상품이 몇 자리에 흩어져 있나」가 여기 한 줄에 나온다.
 * 두 자리 이상이면 자리 수를 세워 표시한다: 그게 곧 합칠 대상이다.
 */
const ProdGroupHeader = ({ group, open, onToggle }) => {
    const Chevron = open ? ChevronDown : ChevronRight;
    const scattered = group.locCount > 1;
    return (
        <button type="button" onClick={onToggle}
                title={open ? '접기' : '펼치기'}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-left
                           border-b border-slate-100 bg-slate-50/60 hover:bg-slate-100 transition-colors">
            <Chevron size={13} className="shrink-0 text-slate-400" />
            <ProdThumb src={group.imgUrl} alt={group.prodNm} tmpZon={group.tmpZon} size={24} />
            <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-slate-700 truncate" title={group.prodNm}>
                    {group.prodNm}
                </span>
                <span className="block text-[10px] text-slate-400 tabular-nums">
                    <b className={scattered ? 'text-indigo-600' : ''}>{group.locCount}자리</b>
                    {/* 한 자리에 Lot이 여럿이면 줄 수와 자리 수가 다르다 — 다를 때만 건수를 덧붙인다 */}
                    {group.rows.length !== group.locCount && ` · ${num(group.rows.length)}건`}
                    {' · '}{num(group.totalQty)}개
                </span>
            </span>
            {group.stagedCount > 0 && (
                <span className="shrink-0 px-1 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                    담김 {group.stagedCount}
                </span>
            )}
        </button>
    );
};

/** 재고 카드 하나 — 끌기 원천. 담아둔 도착지가 있으면 카드 안에 「→ 도착지 수량」으로 남긴다 */
const StockCard = ({
    row, topRankLoc, onSendTop, picked, dragging, highlight, onPick, onDragStart, onDragEnd, onGoTo, onUnstage,
}) => {
    const staged = row.toLocCd && Number(row.qty) > 0;
    return (
        <div draggable
             onDragStart={onDragStart}
             onDragEnd={onDragEnd}
             onClick={onPick}
             className={`pl-4 pr-2.5 py-2 border-b border-slate-50 border-l-2 border-l-slate-100
                 cursor-grab active:cursor-grabbing transition-colors
                 ${dragging ? 'opacity-40' : ''}
                 ${picked ? 'bg-indigo-50' : highlight ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
            <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700 font-mono truncate">{row.locCd}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate" title={row.lotNo}>{row.lotNo}</p>
                    {/* 유통기한 — 임박 재고를 앞자리로 빼는 것도 이동의 이유라 고를 때 보여야 한다 */}
                    <p className="text-[10px] text-slate-400">
                        {row.expiryDt ? `~${fmtDe(row.expiryDt)}` : '유통기한 미관리'}
                    </p>
                </div>
                <span className="shrink-0 text-right">
                    <span className="block text-xs font-bold text-emerald-600 tabular-nums">{num(row.avalQty)}</span>
                    <span className="block text-[9px] text-slate-400">가용</span>
                </span>
            </div>
            {/* 대부분의 건은 추천 1순위로 간다 — 그 한 자리를 고르려고 도면을 가로질러 끌게 하지 않는다.
                카드를 누른 직후 눈이 머무는 곳이 이 카드라, 버튼도 여기 둔다 */}
            {topRankLoc && !staged && (
                <button type="button"
                        onClick={(e) => { e.stopPropagation(); onSendTop(); }}
                        title={`추천 1순위 ${topRankLoc.locCd}로 담기`}
                        className="mt-1 w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold
                                   bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                    <span className="w-3.5 h-3.5 shrink-0 rounded-full bg-emerald-600 text-white
                                     flex items-center justify-center text-[9px]">1</span>
                    <span className="font-mono truncate">{topRankLoc.locCd}</span>
                    <span className="ml-auto shrink-0">여기로</span>
                </button>
            )}
            {/* 담아둔 것은 담은 자리에서 지울 수 있어야 한다 — 표 탭으로 건너가 셀을 비우게 하면
                도면만 보고 일하던 흐름이 끊긴다(적치 도면의 [담아둔 변경 취소]와 같은 자리) */}
            {staged && (
                <div className="mt-1 flex items-center rounded bg-amber-50 text-amber-800 overflow-hidden">
                    <button type="button"
                            onClick={(e) => { e.stopPropagation(); onGoTo(); }}
                            title="도착 자리로 이동"
                            className="flex-1 min-w-0 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold
                                       hover:bg-amber-100 transition-colors">
                        → <span className="font-mono truncate">{row.toLocCd}</span>
                        <span className="ml-auto tabular-nums shrink-0">{num(Number(row.qty))}개</span>
                    </button>
                    <button type="button"
                            onClick={(e) => { e.stopPropagation(); onUnstage(); }}
                            title="담아둔 이동 취소" aria-label="담아둔 이동 취소"
                            className="shrink-0 px-1 py-1 text-amber-500 hover:text-rose-600 hover:bg-amber-100">
                        <X size={11} />
                    </button>
                </div>
            )}
        </div>
    );
};
