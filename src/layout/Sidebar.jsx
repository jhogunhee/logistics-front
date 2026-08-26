import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
    ArrowLeftRight,
    Barcode,
    BookOpen,
    Box,
    Calculator,
    SlidersHorizontal,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    CheckCircle2,
    ClipboardCheck,
    ClipboardList,
    FileInput,
    FileOutput,
    FilePlus,
    Handshake,
    Hash,
    History,
    Layers,
    LayoutDashboard,
    LayoutGrid,
    ListChecks,
    ListTree,
    LogOut,
    MapPin,
    PackageCheck,
    PackageOpen,
    PackagePlus,
    PauseCircle,
    Pin,
    Printer,
    Repeat,
    Ruler,
    ScrollText,
    Search,
    Send,
    Settings2,
    ShieldCheck,
    Shuffle,
    Smartphone,
    Sparkles,
    Split,
    Store,
    Tags,
    Truck,
    Users,
    Warehouse,
    Waves,
    X,
} from "lucide-react";

import { matchesSearch } from "@/utils/hangul";
import { useAuth } from "@/auth/AuthContext";
import { roleLabels } from "@/auth/roles";

// 메뉴를 JSX가 아니라 데이터로 둔다 — 검색이 이 배열을 걸러 렌더하기 때문이다.
// keywords는 라벨에 없는 검색어를 잡아주는 보조어다 (약어 · 영문 · 업무에서 부르는 다른 이름).
//
// roles는 그 그룹(또는 항목)을 보는 역할이다. 없으면 로그인한 누구나 본다.
// 조회(INQ)는 모든 화면을 보되 저장이 막힌다 — 화면을 감추는 것은 편의일 뿐이고 막는 것은 백엔드다.
const MENU = [
    {
        title: "모니터링",
        items: [
            { to: "/", label: "대시보드", icon: LayoutDashboard, keywords: "dashboard 홈 메인" },
        ],
    },
    {
        title: "OMS",
        roles: ["ADMR", "ODR_PIC", "INQ"],
        items: [
            { to: "/oms/inbound-order", label: "입고주문", icon: FileInput, keywords: "발주 po purchase order 등록" },
            { to: "/oms/inbound-orders", label: "입고주문 관리", icon: ClipboardList, keywords: "발주 목록 확정 취소 삭제" },
            { to: "/oms/ato-odr", label: "자동발주 산정", icon: Sparkles, keywords: "ato auto 자동 발주점 순재고 제안 스케줄" },
            { to: "/oms/outbound-order", label: "출고주문", icon: FileOutput, keywords: "수주 so 점포 등록" },
            { to: "/oms/outbound-orders", label: "출고주문 관리", icon: FilePlus, keywords: "수주 목록 취소" },
        ],
    },
    {
        title: "입고",
        roles: ["ADMR", "CENT_ADMR", "IB_PIC", "INQ"],
        items: [
            { to: "/inbound/asn", label: "입고예정(ASN) 관리", icon: Truck, keywords: "asn 예정 inbound" },
            { to: "/inbound/receiving", label: "입고검수", icon: ClipboardCheck, keywords: "검수 수령 receiving lot 제조일자" },
            { to: "/inbound/putaway-order", label: "적치지시", icon: ListChecks, keywords: "putaway 지시 로케이션 배정" },
            { to: "/inbound/putaway", label: "적치", icon: PackageOpen, keywords: "putaway 이동 보관" },
            { to: "/inbound/confirm", label: "입고확정", icon: CheckCircle2, keywords: "확정 confirm 결품 마감" },
        ],
    },
    {
        title: "재고",
        roles: ["ADMR", "CENT_ADMR", "INV_PIC", "INQ"],
        items: [
            { to: "/stock/status", label: "현재고 조회", icon: Box,
              keywords: "inventory 재고 현황 수량 map 맵 점유 로케이션 평면도 구조도 랙 베이 레벨 빈자리 occupancy" },
            { to: "/stock/history", label: "재고 이력 조회", icon: History, keywords: "inventory history 원장 입출고" },
            { to: "/stock/attribute", label: "재고 속성변경", icon: Tags, keywords: "lot 유통기한 제조일자 정정 변경 전량 라벨 유지" },
            { to: "/stock/lot-change", label: "재고 로트변경", icon: Split, keywords: "lot 로트 분할 병합 부분 수량 정정 split merge" },
            { to: "/stock/hold", label: "재고 보류", icon: PauseCircle, keywords: "hold 출고 금지" },
            { to: "/stock/move", label: "재고 이동", icon: ArrowLeftRight, keywords: "move 로케이션 이동 지시 예약 등록 확정 취소" },
            { to: "/stock/spmt", label: "정기 보충", icon: Repeat, keywords: "보충 replenish spmt min max 피킹존 고정로케이션 fefo 재보충점" },
            { to: "/stock/count", label: "재고조사", icon: Calculator, keywords: "실사 count 차이 오차 전산수량 블라인드" },
            { to: "/stock/adjust", label: "재고조정", icon: SlidersHorizontal,
              keywords: "adjust 조정 폐기 스크랩 불량 반품 견본 처분 증감 scrap" },
        ],
    },
    {
        title: "출고",
        roles: ["ADMR", "CENT_ADMR", "OUTB_PIC", "INQ"],
        items: [
            { to: "/outbound/order", label: "출고예정 관리", icon: PackageCheck, keywords: "출고예정 출고주문 obs outbound order 예정 창고 문서 조회" },
            { to: "/outbound/wave", label: "웨이브 편성", icon: Layers, keywords: "wave 묶음 출고주문 담기 전략 실행 피킹지시 발행단위" },
            { to: "/outbound/allocation", label: "할당", icon: Shuffle, keywords: "allocation 재고 배정 fefo" },
            { to: "/outbound/pick-order", label: "피킹지시", icon: ScrollText, keywords: "picking 지시" },
            { to: "/outbound/replenishment", label: "수시보충", icon: PackagePlus, keywords: "replenishment 보충 피킹존 보관존 이동" },
            { to: "/outbound/picking", label: "피킹", icon: PackageOpen, keywords: "picking 집품" },
            { to: "/outbound/shipping", label: "출고확정", icon: Send, keywords: "shipping 상차 출하" },
        ],
    },
    {
        title: "마스터",
        roles: ["ADMR", "INQ"],
        items: [
            { to: "/master/prod", label: "상품 관리", icon: Barcode, keywords: "product 상품 기준정보 온도대" },
            { to: "/master/uom", label: "단위 관리", icon: Ruler, keywords: "uom 포장 낱개수량 중량 박스 파렛트" },
            { to: "/master/zone", label: "존 관리", icon: LayoutGrid, keywords: "zone 존 보관유형" },
            { to: "/master/location", label: "로케이션 관리", icon: MapPin, keywords: "location 로케이션 랙" },
            { to: "/master/fxng-loc", label: "고정 로케이션 관리", icon: Pin, keywords: "fxng fixed 고정 피킹존 보충 재보충점" },
            { to: "/master/prod-vndr", label: "상품 거래처 관리", icon: Handshake, keywords: "prod vendor 공급 발주점 발주상한 자동발주 moq 최소주문 리드타임" },
            { to: "/master/vendor", label: "벤더 관리", icon: Truck, keywords: "vendor 거래처 납품처" },
            { to: "/master/store", label: "점포 관리", icon: Store, keywords: "store 점포 매장" },
            { to: "/master/nbr-rules", label: "채번규칙 관리", icon: Hash, keywords: "nbr 채번 번호 규칙 패턴 시퀀스" },
            { to: "/master/codes", label: "공통코드 관리", icon: ListTree, keywords: "code 공통코드 그룹 코드값 온도대 보관유형 업무구분 발주구분 계량단위" },
            { to: "/master/labels", label: "라벨 인쇄", icon: Printer, keywords: "label 라벨 barcode 바코드 code128 인쇄 print 출력 로케이션 상품 lot pda 스캔" },
            // 조회까지 시스템관리자만이라 그룹(ADMR·INQ)보다 좁다 — INQ에게도 보이면 403만 만난다
            { to: "/master/usr", label: "사용자 관리", icon: Users, roles: ["ADMR"], keywords: "user 사용자 계정 로그인 역할 role 권한 비밀번호" },
        ],
    },
    {
        // 마스터(무엇이 있는가)와 성격이 다르다 — 여기 있는 건 "어떻게 판단할지"의 정의다.
        // 저장하면 곧 운영에 반영되므로 각 화면이 미리보기를 끼고 있다.
        title: "전략",
        roles: ["ADMR", "CENT_ADMR", "INQ"],
        items: [
            { to: "/strategy/inspection", label: "검수 정책관리", icon: ShieldCheck, keywords: "inspection 검수 제약 정책 역순제한 유통기한 잔여비율 전략 입고" },
            { to: "/strategy/putaway", label: "적치 전략관리", icon: Settings2, keywords: "putaway strategy 전략 추천 단계 로케이션 입고" },
            { to: "/strategy/wave", label: "웨이브 전략관리", icon: Waves, keywords: "wave strategy 웨이브 편성 출고 조건그룹 출고유형 차량편수 전략" },
            { to: "/strategy/allocation", label: "할당 전략관리", icon: Shuffle, keywords: "allocation strategy 할당 분배 재고 배정 fefo 전략 출고" },
        ],
    },
    {
        // 현장 단말(PDA) 실행 화면 진입점 — 별도 레이아웃(/m)이라 여기로 나가면 사이드바가 없다
        title: "PDA",
        items: [
            { to: "/m", label: "현장 작업", icon: Smartphone, keywords: "pda 모바일 mobile 스캐너 barcode rf 현장 실행 피킹 적치 재고이동 재고조사" },
        ],
    },
];

/** 경로가 이 메뉴에 속하나 — 그룹 펼침 기본값을 정한다. NavLink의 활성 판정과 같은 규칙(대시보드만 완전일치) */
const isActivePath = (to, pathname) =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

/**
 * 그룹 = 접히는 단위. 메뉴가 33개라 전부 펼치면 스크롤이 길어져, 지금 있는 그룹만 펼친 채로 연다.
 * 제목은 sticky — 긴 그룹을 스크롤해도 「어디를 보고 있나」가 위에 남는다.
 * 아이콘 모드에는 제목 자리가 없어 구분선만 두고 접지 않는다(접으면 아무것도 안 보인다).
 */
const MenuGroup = ({ title, count, compact, open, onToggle, children }) => {
    if (compact) {
        return (
            <div className="mb-2">
                <div className="mx-3 mb-2 border-t border-slate-100" aria-hidden="true" />
                <div className="space-y-0.5">{children}</div>
            </div>
        );
    }
    const label = (
        <>
            <span className={open ? "text-indigo-700" : ""}>{title}</span>
            <span className="text-xs font-medium text-slate-300 tabular-nums">{count}</span>
        </>
    );
    return (
        <div className="mb-1">
            {onToggle ? (
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={open}
                    className="sticky top-0 z-10 w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white
                               text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                    {label}
                    <ChevronRight
                        size={14}
                        className={`ml-auto text-slate-300 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
                    />
                </button>
            ) : (
                // 검색 중에는 모두 펼친 채로 둔다 — 눌러도 접히지 않으니 버튼으로 보이지 않게 한다
                <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2.5 bg-white text-sm font-bold text-slate-600">
                    {label}
                </div>
            )}
            {open && (
                <div className="ml-3 border-l border-slate-100 py-1 space-y-0.5">{children}</div>
            )}
        </div>
    );
};

const MenuItem = ({ to, label, icon: Icon, badge, compact }) => (
    <NavLink
        to={to}
        end={to === "/"}
        title={compact ? label : undefined}
        aria-label={compact ? label : undefined}
        className={({ isActive }) =>
            `flex items-center text-sm transition-colors
            ${compact
                ? `justify-center w-11 h-11 mx-auto rounded-lg
                   ${isActive ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"}`
                // 활성 표시는 왼쪽 세로 막대 — 그룹 안내선 위에 겹쳐 그린다(-ml-px).
                // 비활성도 같은 두께의 투명 테두리를 둬야 선택이 오갈 때 글자가 흔들리지 않는다
                : `justify-between gap-2 -ml-px px-3 py-2 rounded-r-lg border-l-2
                   ${isActive
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold"
                        : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}`
        }
    >
        {/* break-keep: 괄호 딸린 긴 라벨이 단어 중간(「지·정」)에서 꺾이지 않게 어절 단위로만 줄바꿈 */}
        <div className="flex items-center gap-3 break-keep">
            {Icon && <Icon size={compact ? 20 : 18} />}
            {!compact && label}
        </div>
        {badge && !compact && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {badge}
            </span>
        )}
    </NavLink>
);

/**
 * mode
 *  - expanded  : 데스크톱 기본. 256px, 라벨·검색·그룹 제목 전부
 *  - collapsed : 데스크톱 아이콘 모드. 72px, 아이콘만 (라벨은 title로). 검색 아이콘을 누르면 펼치면서 검색창에 포커스
 *  - drawer    : lg 미만. expanded와 같은 모양이지만 화면을 덮는 드로어라 닫기 버튼이 있고 접기 버튼은 없다
 */
export default function Sidebar({ mode = "expanded", onToggle, onClose }) {
    const [q, setQ] = useState("");
    const inputRef = useRef(null);
    const navRef = useRef(null);
    const compact = mode === "collapsed";
    const wantFocus = useRef(false);
    const { pathname } = useLocation();
    const { user, logout, hasRole } = useAuth();

    // 지금 있는 화면이 속한 그룹 — 펼침 기본값이자 스크롤을 맞출 기준
    const activeTitle = useMemo(
        () => MENU.find(g => g.items.some(i => isActivePath(i.to, pathname)))?.title ?? null,
        [pathname],
    );

    // 펼침은 여럿 허용한다(하나만 여는 아코디언이 아니다) — 다른 그룹을 열어 둔 채 일하는 흐름을 끊지 않는다.
    // 다만 화면을 옮기면 그 그룹은 항상 펼쳐진다. 안 그러면 지금 보고 있는 메뉴가 접힌 채로 남는다
    const [openTitles, setOpenTitles] = useState(() => new Set(activeTitle ? [activeTitle] : []));
    // 화면이 바뀌면 그 그룹을 펼친다. effect가 아니라 렌더 중에 맞춘다 —
    // 미루면 접힌 목록이 한 번 그려진 뒤 열려서 깜빡인다 (React의 「렌더 중 상태 조정」)
    const [syncedTitle, setSyncedTitle] = useState(activeTitle);
    if (syncedTitle !== activeTitle) {
        setSyncedTitle(activeTitle);
        if (activeTitle && !openTitles.has(activeTitle)) {
            setOpenTitles(prev => new Set(prev).add(activeTitle));
        }
    }
    const toggleGroup = (title) => setOpenTitles(prev => {
        const next = new Set(prev);
        if (next.has(title)) {
            next.delete(title);
        } else {
            next.add(title);
        }
        return next;
    });

    // 아이콘 모드의 검색 버튼 → 펼친 뒤 검색창 포커스. 펼쳐진 다음 렌더에서 input이 생기므로 effect로 잇는다
    useEffect(() => {
        if (!compact && wantFocus.current) {
            wantFocus.current = false;
            inputRef.current?.focus();
        }
    }, [compact]);
    const openSearch = () => { wantFocus.current = true; onToggle?.(); };

    // 선택된 메뉴가 화면 밖에 있으면 보이는 자리로 끌어온다 — 새로고침·주소로 바로 들어온 경우가 이 자리다.
    // 이미 보이면 건드리지 않는다(클릭해서 옮겨 다닐 때 목록이 제멋대로 튀지 않게).
    // NavLink가 활성 항목에 aria-current="page"를 붙여 주므로 그것으로 찾는다.
    //
    // 의존은 「화면이 바뀌었나」뿐이다. 그룹을 펼치거나 검색어를 치는 것은 사용자가 지금 보려는 자리가
    // 따로 있다는 뜻이라, 그때 선택 항목으로 되감으면 방금 편 그룹이 눈앞에서 밀려난다
    useEffect(() => {
        const nav = navRef.current;
        const active = nav?.querySelector('[aria-current="page"]');
        if (!nav || !active) return;
        const top = active.offsetTop;
        const bottom = top + active.offsetHeight;
        if (top < nav.scrollTop || bottom > nav.scrollTop + nav.clientHeight) {
            nav.scrollTop = Math.max(0, top - (nav.clientHeight - active.offsetHeight) / 2);
        }
    }, [pathname, compact]);

    // 검색어는 라벨 · 그룹명 · 보조어 · 경로를 한 문자열로 합쳐 본다.
    // 경로까지 넣은 덕에 'uom', 'master', 'outbound' 같은 영문 URL 조각으로도 찾히고,
    // matchesSearch가 초성('ㄷㅇ' → 단위 관리)까지 처리한다.
    // 역할로 먼저 거른 뒤 검색으로 거른다 — 검색으로도 안 보이는 것이 나오면 안 된다
    const visible = useMemo(() => MENU
        .filter(g => !g.roles || hasRole(g.roles))
        .map(g => ({ ...g, items: g.items.filter(i => !i.roles || hasRole(i.roles)) }))
        .filter(g => g.items.length > 0), [hasRole]);

    const groups = useMemo(() => {
        if (!q.trim()) return visible;
        return visible
            .map(g => ({
                ...g,
                items: g.items.filter(i =>
                    matchesSearch(`${i.label} ${g.title} ${i.keywords ?? ""} ${i.to}`, q)
                ),
            }))
            .filter(g => g.items.length > 0);
    }, [q, visible]);

    const hitCount = groups.reduce((n, g) => n + g.items.length, 0);

    return (
        <aside
            className={`relative z-10 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 shrink-0
                        transition-[width] duration-200 ease-out ${compact ? "w-[72px]" : "w-64"}`}
        >
            {/* 접기/펼치기 — 로고 높이의 오른쪽 경계선 위에 걸친 핸들. 접혀도 같은 자리라 찾기 쉽고,
                하단은 사용자·로그아웃 자리라 거기 두면 섞인다. 드로어는 닫기 버튼이 이 역할이다 */}
            {onToggle && (
                <button
                    type="button"
                    onClick={onToggle}
                    title={compact ? "메뉴 펼치기" : "메뉴 접기"}
                    aria-label={compact ? "메뉴 펼치기" : "메뉴 접기"}
                    className="absolute -right-3 top-5 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm
                               flex items-center justify-center text-slate-400
                               hover:text-indigo-600 hover:border-indigo-300 transition-colors"
                >
                    {compact ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
                </button>
            )}
            {/* 로고 영역 */}
            <div className={`flex items-center h-16 shrink-0 ${compact ? "justify-center" : "gap-1 px-3"}`}>
                {/* 로고 = 대시보드로 가는 길. 드로어는 화면을 덮고 있으니 이동과 함께 닫는다.
                    NavLink가 아니라 Link인 이유는 여기에 활성 표시가 필요 없어서다 */}
                <Link
                    to="/"
                    onClick={mode === "drawer" ? onClose : undefined}
                    title="대시보드로 이동"
                    aria-label="대시보드로 이동"
                    className={`flex items-center rounded-xl hover:bg-slate-50 transition-colors
                                ${compact ? "p-1" : "flex-1 min-w-0 gap-3 px-2 py-2"}`}
                >
                    <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-inner shrink-0">
                        <Warehouse size={21} className="text-white" />
                    </div>
                    {!compact && (
                        <div className="flex-1 min-w-0 whitespace-nowrap">
                            <h3 className="font-bold text-slate-800 leading-none">WareFlow</h3>
                            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                                <span className="w-2 h-2 bg-green-500 rounded-full"></span> 운영 중
                            </p>
                        </div>
                    )}
                </Link>
                {mode === "drawer" && (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="메뉴 닫기"
                        className="p-2 -mr-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                        <X size={18} />
                    </button>
                )}
            </div>

            {/* 화면 검색 */}
            {compact ? (
                <div className="px-4 pb-3">
                    <button
                        type="button"
                        onClick={openSearch}
                        title="화면 검색"
                        aria-label="화면 검색"
                        className="w-10 h-10 mx-auto flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200
                                   text-slate-400 hover:text-indigo-600 hover:border-indigo-300"
                    >
                        <Search size={15} />
                    </button>
                </div>
            ) : (
            <div className="px-4 pb-3">
                <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") { setQ(""); inputRef.current?.blur(); }
                        }}
                        placeholder="화면 검색 (초성 가능)"
                        className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm
                                   placeholder:text-slate-400 focus:outline-none focus:bg-white
                                   focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                    {q && (
                        <button
                            type="button"
                            onClick={() => { setQ(""); inputRef.current?.focus(); }}
                            aria-label="검색어 지우기"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>
            </div>
            )}

            {/* 메뉴 영역 */}
            {/* relative: 아래 스크롤 계산이 항목의 offsetTop을 이 요소 기준으로 읽는다 */}
            <nav
                ref={navRef}
                className={`relative flex-1 overflow-y-auto overflow-x-hidden pb-4 custom-scrollbar ${compact ? "px-2" : "px-3"}`}
            >
                {/* 검색 중에는 일치한 항목만 남기고 그룹은 전부 펼친다 — 걸러 놓고 접어 두면 검색이 헛돈다 */}
                {groups.map(g => (
                    <MenuGroup
                        key={g.title}
                        title={g.title}
                        count={g.items.length}
                        compact={compact}
                        open={compact || Boolean(q.trim()) || openTitles.has(g.title)}
                        onToggle={q.trim() ? undefined : () => toggleGroup(g.title)}
                    >
                        {g.items.map(i => (
                            <MenuItem key={i.to} to={i.to} label={i.label} icon={i.icon} badge={i.badge} compact={compact} />
                        ))}
                    </MenuGroup>
                ))}

                {!compact && q && hitCount === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-slate-400">
                        <p>‘{q}’에 맞는 화면이 없습니다.</p>
                        <p className="text-[11px] mt-1">Esc를 누르면 전체 메뉴로 돌아갑니다.</p>
                    </div>
                )}
            </nav>

            {/* 하단 사용자 정보 + 로그아웃 (상단바를 없애면서 여기로 옮겼다) */}
            <div className={`bg-slate-50 border-t border-slate-200 shrink-0 ${compact ? "p-3" : "p-3"}`}>
                {/* 사용자설명서 — 라우터 밖 정적 문서라 NavLink가 아니라 새 탭으로 연다.
                    메뉴 33개 사이에 끼우면 안 눌린다(찾는 사람은 화면이 아니라 도움말을 찾는다).
                    경로에 index.html까지 적는다 — 「/manual/」로 두면 개발 서버가 SPA로 받아 빈 화면이 뜬다 */}
                <a
                    href="/manual/index.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="사용자설명서 (새 탭)"
                    aria-label="사용자설명서"
                    className={`flex items-center text-sm text-slate-500 hover:text-indigo-600 hover:bg-indigo-50
                                rounded-lg transition-colors ${compact
                        ? "justify-center w-11 h-11 mx-auto mb-1"
                        : "gap-3 px-2 py-2 mb-1"}`}
                >
                    <BookOpen size={compact ? 20 : 18} />
                    {!compact && <span className="flex-1">사용자설명서</span>}
                </a>
                <div className={`flex items-center ${compact ? "flex-col gap-1" : "gap-3 px-2 py-2"}`}>
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0"
                         title={compact ? user?.usrNm : undefined}>
                        {user?.usrNm?.[0] ?? "?"}
                    </div>
                    {!compact && (
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-700 truncate">{user?.usrNm}</div>
                            <div className="text-[11px] text-slate-400 truncate" title={roleLabels(user?.roles)}>
                                {roleLabels(user?.roles)}
                            </div>
                        </div>
                    )}
                    <button
                        onClick={async () => {
                            await logout();
                            window.location.href = "/login";
                        }}
                        title="로그아웃"
                        aria-label="로그아웃"
                        className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </div>
        </aside>
    );
}
