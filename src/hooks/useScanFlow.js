/**
 * PDA 현장 화면의 스캔 단계기계 — 피킹·적치·재고이동·보충·재고조사가 글자 단위로 같은 모양의
 * scanFail / passStep / handleScan / skipTask / 포커스 효과를 각자 갖고 있던 것을 모았다.
 * 화면마다 다른 것은 단계 배열과 「이 단계에서 무엇과 대조하는가」뿐이라 그 둘만 인자로 받는다.
 *
 * 마지막 단계는 스캔이 아니라 <b>확정 단계</b>다 (수량 입력 또는 전량 확정). 스캔 대조는 그 앞
 * 단계들만 하고, 확정 단계에 들어설 때 onReachTerminal로 화면에 알린다(수량 기본값 채우기 등).
 *
 * @param steps          단계 칩 배열 [{ key, label }] — 마지막 항목이 확정 단계다
 * @param queue          화면이 거른 지시 목록 (서버 정렬 순서 그대로)
 * @param idOf           지시 식별자 추출 — t => t.putawayTaskId
 * @param matchers       { 단계키: { of: t => 대조할 코드, fail: t => 실패 메시지 } }
 * @param onReachTerminal 확정 단계 진입 시 호출 (task를 받는다)
 * @param terminalRef    확정 단계에서 포커스할 입력 (없으면 포커스하지 않는다)
 */
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import { failFeedback, okFeedback } from '@/utils/scanFeedback';

export function useScanFlow({ steps, queue, idOf, matchers, onReachTerminal, terminalRef,
                             skipEmptyMsg = '건너뛸 다음 지시가 없습니다.' }) {
    const firstStep = steps[0].key;
    const terminalStep = steps[steps.length - 1].key;

    const [step, setStep] = useState(firstStep);
    const [scanVal, setScanVal] = useState('');
    const [curId, setCurId] = useState(null);
    const scanRef = useRef(null);

    const ordered = queue;

    const task = ordered.find(t => idOf(t) === curId) ?? ordered[0] ?? null;
    const taskId = task ? idOf(task) : null;

    // 단계·지시가 바뀔 때마다 입력에 포커스 — 스캐너(키보드 웨지) 입력이 바로 실리게 한다
    useEffect(() => {
        if (!task) return;
        (step === terminalStep ? terminalRef : scanRef)?.current?.focus();
    }, [step, taskId]); // eslint-disable-line react-hooks/exhaustive-deps

    const scanFail = (msg) => {
        failFeedback();
        toast.error(msg);
        setScanVal('');
        scanRef.current?.focus();
    };

    /** 다음 단계로 — 스캔이 맞았을 때와 「스캔 생략」이 같은 문을 쓴다 */
    const pass = () => {
        okFeedback();
        setScanVal('');
        const next = steps[steps.findIndex(s => s.key === step) + 1];
        if (!next) return;
        setStep(next.key);
        if (next.key === terminalStep) onReachTerminal?.(task);
    };

    const handleScan = (raw) => {
        const v = String(raw ?? '').trim().toUpperCase();
        if (!v || !task) return;
        const m = matchers[step];
        if (!m) return; // 확정 단계에는 대조가 없다
        if (v === String(m.of(task)).toUpperCase()) pass();
        else scanFail(m.fail(task));
    };

    /** 지시를 바꾼다 (null이면 큐 맨 앞) — 언제나 첫 단계부터 다시 확인한다 */
    const goTo = (id) => {
        setCurId(id);
        setStep(firstStep);
        setScanVal('');
    };

    /** 같은 지시에 머문다 — 부분 실행 뒤 잔량을 마저 처리하는 자리라 확정 단계로 바로 간다 */
    const stay = (fresh) => {
        setStep(terminalStep);
        onReachTerminal?.(fresh);
    };

    /** 건너뛰기 — 이 지시를 큐 뒤로 미루고 다음 지시로 간다 */
    const skip = () => {
        if (ordered.length < 2) {
            toast(skipEmptyMsg);
            return;
        }
        const i = ordered.findIndex(t => idOf(t) === taskId);
        goTo(idOf(ordered[(i + 1) % ordered.length]));
    };

    /** 화면이 목록으로 나갔다 들어올 때 — 커서·단계를 비운다 */
    const clear = () => {
        setCurId(null);
        setStep(firstStep);
        setScanVal('');
    };

    return { task, queue: ordered, step, scanVal, setScanVal, scanRef, handleScan, pass, skip, goTo, stay, clear };
}
