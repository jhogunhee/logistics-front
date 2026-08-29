import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Warehouse } from 'lucide-react';

import { useAuth } from '@/auth/AuthContext';
import { ScanRow } from '@/components/mobile/ScanRow';

/**
 * PDA 간편 로그인 — 작업자 코드 바코드를 한 번 찍으면 들어온다.
 *
 * 작업자 코드는 별도 값이 아니라 로그인 아이디 그대로다(라벨 인쇄가 그 값을 찍는다).
 * 비밀번호를 묻지 않는 것은 목적이 침입 차단이 아니라 실적 귀속이기 때문이고, 그래서
 * 열리는 계정도 현장 역할뿐이다 — 관리·조회 계정은 아래 링크의 비밀번호 화면으로 들어온다.
 */
export default function MobileLogin() {
    const navigate = useNavigate();
    const { scanLogin } = useAuth();
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const scanRef = useRef(null);

    const onCommit = async (scanned) => {
        const loginId = String(scanned ?? '').trim();
        if (!loginId || busy) return;

        setBusy(true);
        try {
            const me = await scanLogin(loginId);
            toast.success(`${me.usrNm}님 환영합니다.`);
            navigate('/m', { replace: true });
        } catch (e) {
            // 실패는 서버가 400으로 준다 — 401이면 인터셉터가 이 화면으로 되돌려 사유가 묻힌다
            toast.error(e.message || '로그인에 실패했습니다.');
            setCode('');
            scanRef.current?.focus();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col h-dvh bg-slate-100">
            <header className="flex items-center gap-2 h-12 px-3 bg-white border-b border-slate-200 shrink-0">
                <span className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <Warehouse size={16} className="text-white" />
                </span>
                <span className="font-bold text-slate-800 text-sm">WareFlow PDA</span>
            </header>

            <main className="flex-1 min-h-0 p-3 flex flex-col gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                    <div>
                        <p className="font-bold text-slate-800">작업자 코드를 스캔하세요</p>
                        <p className="text-xs text-slate-500 mt-1">
                            사원증 바코드를 찍으면 바로 작업 화면으로 들어갑니다.
                        </p>
                    </div>

                    <ScanRow
                        ref={scanRef}
                        value={code}
                        onChange={setCode}
                        onCommit={onCommit}
                        placeholder="작업자 코드"
                    />

                    {busy && (
                        <p className="flex items-center gap-2 text-xs text-indigo-600">
                            <Loader2 size={14} className="animate-spin" />
                            확인 중…
                        </p>
                    )}
                </div>

                <p className="text-xs text-slate-400 px-1">
                    관리자·조회 계정은 스캔으로 들어올 수 없습니다 —{' '}
                    <Link to="/login" className="text-indigo-600 font-medium underline underline-offset-2">
                        아이디로 로그인
                    </Link>
                </p>
            </main>
        </div>
    );
}
