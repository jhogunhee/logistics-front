import axios from 'axios';
import toast from 'react-hot-toast';

const instance = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080', // wms-backend 주소
    // DB가 원격(Supabase)이라 검수 저장·지시 발행처럼 쿼리가 많은 트랜잭션은 5초를 넘긴다 —
    // 5000으로 두면 서버는 성공했는데 화면만 실패 토스트를 띄우는 어긋남이 실제로 났다
    timeout: 30000,
    // 배열 조건(상태 다중선택)을 status=A&status=B로 보낸다. axios 기본은 status[]=A라
    // Spring이 List<Enum> 파라미터로 바인딩하지 못한다
    paramsSerializer: { indexes: null },
    // 인증이 세션 쿠키라 크로스 도메인에서도 쿠키를 실어 보내야 한다
    withCredentials: true,
});

// CSRF 토큰. 쿠키가 아니라 메모리에 둔다 — 백엔드가 다른 도메인이라 그쪽이 심은 쿠키를
// 이 스크립트가 읽을 수 없어서, 로그인/내정보 응답 본문으로 받아 여기에 보관한다.
let csrfToken = null;
export const setCsrfToken = (token) => { csrfToken = token; };

const SAFE_METHODS = ['get', 'head', 'options'];

// [요청 인터셉터] 서버로 보내기 전 공통 작업
instance.interceptors.request.use(
    (config) => {
        const method = (config.method || 'get').toLowerCase();
        // 헤더 이름은 백엔드가 쓰는 저장소가 정한다 — 세션 저장(HttpSessionCsrfTokenRepository)의
        // 기본 이름이 X-CSRF-TOKEN이다. X-XSRF-TOKEN은 쿠키 저장 방식의 이름이라 여기선 403이 된다
        if (csrfToken && !SAFE_METHODS.includes(method)) {
            config.headers['X-CSRF-TOKEN'] = csrfToken;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// [응답 인터셉터] 서버 데이터를 받기 전 공통 작업 (에러 처리 등)
instance.interceptors.response.use(
    (response) => response.data, // .data를 미리 꺼내서 전달
    (error) => {
        // 세션이 끊겼다(만료·서버 재시작·관리자가 역할을 바꿔 세션을 끊음). 남은 흔적을 지우고
        // 로그인으로 보낸다 — 이미 로그인 화면이면 옮기지 않는다(새로고침이 반복된다)
        // 현장 단말(/m)은 PDA 로그인으로 되돌린다 — 데스크톱 /login으로 보내면 작업자가
        // 아이디·비밀번호 화면을 만나 스캔으로는 돌아올 길이 없다
        if (error.response?.status === 401) {
            csrfToken = null;
            localStorage.removeItem('authUser');
            const path = window.location.pathname;
            // 접두 비교가 아니라 경로 경계로 본다 — startsWith('/m')은 /master·/monitoring까지 삼켜
            // 데스크톱 세션이 끊겼을 때 관리자를 PDA 스캔 화면에 떨어뜨린다(그 계정은 스캔으로 못 들어온다)
            const loginPath = (path === '/m' || path.startsWith('/m/')) ? '/m/login' : '/login';
            if (path !== loginPath) {
                window.location.href = loginPath;
            }
        }
        // 서버 에러 응답({ message })을 e.message로 노출 → 화면에서 토스트에 그대로 사용
        if (error.response?.data?.message) {
            error.message = error.response.data.message;
        }

        // 조회(GET) 실패는 여기서 토스트를 띄운다.
        // 저장·삭제(POST/PUT/DELETE)는 화면마다 자기 문구로 이미 처리하고 있어 제외한다 —
        // 여기서 함께 띄우면 토스트가 두 번 뜬다.
        //
        // 화면에 두지 않은 이유: 목록 조회 호출이 25개 화면에 75곳 흩어져 있어서 각자 catch를
        // 붙이면 하나만 빠뜨려도 그 화면은 조회 실패 시 빈 그리드만 남고 아무 말이 없다.
        // 조회 실패의 처리는 어느 화면이든 「무슨 일이 났는지 알린다」로 같으므로 한 곳에 둔다.
        // 실패를 알리는 것 외에 화면이 더 할 일이 있으면(예: 이전 결과 비우기) 각자 catch를
        // 덧붙이면 된다 — reject는 그대로 흘려보내므로 막히지 않는다.
        if (error.config?.method === 'get' && error.response?.status !== 401) {
            toast.error(error.message || '조회에 실패했습니다.');
        }

        return Promise.reject(error);
    }
);

export default instance;
