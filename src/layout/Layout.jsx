import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Menu, Smartphone, Warehouse, X } from "lucide-react";
import Sidebar from "./Sidebar.jsx";
import ServerWakeGate from "@/components/common/ServerWakeGate.jsx";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const COLLAPSE_KEY = "sidebar.collapsed";

export default function Layout() {
    // lg(1024px) 미만에서는 사이드바가 화면을 덮는 드로어가 된다 — 그 폭에선 고정 사이드바가 콘텐츠를 다 먹는다
    const isDesktop = useMediaQuery("(min-width: 1024px)");
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
    const { pathname } = useLocation();
    // 드로어는 「연 시점의 경로」를 기억한다 — 메뉴를 골라 경로가 바뀌면 저절로 닫힌 셈이 되고,
    // 데스크톱 폭으로 넓히면 드로어 자체가 없다. 따로 닫는 effect가 필요 없다
    const [openedAt, setOpenedAt] = useState(null);
    const drawerOpen = !isDesktop && openedAt === pathname;
    const openDrawer = () => setOpenedAt(pathname);
    const closeDrawer = () => setOpenedAt(null);

    // 모바일 폭 접속 안내 — 관리 화면은 데스크톱용이라, 좁은 화면으로 들어온 사용자에게 PDA 화면을 알린다
    const [pdaBannerHidden, setPdaBannerHidden] = useState(() => sessionStorage.getItem("pdaBanner.hidden") === "1");
    const hidePdaBanner = () => {
        sessionStorage.setItem("pdaBanner.hidden", "1");
        setPdaBannerHidden(true);
    };

    const toggleCollapsed = useCallback(() => {
        setCollapsed(c => {
            localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
            return !c;
        });
    }, []);

    useEffect(() => {
        if (!drawerOpen) return undefined;
        const onKey = (e) => { if (e.key === "Escape") setOpenedAt(null); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [drawerOpen]);

    return (
        <div className="flex h-screen overflow-hidden w-full bg-slate-50">
            {isDesktop ? (
                <Sidebar mode={collapsed ? "collapsed" : "expanded"} onToggle={toggleCollapsed} />
            ) : (
                <>
                    <div
                        onClick={closeDrawer}
                        className={`fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px] transition-opacity duration-200
                            ${drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                    />
                    <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out shadow-2xl
                        ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
                        <Sidebar mode="drawer" onClose={closeDrawer} />
                    </div>
                </>
            )}

            {/* 상단바 없음 — 사용자 정보·로그아웃은 사이드바 하단에 있다. 그만큼 콘텐츠가 세로를 다 쓴다 */}
            <main className="flex-1 min-w-0 flex flex-col">
                {!isDesktop && (
                    <div className="flex items-center gap-3 h-12 px-3 bg-white border-b border-slate-200 shrink-0">
                        <button
                            type="button"
                            onClick={openDrawer}
                            aria-label="메뉴 열기"
                            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                        >
                            <Menu size={20} />
                        </button>
                        <div className="flex items-center gap-2">
                            <span className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                                <Warehouse size={16} className="text-white" />
                            </span>
                            <span className="font-bold text-slate-800 text-sm">WMS</span>
                        </div>
                    </div>
                )}
                {!isDesktop && !pdaBannerHidden && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-700 shrink-0">
                        <Smartphone size={14} className="shrink-0" />
                        <span className="flex-1 min-w-0">현장작업은 전용 PDA 화면이 편합니다</span>
                        <Link to="/m" className="font-bold underline shrink-0">PDA 화면으로</Link>
                        <button onClick={hidePdaBanner} aria-label="안내 닫기"
                                className="p-1 -mr-1 text-indigo-400 hover:text-indigo-600">
                            <X size={14} />
                        </button>
                    </div>
                )}
                {/* 실제 콘텐츠 영역 — 창 스크롤 대신 카드 내부 스크롤을 쓴다 */}
                <div className="p-3 lg:p-4 flex-1 min-h-0">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full p-4 lg:p-5 overflow-auto">
                        <ServerWakeGate>
                            <Outlet />
                        </ServerWakeGate>
                    </div>
                </div>
            </main>
        </div>
    );
}
