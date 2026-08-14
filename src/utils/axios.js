import axios from 'axios';
import toast from 'react-hot-toast';

const instance = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080', // wms-backend 주소
    // DB가 원격(Supabase)이라 검수 저장·지시 발행처럼 쿼리가 많은 트랜잭션은 5초를 넘긴다 —
    // 5000으로 두면 서버는 성공했는데 화면만 실패 토스트를 띄우는 어긋남이 실제로 났다
    timeout: 30000,
});

// [요청 인터셉터] 서버로 보내기 전 공통 작업
instance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// [응답 인터셉터] 서버 데이터를 받기 전 공통 작업 (에러 처리 등)
instance.interceptors.response.use(
    (response) => response.data, // .data를 미리 꺼내서 전달
    (error) => {
        if (error.response?.status === 401) {
            window.location.href = '/login';
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
