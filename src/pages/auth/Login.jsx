import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from "react-hot-toast";

function Login() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        userId: '',
        password: '',
    });

    const onChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({
            ...prev,
            [name]: value,
        }));
    };

    const onLogin = async () => {
        if (!form.userId || !form.password) {
            toast.error("아이디와 비밀번호를 입력해주세요.");
            return;
        }

        // TODO: 백엔드 인증 API 구현 후 연동. 지금은 통과 처리.
        sessionStorage.setItem(
            "loginUser",
            JSON.stringify({ userId: form.userId })
        );
        navigate("/");
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="w-full max-w-md bg-white rounded-xl shadow-md p-8">

                {/* 로고 / 타이틀 */}
                <div className="mb-8 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="w-12 h-12 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xl font-bold">
                            W
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Sign in
                    </h1>
                    <p className="mt-2 text-sm text-gray-500">
                        WMS 시스템에 접속하세요
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
                            name="userId"
                            placeholder="아이디를 입력하세요"
                            value={form.userId}
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
                            name="password"
                            placeholder="비밀번호를 입력하세요"
                            value={form.password}
                            onChange={onChange}
                            onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                            className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                </div>

                {/* 로그인 버튼 */}
                <button
                    onClick={onLogin}
                    className="mt-6 w-full h-11 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
                >
                    Login
                </button>

                {/* 하단 문구 */}
                <div className="mt-6 text-center text-xs text-gray-400">
                    © WMS Project
                </div>
            </div>
        </div>
    );
}

export default Login;
