import { useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
    ArrowLeftRight,
    Barcode,
    Box,
    Calculator,
    CheckCircle2,
    ClipboardCheck,
    ClipboardList,
    FileInput,
    FileOutput,
    FilePlus,
    Hash,
    History,
    Layers,
    LayoutDashboard,
    LayoutGrid,
    ListChecks,
    ListTree,
    MapPin,
    PackageOpen,
    PauseCircle,
    Ruler,
    ScrollText,
    Search,
    Send,
    Settings2,
    ShieldCheck,
    Shuffle,
    Store,
    Tags,
    Truck,
    Warehouse,
    X,
} from "lucide-react";

import { matchesSearch } from "@/utils/hangul";

// 메뉴를 JSX가 아니라 데이터로 둔다 — 검색이 이 배열을 걸러 렌더하기 때문이다.
// keywords는 라벨에 없는 검색어를 잡아주는 보조어다 (약어 · 영문 · 업무에서 부르는 다른 이름).
const MENU = [
    {
        title: "모니터링",
        items: [
            { to: "/", label: "대시보드", icon: LayoutDashboard, keywords: "dashboard 홈 메인" },
        ],
    },
    {
        title: "OMS",
        items: [
            { to: "/oms/inbound-order", label: "입고주문", icon: FileInput, keywords: "발주 po purchase order 등록" },
            { to: "/oms/inbound-orders", label: "입고주문 관리", icon: ClipboardList, keywords: "발주 목록 확정 취소 삭제" },
            { to: "/oms/outbound-order", label: "출고주문", icon: FileOutput, keywords: "수주 so 점포 등록" },
            { to: "/oms/outbound-orders", label: "출고주문 관리", icon: FilePlus, keywords: "수주 목록 취소" },
        ],
    },
    {
        title: "입고",
        items: [
            { to: "/inbound/asn", label: "입고예정(ASN) 관리", icon: Truck, keywords: "asn 예정 inbound" },
            { to: "/inbound/receiving", label: "입고검수", icon: ClipboardCheck, keywords: "검수 수령 receiving lot 제조일자" },
            { to: "/inbound/putaway-order", label: "적치지시", icon: ListChecks, keywords: "putaway 지시 로케이션 배정" },
            { to: "/inbound/putaway", label: "적치", icon: PackageOpen, keywords: "putaway 이동 보관" },
            { to: "/inbound/close", label: "입고확정", icon: CheckCircle2, keywords: "마감 close 결품" },
        ],
    },
    {
        title: "재고",
        items: [
            { to: "/stock/status", label: "현재고 조회", icon: Box, keywords: "inventory 재고 현황 수량" },
            { to: "/stock/history", label: "재고 이력 조회", icon: History, keywords: "inventory history 원장 입출고" },
            { to: "/stock/attribute", label: "재고 속성변경", icon: Tags, keywords: "lot 유통기한 제조일자 정정 변경" },
            { to: "/stock/hold", label: "재고 보류", icon: PauseCircle, keywords: "hold 출고 금지" },
            { to: "/stock/move", label: "재고 이동", icon: ArrowLeftRight, keywords: "move 로케이션 이동 지시 예약 등록 확정 취소" },
            { to: "/stock/count", label: "재고조사", icon: Calculator, keywords: "실사 count 조정 adjust" },
        ],
    },
    {
        title: "출고",
        items: [
            { to: "/outbound/wave", label: "웨이브 편성", icon: Layers, keywords: "wave 묶음" },
            { to: "/outbound/allocation", label: "할당", icon: Shuffle, keywords: "allocation 재고 배정 fefo" },
            { to: "/outbound/pick-order", label: "피킹지시", icon: ScrollText, keywords: "picking 지시" },
            { to: "/outbound/picking", label: "피킹", icon: PackageOpen, keywords: "picking 집품" },
            { to: "/outbound/shipping", label: "출고확정", icon: Send, keywords: "shipping 상차 출하" },
        ],
    },
    {
        title: "마스터",
        items: [
            { to: "/master/prod", label: "상품 관리", icon: Barcode, keywords: "product 상품 기준정보 온도대" },
            { to: "/master/uom", label: "단위 관리", icon: Ruler, keywords: "uom 포장 낱개수량 중량 박스 파렛트" },
            { to: "/master/zone", label: "존 관리", icon: LayoutGrid, keywords: "zone 존 보관유형" },
            { to: "/master/location", label: "로케이션 관리", icon: MapPin, keywords: "location 로케이션 랙" },
            { to: "/master/vendor", label: "벤더 관리", icon: Truck, keywords: "vendor 거래처 납품처" },
            { to: "/master/store", label: "점포 관리", icon: Store, keywords: "store 점포 매장" },
            { to: "/master/inspection-policy", label: "검수 정책관리", icon: ShieldCheck, keywords: "inspection 검수 제약 정책 역순제한 유통기한 잔여비율 전략" },
            { to: "/master/putaway-strategy", label: "적치 전략관리", icon: Settings2, keywords: "putaway strategy 전략 추천 단계" },
            { to: "/master/nbr-rules", label: "채번규칙 관리", icon: Hash, keywords: "nbr 채번 번호 규칙 패턴 시퀀스 採番" },
            { to: "/master/codes", label: "공통코드 관리", icon: ListTree, keywords: "code 공통코드 그룹 코드값 온도대 보관유형 업무구분 발주구분 계량단위" },
        ],
    },
];

const MenuGroup = ({ title, children }) => (
    <div className="mb-5">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-2 px-4">
            {title}
        </div>
        <div className="space-y-0.5">{children}</div>
    </div>
);

const MenuItem = ({ to, label, icon: Icon, badge }) => (
    <NavLink
        to={to}
        end={to === "/"}
        className={({ isActive }) =>
            `flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
            ${
                isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                    : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
            }`
        }
    >
        <div className="flex items-center gap-3">
            {Icon && <Icon size={20} />}
            {label}
        </div>
        {badge && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {badge}
            </span>
        )}
    </NavLink>
);

export default function Sidebar() {
    const [q, setQ] = useState("");
    const inputRef = useRef(null);

    // 검색어는 라벨 · 그룹명 · 보조어 · 경로를 한 문자열로 합쳐 본다.
    // 경로까지 넣은 덕에 'uom', 'master', 'outbound' 같은 영문 URL 조각으로도 찾히고,
    // matchesSearch가 초성('ㄷㅇ' → 단위 관리)까지 처리한다.
    const groups = useMemo(() => {
        if (!q.trim()) return MENU;
        return MENU
            .map(g => ({
                ...g,
                items: g.items.filter(i =>
                    matchesSearch(`${i.label} ${g.title} ${i.keywords ?? ""} ${i.to}`, q)
                ),
            }))
            .filter(g => g.items.length > 0);
    }, [q]);

    const hitCount = groups.reduce((n, g) => n + g.items.length, 0);

    return (
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
            {/* 로고 영역 */}
            <div className="flex items-center gap-3 px-6 h-20">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
                    <Warehouse size={24} className="text-white" />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800 leading-none">WMS</h3>
                    <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span> 운영 중
                    </p>
                </div>
            </div>

            {/* 화면 검색 */}
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

            {/* 메뉴 영역 */}
            <nav className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
                {/* 검색 중에는 그룹이 일치한 항목만 남기고 접힌다 */}
                {groups.map(g => (
                    <MenuGroup key={g.title} title={g.title}>
                        {g.items.map(i => (
                            <MenuItem key={i.to} to={i.to} label={i.label} icon={i.icon} badge={i.badge} />
                        ))}
                    </MenuGroup>
                ))}

                {q && hitCount === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-slate-400">
                        <p>‘{q}’에 맞는 화면이 없습니다.</p>
                        <p className="text-[11px] mt-1">Esc를 누르면 전체 메뉴로 돌아갑니다.</p>
                    </div>
                )}
            </nav>

            {/* 하단 사용자 정보 */}
            <div className="p-4 bg-slate-50 border-t border-slate-200">
                <div className="flex items-center gap-3 px-2 py-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                        A
                    </div>
                    <span className="text-sm font-semibold text-slate-700">관리자</span>
                </div>
            </div>
        </aside>
    );
}
