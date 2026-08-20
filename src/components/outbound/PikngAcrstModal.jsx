import { useEffect, useState } from 'react';
import { History, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbPikngApi } from '@/api/outbPikngApi';
import { fmtDt, num } from '@/utils/format';

/**
 * 피킹 실적 내역 팝업 — 지시 하나의 실행 로그(pikng_acrst)를 보여준다.
 * 실행 1회 = 1행의 append-only 기록이라 부분 피킹이 몇 번에 나뉘었는지가 그대로 보인다.
 * 실적 합 = 지시의 피킹수량 (서버가 한 트랜잭션에서 함께 쌓는 항등식).
 *
 * @param task    지시 행 { taskId, outbNo, prodCd, prodNm, cmplQty }
 * @param onClose 닫기
 */
export default function PikngAcrstModal({ task, onClose }) {
    const [rows, setRows] = useState(null);

    useEffect(() => {
        outbPikngApi.acrsts(task.taskId)
            .then(setRows)
            .catch((e) => {
                toast.error(e.message || '실적 조회에 실패했습니다.');
                setRows([]);
            });
    }, [task.taskId]);

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20" onMouseDown={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-[520px] max-h-[70vh] flex flex-col"
                 onMouseDown={(e) => e.stopPropagation()}>

                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <History size={16} className="text-indigo-600" />
                        <h3 className="text-base font-bold text-slate-800">피킹 실적</h3>
                        <span className="text-xs text-slate-400">{task.outbNo} · {task.prodCd}</span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 py-4 flex-1 min-h-0 overflow-auto">
                    {rows == null ? (
                        <p className="text-sm text-slate-400 py-4 text-center">불러오는 중…</p>
                    ) : rows.length === 0 ? (
                        <p className="text-sm text-slate-400 py-4 text-center">아직 피킹 실적이 없습니다.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-slate-400 border-b border-slate-200">
                                    <th className="text-left py-1.5 font-medium">실행일시</th>
                                    <th className="text-right py-1.5 font-medium">피킹수량</th>
                                    <th className="text-left py-1.5 pl-6 font-medium">작업자</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.pikngAcrstId} className="border-b border-slate-100 last:border-0">
                                        <td className="py-1.5 text-slate-600">{fmtDt(r.createdAt)}</td>
                                        <td className="py-1.5 text-right font-bold text-emerald-600 tabular-nums">{num(r.pikngQty)}</td>
                                        <td className="py-1.5 pl-6 text-slate-500">{r.createdBy}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="px-6 py-3 border-t border-slate-200 flex items-center">
                    <span className="text-xs text-slate-500">
                        실행 {rows?.length ?? 0}회 · 합계 <b className="text-slate-700">{num(task.cmplQty)}</b>개
                    </span>
                    <button onClick={onClose} className="btn-ghost ml-auto">닫기</button>
                </div>
            </div>
        </div>
    );
}
