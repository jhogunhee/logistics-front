import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from "react-hot-toast";
import { Warehouse } from "lucide-react";
import { useAuth } from '@/auth/AuthContext';

function Login() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [submitting, setSubmitting] = useState(false);
    // 둘러보기 편하도록 관리자 계정을 미리 채워 둔다 — 그대로 [Login]만 누르면 저장까지 다 된다.
    // 정식 서비스가 아니라 시연용이라는 전제다. 실제로 열게 되면 조회 전용 계정(viewer)으로
    // 바꾸고 admin 비밀번호는 레포에 없는 값으로 두면 된다 — INQ는 전 화면을 보되 저장이 막힌다
    const [form, setForm] = useState({
        loginId: 'admin',
        pwd: 'wms!1234',
    });

    const onChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({
            ...prev,
            [name]: value,
        }));
    };

    const onLogin = async (e) => {
        e?.preventDefault();   // form 제출의 기본 동작(페이지 새로고침)을 막는다
        if (!form.loginId || !form.pwd) {
            toast.error("아이디와 비밀번호를 입력해주세요.");
            return;
        }

        setSubmitting(true);
        try {
            const me = await login(form.loginId, form.pwd);
            toast.success(`${me.usrNm}님 환영합니다.`);
            navigate("/");
        } catch (e) {
            // 로그인 실패는 서버가 400으로 준다 — 401이면 인터셉터가 이 화면으로 되돌려 사유가 묻힌다
            toast.error(e.message || "로그인에 실패했습니다.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="w-full max-w-md bg-white rounded-xl shadow-md p-8">

                {/* 로고 / 타이틀 */}
                <div className="mb-8 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center shadow-inner">
                            <Warehouse size={28} className="text-white" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Sign in
                    </h1>
                    <p className="mt-2 text-sm text-gray-500">
                        WareFlow 시스템에 접속하세요
                    </p>
                </div>

                {/* form으로 감싸야 브라우저 비밀번호 관리자가 붙고, 두 칸 어디서 Enter를 쳐도 제출된다
                    (예전엔 비밀번호 칸에만 onKeyDown이 있어 아이디 칸 Enter는 아무 일도 안 했다) */}
                <form onSubmit={onLogin}>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="loginId" className="block text-sm font-medium text-gray-700 mb-1">
                                User ID
                            </label>
                            <input
                                id="loginId"
                                type="text"
                                name="loginId"
                                autoComplete="username"
                                placeholder="아이디를 입력하세요"
                                value={form.loginId}
                                onChange={onChange}
                                className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>

                        <div>
                            <label htmlFor="pwd" className="block text-sm font-medium text-gray-700 mb-1">
                                Password
                            </label>
                            <input
                                id="pwd"
                                type="password"
                                name="pwd"
                                autoComplete="current-password"
                                placeholder="비밀번호를 입력하세요"
                                value={form.pwd}
                                onChange={onChange}
                                className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="mt-6 w-full h-11 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition disabled:opacity-60"
                    >
                        {submitting ? '로그인 중…' : 'Login'}
                    </button>
                </form>

                {/* 하단 문구 */}
                <div className="mt-6 text-center text-xs text-gray-400">
                    © WareFlow Project
                </div>
            </div>
        </div>
    );
}

export default Login;
