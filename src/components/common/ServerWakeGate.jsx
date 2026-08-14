import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, ServerCrash, RotateCw } from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const PROBE_PATH = '/master/code-groups';

// 깨어 있는 서버는 수백 ms 안에 답한다. 그보다 오래 걸리면 기동 중이므로 안내를 띄운다.
const BANNER_AFTER_MS = 1200;
// 콜드 스타트는 Render 인스턴스 기동 + Spring Boot 기동을 합쳐 1분 가까이 걸린다.
const PROBE_TIMEOUT_MS = 90_000;
// 기동 중에는 502/503이 즉시 떨어지므로 타임아웃을 기다리지 않고 재시도한다.
const RETRY_DELAY_MS = 3_000;
const MAX_ATTEMPTS = 8;

/**
 * 첫 진입 시 서버가 깨어날 때까지 화면을 붙잡는다.
 *
 * 없으면 콜드 스타트 동안 모든 조회가 5초 타임아웃으로 죽어 **빈 그리드만 남는다** —
 * 서버가 죽은 것과 기동 중인 것이 사용자에게 똑같이 보인다. 둘을 구분해 알리는 것이 목적이다.
 * axios 인스턴스를 쓰지 않는 이유는 그쪽 타임아웃(5초)이 콜드 스타트보다 짧고,
 * 실패마다 조회 실패 토스트가 뜨기 때문이다.
 */
export default function ServerWakeGate({ children }) {
    const [awake, setAwake] = useState(false);
    const [showBanner, setShowBanner] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [failed, setFailed] = useState(false);
    const [round, setRound] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setFailed(false);
        setElapsed(0);

        const bannerTimer = setTimeout(() => !cancelled && setShowBanner(true), BANNER_AFTER_MS);
        const ticker = setInterval(() => !cancelled && setElapsed((s) => s + 1), 1000);

        (async () => {
            for (let attempt = 0; attempt < MAX_ATTEMPTS && !cancelled; attempt++) {
                try {
                    await axios.get(BASE + PROBE_PATH, { timeout: PROBE_TIMEOUT_MS });
                    if (!cancelled) setAwake(true);
                    return;
                } catch {
                    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
                }
            }
            if (!cancelled) setFailed(true);
        })();

        return () => {
            cancelled = true;
            clearTimeout(bannerTimer);
            clearInterval(ticker);
        };
    }, [round]);

    if (awake) return children;

    // 이미 깨어 있는 서버라면 이 구간이 눈에 띄지 않게 지나간다 (빈 화면 깜빡임 방지)
    if (!showBanner) return null;

    if (failed) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                <ServerCrash size={40} className="text-slate-300" />
                <div>
                    <p className="text-sm font-bold text-slate-700">서버에 연결하지 못했습니다</p>
                    <p className="mt-1 text-xs text-slate-500">
                        잠시 후 다시 시도해 주세요.
                    </p>
                </div>
                <button
                    onClick={() => { setShowBanner(false); setRound((n) => n + 1); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                    <RotateCw size={14} />
                    <span>다시 시도</span>
                </button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <Loader2 size={40} className="text-indigo-500 animate-spin" />
            <div>
                <p className="text-sm font-bold text-slate-700">서버를 깨우는 중입니다</p>
                <p className="mt-1 text-xs text-slate-500">
                    무료 플랜이라 유휴 상태에서 잠들어 있습니다 — 최초 1회 최대 1분이 걸립니다.
                </p>
            </div>
            <p className="text-xs font-mono text-slate-400">{elapsed}초</p>
        </div>
    );
}
