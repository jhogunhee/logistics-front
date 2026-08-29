import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '@/api/authApi';
import { setCsrfToken } from '@/utils/axios';

const AuthContext = createContext(null);

// 로그인 자체는 세션 쿠키가 나른다. 여기 두는 건 화면이 첫 페인트에 쓸 표시용 정보뿐이고,
// 진짜 판정은 언제나 서버(/auth/me)가 한다 — 이 값을 지워도 로그인이 풀리지 않고,
// 남아 있어도 세션이 끊겼으면 첫 조회에서 401이 난다.
const USER_KEY = 'authUser';

function readCachedUser() {
    try {
        return JSON.parse(localStorage.getItem(USER_KEY)) || null;
    } catch {
        return null;
    }
}

// 로그인 화면에서는 세션을 묻지 않는다 — 아직 없는 게 정상이라 401만 받는다
const onLoginPage = () => window.location.pathname.startsWith('/login');

export function AuthProvider({ children }) {
    const [user, setUser] = useState(readCachedUser);
    // 물어볼 일이 없으면 처음부터 대기 상태가 아니다 (effect 안에서 상태를 되돌리지 않으려고 초기값으로 판정)
    const [loading, setLoading] = useState(() => !onLoginPage());

    const apply = useCallback((me) => {
        setCsrfToken(me.csrfToken);
        const shown = { loginId: me.loginId, usrNm: me.usrNm, roles: me.roles, menus: me.menus ?? [] };
        localStorage.setItem(USER_KEY, JSON.stringify(shown));
        setUser(shown);
        return shown;
    }, []);

    const forget = useCallback(() => {
        setCsrfToken(null);
        localStorage.removeItem(USER_KEY);
        setUser(null);
    }, []);

    // 쿠키는 스크립트가 못 읽으므로(HttpOnly) 로그인 여부는 서버에 물어야만 알 수 있다
    useEffect(() => {
        if (onLoginPage()) return;
        authApi.me()
            .then(apply)
            .catch(forget)          // 401이면 인터셉터가 이미 /login으로 보낸다
            .finally(() => setLoading(false));
    }, [apply, forget]);

    const login = useCallback(async (loginId, pwd) => {
        return apply(await authApi.login({ loginId, pwd }));
    }, [apply]);

    const logout = useCallback(async () => {
        try {
            await authApi.logout();   // 서버 세션을 실제로 없앤다
        } finally {
            forget();
        }
    }, [forget]);

    /** 인자가 없으면 로그인 여부만 본다. 여럿을 주면 하나라도 가지고 있으면 참 */
    const hasRole = useCallback((...codes) => {
        if (!user) return false;
        if (codes.length === 0) return true;
        return codes.flat().some((code) => user.roles.includes(code));
    }, [user]);

    // menus는 서버가 역할로 걸러 준 목록이다 — 사이드바·PDA 홈이 이것만 보고 그린다.
    // 캐시된 값이 있으면 첫 페인트부터 그려져 빈 사이드바가 보이지 않는다
    const value = useMemo(() => ({ user, loading, login, logout, hasRole, menus: user?.menus ?? [] }),
        [user, loading, login, logout, hasRole]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있습니다.');
    return ctx;
}
