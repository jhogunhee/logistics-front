import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';

/**
 * 로그인하지 않았으면 /login으로 보낸다. 데스크톱(Layout)과 PDA(/m) 두 라우트 트리를 각각 감싼다 —
 * 하나만 감싸면 나머지가 무인증으로 남는다.
 *
 * 화면 숨김은 편의일 뿐이고 실제로 막는 것은 백엔드다(URL로 들어가도 401/403).
 */
export default function RequireAuth({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }}/>;
    return children;
}
