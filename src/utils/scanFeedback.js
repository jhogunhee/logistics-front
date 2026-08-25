/**
 * PDA 스캔 피드백 — 소음 많은 현장에서 토스트만으로는 부족해 소리·진동을 함께 낸다.
 * 소리를 못 내는 환경(권한·데스크톱)이면 조용히 넘어간다.
 */
let audioCtx = null;

const beep = (freq, ms) => {
    try {
        audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
        // 모바일 브라우저는 사용자 제스처 전까지 컨텍스트를 잠가둔다 — 스캔(키 입력)이 제스처라 여기서 푼다
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ms / 1000);
        osc.start();
        osc.stop(audioCtx.currentTime + ms / 1000);
    } catch { /* empty */ }
};

/** 스캔 통과·실행 성공 — 짧은 고음 + 짧은 진동 */
export const okFeedback = () => {
    navigator.vibrate?.(80);
    beep(1200, 120);
};

/** 스캔 불일치·오류 — 낮은 경고음 + 긴 진동 */
export const failFeedback = () => {
    navigator.vibrate?.(200);
    beep(250, 300);
};
