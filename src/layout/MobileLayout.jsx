import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { BookOpen, LogOut, Monitor, Warehouse, X } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import ServerWakeGate from "@/components/common/ServerWakeGate.jsx";

const MANUAL_INDEX = { href: '/manual/index.html', label: '사용자설명서' };

const MANUAL_BY_PATH = {
    '/m/receiving':     { href: '/manual/03-입고.html#s36', label: '3.6 PDA — 입고검수' },
    '/m/putaway':       { href: '/manual/03-입고.html#s37', label: '3.7 PDA — 적치' },
    '/m/stock-inquiry': { href: '/manual/04-재고.html#s49', label: '4.9 PDA — 재고' },
    '/m/stock-move':    { href: '/manual/04-재고.html#s49', label: '4.9 PDA — 재고' },
    '/m/stock-count':   { href: '/manual/04-재고.html#s49', label: '4.9 PDA — 재고' },
    '/m/replenishment': { href: '/manual/05-출고.html#s59', label: '5.9 PDA — 보충 · 출고확정' },
    '/m/picking':       { href: '/manual/05-출고.html#s58', label: '5.8 PDA — 피킹' },
    '/m/shipping':      { href: '/manual/05-출고.html#s59', label: '5.9 PDA — 보충 · 출고확정' },
};

/**
 * PDA(모바일) 전용 레이아웃 — 사이드바 없이 상단바 + 콘텐츠 한 장이다.
 * 현장 단말은 화면이 좁고 한 번에 한 작업만 하므로 데스크톱 Layout을 쓰지 않는다.
 */
export default function MobileLayout() {
    const { pathname } = useLocation();
    const { user, logout } = useAuth();
    const [manualOpen, setManualOpen] = useState(false);
    const manual = MANUAL_BY_PATH[pathname] ?? MANUAL_INDEX;

    // 덮개를 닫으면 스캔 입력으로 포커스를 되돌린다 — 안 그러면 다음 스캔이 어디에도 들어가지 않는다
    const lastFocusedRef = useRef(null);
    useEffect(() => {
        if (manualOpen) return;
        const el = lastFocusedRef.current;
        lastFocusedRef.current = null;
        if (el && document.contains(el)) el.focus();
    }, [manualOpen]);

    // h-dvh — 100vh는 주소창이 숨겨진 최대 높이라, 주소창이 보이면 하단 실행 버튼이 그만큼 화면 밖으로 밀린다
    return (
        <div className="flex flex-col h-dvh bg-slate-100">
            <header className="flex items-center gap-2 h-12 px-3 bg-white border-b border-slate-200 shrink-0">
                {/* 로고 = 작업 선택(홈)으로 — 어느 화면에서든 한 번에 돌아온다 */}
                <Link to="/m" className="flex items-center gap-2">
                    <span className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                        <Warehouse size={16} className="text-white" />
                    </span>
                    <span className="font-bold text-slate-800 text-sm">WareFlow PDA</span>
                </Link>
                {/* 지금 누구로 실적이 쌓이는지를 늘 띄워 둔다 — 앞사람 세션에 그대로 작업하는 것을 막는 표시다 */}
                <span className="ml-auto text-xs font-bold text-slate-600 truncate max-w-[6.5rem]">
                    {user?.usrNm ?? user?.loginId}
                </span>
                {/* 새 탭이 아니라 덮개로 연다 — 작업 화면이 마운트된 채로 남아 스캔 진행이 유지된다 */}
                <button type="button" title="사용자설명서"
                        onMouseDown={() => { lastFocusedRef.current = document.activeElement; }}
                        onClick={() => setManualOpen(true)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-indigo-600">
                    <BookOpen size={18} />
                </button>
                <Link to="/" title="데스크톱 화면으로"
                      className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-indigo-600">
                    <Monitor size={18} />
                </Link>
                {/* 교대 종료 — 다음 작업자가 자기 코드를 찍게 하려면 여기서 끊어야 한다 */}
                <button type="button" title="로그아웃" onClick={logout}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                    <LogOut size={18} />
                </button>
            </header>
            {/* overflow-y-auto — 화면이 낮은 단말에서 내용이 상하로 넘치면 잘리는 대신 스크롤이 생긴다 */}
            <main className="flex-1 min-h-0 p-3 overflow-y-auto">
                <ServerWakeGate>
                    <Outlet />
                </ServerWakeGate>
            </main>

            {manualOpen && (
                <div className="fixed inset-0 z-50 flex flex-col bg-white">
                    <div className="flex items-center gap-2 h-12 px-3 border-b border-slate-200 shrink-0">
                        <BookOpen size={16} className="text-indigo-600 shrink-0" />
                        <span className="font-bold text-slate-800 text-sm truncate">{manual.label}</span>
                        <button type="button" onClick={() => setManualOpen(false)} title="닫기"
                                className="ml-auto p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-indigo-600">
                            <X size={18} />
                        </button>
                    </div>
                    <iframe src={manual.href} title={manual.label} className="flex-1 min-h-0 w-full border-0" />
                </div>
            )}
        </div>
    );
}
