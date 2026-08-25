import { forwardRef, useState } from 'react';
import { Keyboard, ScanBarcode } from 'lucide-react';

/**
 * PDA 스캔 입력줄 — 입력 + 소프트 키보드 토글 + (선택) 스캔 생략. 7개 현장 화면에 복붙돼
 * 있던 것을 모았다.
 *
 * 기본 inputMode="none" — 하드웨어 스캐너(키보드 웨지)가 기본이라 소프트 키보드를 띄우지
 * 않는다. 데스크톱 물리 키보드는 inputMode와 무관하게 입력되고, 화면 키보드가 필요할 때만
 * 토글로 연다. 스캐너 종결자가 Enter가 아니라 Tab인 기종이 있어 둘 다 확인으로 받고
 * 포커스 이동은 막는다.
 *
 * @param value / onChange 스캔 입력값 (부모 상태)
 * @param onCommit         Enter·Tab — 스캔 확인
 * @param placeholder      단계별 안내 문구
 * @param onSkip           주면 「스캔 생략」 버튼이 붙는다 (단계 진행형 화면용)
 * @param ref              입력 엘리먼트 — 부모가 단계 전환 때 포커스를 되돌리는 데 쓴다
 */
export const ScanRow = forwardRef(function ScanRow({ value, onChange, onCommit, placeholder, onSkip }, ref) {
    const [manual, setManual] = useState(false);

    const onKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            onCommit();
        }
    };

    return (
        <div className="flex items-center gap-2 shrink-0">
            <div className="relative flex-1">
                <ScanBarcode size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    ref={ref} value={value} autoFocus
                    inputMode={manual ? 'text' : 'none'}
                    autoComplete="off" enterKeyHint="go"
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder}
                    className="input-base w-full pl-10 py-3 text-base"
                />
            </div>
            <button onClick={() => { setManual(m => !m); ref?.current?.focus(); }}
                    title="소프트 키보드로 직접 입력"
                    className={`btn-ghost py-3 shrink-0 ${manual ? 'border-indigo-300 text-indigo-600' : ''}`}>
                <Keyboard size={15} />
            </button>
            {onSkip && <button onClick={onSkip} className="btn-ghost py-3 shrink-0">스캔 생략</button>}
        </div>
    );
});
