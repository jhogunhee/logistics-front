import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import ServerWakeGate from "@/components/common/ServerWakeGate.jsx";

export default function Layout() {
    return (
        <div className="flex h-screen overflow-hidden w-full bg-slate-50">
            <Sidebar />
            {/* 상단바 없음 — 사용자 정보·로그아웃은 사이드바 하단에 있다. 그만큼 콘텐츠가 세로를 다 쓴다 */}
            <main className="flex-1 min-w-0 flex flex-col">
                {/* 실제 콘텐츠 영역 — 창 스크롤 대신 카드 내부 스크롤을 쓴다 */}
                <div className="p-4 flex-1 min-h-0">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full p-5 overflow-auto">
                        <ServerWakeGate>
                            <Outlet />
                        </ServerWakeGate>
                    </div>
                </div>
            </main>
        </div>
    );
}
