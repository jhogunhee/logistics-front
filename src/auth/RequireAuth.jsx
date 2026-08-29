import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';

/**
 * 로그인하지 않았으면 로그인 화면으로 보낸다. 데스크톱(Layout)과 PDA(/m) 두 라우트 트리를
 * 각각 감싼다 — 하나만 감싸면 나머지가 무인증으로 남는다.
 *
 * 보내는 곳은 트리마다 다르다 — PDA는 작업자 코드 스캔 화면(/m/login)이고 데스크톱은
 * 아이디·비밀번호 화면(/login)이다. 두 입구는 서로를 대체하지 않는다: 관리·조회 계정은
 * 스캔으로 들어올 수 없고(서버가 현장 역할만 연다), 작업자는 비밀번호를 치지 않는다.
 *
 * 화면 숨김은 편의일 뿐이고 실제로 막는 것은 백엔드다(URL로 들어가도 401/403).
 */
export default function RequireAuth({ children, loginPath = '/login' }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) return null;
    if (!user) return <Navigate to={loginPath} replace state={{ from: location.pathname }}/>;
    return children;
}
