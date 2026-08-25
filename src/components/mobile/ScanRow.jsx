import { forwardRef, useState } from 'react';
import { Camera, Keyboard, ScanBarcode } from 'lucide-react';
import toast from 'react-hot-toast';

import { CameraScanner } from './CameraScanner';

/**
 * PDA 스캔 입력줄 — 입력 + 카메라 스캔 + 소프트 키보드 토글 + (선택) 스캔 생략.
 * 7개 현장 화면에 복붙돼 있던 것을 모았다.
 *
 * 기본 inputMode="none" — 하드웨어 스캐너(키보드 웨지)가 기본이라 소프트 키보드를 띄우지
 * 않는다. 데스크톱 물리 키보드는 inputMode와 무관하게 입력되고, 화면 키보드가 필요할 때만
 * 토글로 연다. 스캐너 종결자가 Enter가 아니라 Tab인 기종이 있어 둘 다 확인으로 받고
 * 포커스 이동은 막는다. 전용 스캐너가 없는 스마트폰은 카메라 버튼이 그 자리를 대신한다.
 *
 * @param value / onChange 스캔 입력값 (부모 상태)
 * @param onCommit         스캔 확인 — <b>스캔값을 인자로 받는다</b> (키보드 웨지는 입력값,
 *                         카메라는 인식값. 부모가 자기 상태를 다시 읽으면 카메라 값이 새는다)
 * @param placeholder      단계별 안내 문구
 * @param onSkip           주면 「스캔 생략」 버튼이 붙는다 (단계 진행형 화면용)
 * @param ref              입력 엘리먼트 — 부모가 단계 전환 때 포커스를 되돌리는 데 쓴다
 */
export const ScanRow = forwardRef(function ScanRow({ value, onChange, onCommit, placeholder, onSkip }, ref) {
    const [manual, setManual] = useState(false);
    const [camOpen, setCamOpen] = useState(false);

    const onKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            onCommit(value);
        }
    };

    const openCamera = () => {
        // BarcodeDetector는 안드로이드 크롬 등 일부 브라우저만 지원한다 — 열기 전에 거른다
        if (!('BarcodeDetector' in window)) {
            toast.error('이 브라우저는 카메라 바코드 인식을 지원하지 않습니다 — 스캐너 또는 직접 입력을 쓰세요.');
            return;
        }
        setCamOpen(true);
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
            <button onClick={openCamera} title="카메라로 바코드 스캔"
                    className="btn-ghost py-3 shrink-0">
                <Camera size={15} />
            </button>
            <button onClick={() => { setManual(m => !m); ref?.current?.focus(); }}
                    title="소프트 키보드로 직접 입력"
                    className={`btn-ghost py-3 shrink-0 ${manual ? 'border-indigo-300 text-indigo-600' : ''}`}>
                <Keyboard size={15} />
            </button>
            {onSkip && <button onClick={onSkip} className="btn-ghost py-3 shrink-0">스캔 생략</button>}

            {camOpen && (
                <CameraScanner
                    onDetect={(text) => {
                        setCamOpen(false);
                        onCommit(text);
                    }}
                    onClose={() => setCamOpen(false)}
                />
            )}
        </div>
    );
});
