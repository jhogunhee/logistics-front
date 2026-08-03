import { useEffect, useState } from 'react';
import { History, X } from 'lucide-react';

/**
 * 리비전 이력 모달 — 목록 + 스냅샷 보기 (조회 전용 감사 이력).
 * 예전 정의로 되돌리려면 스냅샷 JSON을 보고 편집 화면에서 다시 저장한다.
 *
 * props:
 *   open       표시 여부
 *   onClose    () => void
 *   listFn     () => Promise<[{ rvsnNo, savedBy, savedAt }]>
 *   getFn      (rvsnNo) => Promise<snapshot object>
 */
export default function RevisionHistory({ open, onClose, listFn, getFn }) {
    const [revisions, setRevisions] = useState([]);
    const [selected, setSelected] = useState(null);   // rvsnNo
    const [snapshot, setSnapshot] = useState(null);

    useEffect(() => {
        if (!open) return;
        let ignore = false;
        listFn()
            .then(data => {
                if (ignore) return;
                setRevisions(data);
                setSelected(null);
                setSnapshot(null);
            })
            .catch(() => {}); // 실패 토스트는 axios 인터셉터가 띄운다
        return () => { ignore = true; };
    }, [open]);  // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const show = async (rvsnNo) => {
        setSelected(rvsnNo);
        try {
            setSnapshot(await getFn(rvsnNo));
        } catch {
            // 실패 토스트는 axios 인터셉터가 띄운다
        }
    };

    const fmt = (v) => (v ? v.replace('T', ' ').slice(0, 16) : '');

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-[720px] flex flex-col gap-4"
                 onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <History size={16} className="text-indigo-600" />
                        <h3 className="text-lg font-bold text-slate-800">리비전 이력</h3>
                        <span className="text-xs text-slate-400">저장할 때마다 정의 전체가 스냅샷으로 남습니다</span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>

                <div className="flex gap-4 min-h-0">
                    {/* 목록 */}
                    <div className="w-52 shrink-0 flex flex-col gap-1.5 max-h-96 overflow-y-auto">
                        {revisions.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">이력이 없습니다.</p>}
                        {revisions.map(r => (
                            <button key={r.rvsnNo} onClick={() => show(r.rvsnNo)}
                                    className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                                        selected === r.rvsnNo
                                            ? 'border-indigo-400 bg-indigo-50'
                                            : 'border-slate-200 hover:border-indigo-300'
                                    }`}>
                                <div className="text-sm font-bold text-slate-700">리비전 {r.rvsnNo}</div>
                                <div className="text-[11px] text-slate-400">{r.savedBy} · {fmt(r.savedAt)}</div>
                            </button>
                        ))}
                    </div>

                    {/* 스냅샷 */}
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                        {snapshot == null ? (
                            <p className="text-sm text-slate-400 text-center py-10">리비전을 선택하면 그때의 정의를 보여줍니다.</p>
                        ) : (
                            <pre className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] leading-relaxed overflow-auto max-h-80">
                                {JSON.stringify(snapshot, null, 2)}
                            </pre>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
