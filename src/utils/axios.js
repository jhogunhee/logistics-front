import axios from 'axios';

const instance = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080', // wms-backend 주소
    timeout: 5000,
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
        return Promise.reject(error);
    }
);

export default instance;
