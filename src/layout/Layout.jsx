import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import { LogOut } from "lucide-react";

export default function Layout() {
    return (
        <div className="flex min-h-screen w-full bg-slate-50">
            <Sidebar />
            <main className="flex-1 min-w-0 flex flex-col">
                {/* 상단바 (Breadcrumbs나 검색창을 넣기 좋음) */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-end px-8">
                    <div className="flex items-center gap-4">
                        <div className="text-right mr-2">
                            <p className="text-xs font-bold text-slate-700">관리자</p>
                        </div>

                        {/* 로그아웃 버튼 (인증 붙이기 전까지는 로그인 화면 이동만) */}
                        <button
                            onClick={() => {
                                sessionStorage.removeItem("loginUser");
                                window.location.href = "/login";
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                        >
                            <LogOut size={14} />
                            <span>로그아웃</span>
                        </button>
                    </div>
                </header>

                {/* 실제 콘텐츠 영역 */}
                <div className="p-8">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[calc(100vh-8rem)] p-6">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
}
