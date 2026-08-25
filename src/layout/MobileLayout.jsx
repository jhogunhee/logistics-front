import { Link, Outlet } from "react-router-dom";
import { Monitor, Warehouse } from "lucide-react";
import ServerWakeGate from "@/components/common/ServerWakeGate.jsx";

/**
 * PDA(모바일) 전용 레이아웃 — 사이드바 없이 상단바 + 콘텐츠 한 장이다.
 * 현장 단말은 화면이 좁고 한 번에 한 작업만 하므로 데스크톱 Layout을 쓰지 않는다.
 */
export default function MobileLayout() {
    return (
        <div className="flex flex-col h-screen bg-slate-100">
            <header className="flex items-center gap-2 h-12 px-3 bg-white border-b border-slate-200 shrink-0">
                {/* 로고 = 작업 선택(홈)으로 — 어느 화면에서든 한 번에 돌아온다 */}
                <Link to="/m" className="flex items-center gap-2">
                    <span className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                        <Warehouse size={16} className="text-white" />
                    </span>
                    <span className="font-bold text-slate-800 text-sm">WMS PDA</span>
                </Link>
                <Link to="/" title="데스크톱 화면으로"
                      className="ml-auto p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-indigo-600">
                    <Monitor size={18} />
                </Link>
            </header>
            {/* overflow-y-auto — 화면이 낮은 단말에서 내용이 상하로 넘치면 잘리는 대신 스크롤이 생긴다 */}
            <main className="flex-1 min-h-0 p-3 overflow-y-auto">
                <ServerWakeGate>
                    <Outlet />
                </ServerWakeGate>
            </main>
        </div>
    );
}
