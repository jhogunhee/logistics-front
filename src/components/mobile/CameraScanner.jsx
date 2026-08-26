import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * 카메라 바코드 스캐너 — 전용 스캐너가 없는 스마트폰용. 브라우저 내장 BarcodeDetector로
 * 후면 카메라 프레임을 주기적으로 읽어 첫 인식값을 돌려준다(외부 라이브러리 없음).
 *
 * 동작 조건 둘: BarcodeDetector 지원(안드로이드 크롬 — 여는 쪽 ScanRow가 미리 거른다)과
 * 보안 컨텍스트(https 또는 localhost — 아니면 getUserMedia 자체가 거부된다).
 */
export function CameraScanner({ onDetect, onClose }) {
    const videoRef = useRef(null);

    useEffect(() => {
        let stream = null;
        let timer = null;
        let cancelled = false;
        (async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                if (cancelled) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                const detector = new window.BarcodeDetector({
                    formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'upc_a'],
                });
                timer = setInterval(async () => {
                    if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return;
                    try {
                        const codes = await detector.detect(videoRef.current);
                        if (codes.length > 0) {
                            clearInterval(timer);
                            onDetect(codes[0].rawValue);
                        }
                    } catch { /* 프레임 단위 실패는 무시 — 다음 틱에 다시 본다 */ }
                }, 250);
            } catch {
                // 닫는 중이면 조용히 끝낸다 — 사용자가 X를 누르면 대기 중이던 play()가 거부되는데,
                // 그걸 실패로 알리면 권한이 멀쩡한데도 권한 탓을 하는 오진 메시지가 뜬다
                if (cancelled) return;
                toast.error('카메라를 열 수 없습니다 — 권한을 확인하세요 (https 접속에서만 동작합니다)');
                onClose();
            }
        })();
        return () => {
            cancelled = true;
            if (timer) clearInterval(timer);
            stream?.getTracks().forEach(t => t.stop());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
            <video ref={videoRef} playsInline muted className="flex-1 min-h-0 object-cover" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-40 border-2 border-white/80 rounded-xl" />
            </div>
            <button onClick={onClose} aria-label="카메라 닫기"
                    className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white">
                <X size={20} />
            </button>
            <p className="absolute bottom-6 inset-x-0 text-center text-white/80 text-sm">
                바코드를 사각형 안에 맞추세요
            </p>
        </div>
    );
}
