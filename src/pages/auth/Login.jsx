import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from "react-hot-toast";
import { Warehouse } from "lucide-react";
import { useAuth } from '@/auth/AuthContext';

function Login() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({
        loginId: '',
        pwd: '',
    });

    const onChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({
            ...prev,
            [name]: value,
        }));
    };

    const onLogin = async () => {
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

                {/* 입력 영역 */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            User ID
                        </label>
                        <input
                            type="text"
                            name="loginId"
                            placeholder="아이디를 입력하세요"
                            value={form.loginId}
                            onChange={onChange}
                            className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Password
                        </label>
                        <input
                            type="password"
                            name="pwd"
                            placeholder="비밀번호를 입력하세요"
                            value={form.pwd}
                            onChange={onChange}
                            onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                            className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                </div>

                {/* 로그인 버튼 */}
                <button
                    onClick={onLogin}
                    disabled={submitting}
                    className="mt-6 w-full h-11 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition disabled:opacity-60"
                >
                    {submitting ? '로그인 중…' : 'Login'}
                </button>

                {/* 하단 문구 */}
                <div className="mt-6 text-center text-xs text-gray-400">
                    © WareFlow Project
                </div>
            </div>
        </div>
    );
}

export default Login;
