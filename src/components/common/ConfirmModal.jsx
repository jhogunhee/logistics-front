import { useEffect } from 'react';

/**
 * 선언형 확인 모달. `{target && <ConfirmModal …>}` 형태로 쓴다.
 *
 * 화면 17곳에 오버레이·카드·푸터가 같은 모양으로 복붙돼 있던 것을 모았다. 정작 화면마다
 * 다른 것은 제목·본문·동작뿐이라 그 셋만 props로 받고 나머지는 여기서 고정한다.
 *
 * {@link ConfirmDialog}와 역할이 다르다 — 그쪽은 `await confirm({ message })`로 부르는
 * 명령형 API라 본문이 문자열 한 줄이다. 이 프로젝트의 확인 모달은 대부분 「신규 3건 · 수정
 * 2건」처럼 서식 있는 본문을 보여줘야 해서 children으로 받는 선언형이 맞는다.
 *
 * @param title       제목 ("저장하시겠습니까?")
 * @param children    본문 (JSX 그대로)
 * @param confirmText 확인 버튼 문구 (기본 '확인')
 * @param cancelText  취소 버튼 문구 (기본 '취소')
 * @param danger      되돌릴 수 없는 동작이면 확인 버튼이 붉어진다
 * @param onConfirm   확인 클릭
 * @param onCancel    취소 · 배경 클릭 · Esc
 */
export default function ConfirmModal({
    title,
    children,
    confirmText = '확인',
    cancelText = '취소',
    danger = false,
    onConfirm,
    onCancel,
}) {
    // Esc로 닫기 — 인라인 모달들에는 없던 동작이라 여기 모으면서 함께 붙인다
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onCancel?.(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onCancel]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20"
            onMouseDown={onCancel}
        >
            <div
                className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <h3 className="text-lg font-bold text-slate-800">{title}</h3>
                <div className="text-sm text-slate-500">{children}</div>
                <div className="flex gap-2 justify-end">
                    <button onClick={onCancel} className="btn-modal-cancel">
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        autoFocus
                        className={danger
                            ? 'px-4 py-2 text-sm font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700'
                            : 'btn-modal-primary'}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
