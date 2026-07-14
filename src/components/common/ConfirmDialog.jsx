import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * 사용법:
 *   const confirmRef = useRef(null);
 *   const ok = await confirmRef.current.confirm({
 *       title: '제목',
 *       message: '내용',
 *       confirmText: '확인',  // 기본 '확인'
 *       cancelText:  '취소',  // 기본 '취소'
 *       danger:      true,    // 빨간색 강조
 *   });
 *   if (!ok) return;
 *
 *   <ConfirmDialog ref={confirmRef} />
 */
const ConfirmDialog = forwardRef((_, ref) => {
    const [dialog, setDialog] = useState(null);

    const close = useCallback((result) => {
        if (dialog) dialog.resolve(result);
        setDialog(null);
    }, [dialog]);

    useImperativeHandle(ref, () => ({
        confirm: (options) => new Promise(resolve => {
            setDialog({ ...options, resolve });
        }),
    }), []);

    useEffect(() => {
        if (!dialog) return;
        const handler = (e) => {
            if (e.key === 'Escape') close(false);
            if (e.key === 'Enter')  close(true);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [dialog, close]);

    if (!dialog) return null;

    const isDanger = !!dialog.danger;

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
            onClick={() => close(false)}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 헤더 */}
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${isDanger ? 'bg-rose-100' : 'bg-indigo-100'}`}>
                            <AlertTriangle size={18} className={isDanger ? 'text-rose-600' : 'text-indigo-600'} />
                        </div>
                        <h3 className="text-base font-bold text-slate-800">{dialog.title || '확인'}</h3>
                    </div>
                    <button onClick={() => close(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded">
                        <X size={16} />
                    </button>
                </div>

                {/* 본문 */}
                <div className="px-6 py-5">
                    <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                        {dialog.message}
                    </p>
                </div>

                {/* 푸터 */}
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
                    <button
                        onClick={() => close(false)}
                        className="px-4 py-2 text-sm font-bold text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                    >
                        {dialog.cancelText || '취소'}
                    </button>
                    <button
                        onClick={() => close(true)}
                        autoFocus
                        className={`px-5 py-2 text-sm font-bold text-white rounded-lg shadow-md ${
                            isDanger
                                ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
                                : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'
                        }`}
                    >
                        {dialog.confirmText || '확인'}
                    </button>
                </div>
            </div>
        </div>
    );
});

ConfirmDialog.displayName = 'ConfirmDialog';
export default ConfirmDialog;
