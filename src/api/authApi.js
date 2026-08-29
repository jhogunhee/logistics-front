// 인증 API — wms-backend의 com.project.mdm.usr.controller.AuthController 연동.
// 인증 수단은 세션 쿠키다(axios의 withCredentials). 응답 본문의 csrfToken은 이후 저장 요청에
// 헤더로 붙일 값 — 백엔드가 다른 도메인이라 쿠키로는 전달되지 않는다.
import api from '@/utils/axios';

export const authApi = {
    /** 로그인. 성공하면 { loginId, usrNm, roles, csrfToken } */
    login(body) {
        return api.post('/auth/login', body);
    },

    /**
     * PDA 간편 로그인 — 작업자 코드(= 로그인 아이디) 바코드만 보낸다. 응답은 login과 같다.
     * 현장 역할만으로 이루어진 계정에만 열려 있고, 그 판정은 서버가 한다.
     */
    scanLogin(body) {
        return api.post('/auth/scan-login', body);
    },

    /** 내 정보. 세션이 살아 있는지 확인하는 용도를 겸한다 */
    me() {
        return api.get('/auth/me');
    },

    /** 로그아웃. 서버 세션을 없앤다 (SecurityConfig의 logout이 처리) */
    logout() {
        return api.post('/auth/logout');
    },

    /** 비밀번호 변경. body: { curPwd, newPwd } */
    changePwd(body) {
        return api.put('/auth/pwd', body);
    },
};
