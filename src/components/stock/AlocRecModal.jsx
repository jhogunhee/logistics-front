import { useEffect, useState } from 'react';
import { Scale, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { invApi } from '@/api/invApi';
import { num } from '@/utils/format';

/**
 * 예약 대사 팝업 — 재고 키마다 inv.aloc_qty(장부)와 원천별 미소진 합(할당 · 이동·적치지시 · 스테이징 피킹분)을
 * 나란히 놓는다. 예약은 이력에 남지 않아 이 비교가 잔류·누락을 잡는 유일한 수단이다.
 * 차이(diff)가 0이 아닌 행은 코드 결함의 증거라 맨 위에 붉게 모은다.
 */
export default function AlocRecModal({ onClose }) {
    const [rows, setRows] = useState(null);

    useEffect(() => {
        invApi.alocReconciliation()
            .then(setRows)
            .catch((e) => {
                toast.error(e.message || '예약 대사 조회에 실패했습니다.');
                setRows([]);
            });
    }, []);

    const mismatched = rows?.filter(r => r.diff !== 0) ?? [];
    const sorted = rows ? [...mismatched, ...rows.filter(r => r.diff === 0)] : [];

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20" onMouseDown={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-[880px] max-h-[75vh] flex flex-col"
                 onMouseDown={(e) => e.stopPropagation()}>

                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Scale size={16} className="text-indigo-600" />
                        <h3 className="text-base font-bold text-slate-800">예약 대사</h3>
                        <span className="text-xs text-slate-400">장부 예약 = 할당 미소진 + 이동·적치지시 미소진 + 스테이징 피킹분</span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 py-4 flex-1 min-h-0 overflow-auto">
                    {rows == null ? (
                        <p className="text-sm text-slate-400 py-4 text-center">대사 중…</p>
                    ) : (
                        <>
                            <p className={`text-xs rounded-lg px-3 py-2 mb-3 ${mismatched.length === 0
                                ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700 font-bold'}`}>
                                {mismatched.length === 0
                                    ? `어긋난 행이 없습니다 — 예약 ${num(rows.length)}건 전부 원천과 일치합니다.`
                                    : `어긋난 행 ${num(mismatched.length)}건 — 예약을 만들고 푸는 경로 중 하나가 짝을 놓쳤습니다. 차이가 양수면 예약 잔류, 음수면 예약 누락입니다.`}
                            </p>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-slate-400 border-b border-slate-200">
                                        <th className="text-left py-1.5 font-medium">상품</th>
                                        <th className="text-left py-1.5 font-medium">로케이션</th>
                                        <th className="text-left py-1.5 font-medium">Lot</th>
                                        <th className="text-right py-1.5 font-medium">장부 예약</th>
                                        <th className="text-right py-1.5 font-medium">할당</th>
                                        <th className="text-right py-1.5 font-medium">이동·적치지시</th>
                                        <th className="text-right py-1.5 font-medium">스테이징</th>
                                        <th className="text-right py-1.5 font-medium">차이</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map(r => (
                                        <tr key={`${r.prodCd}|${r.locCd}|${r.lotNo}`}
                                            className={`border-b border-slate-100 last:border-0 ${r.diff !== 0 ? 'bg-rose-50' : ''}`}>
                                            <td className="py-1.5 text-slate-700">{r.prodCd} <span className="text-slate-400 text-xs">{r.prodNm}</span></td>
                                            <td className="py-1.5 text-slate-600">{r.locCd}</td>
                                            <td className="py-1.5 text-slate-500">{r.lotNo}</td>
                                            <td className="py-1.5 text-right tabular-nums font-bold">{num(r.alocQty)}</td>
                                            <td className="py-1.5 text-right tabular-nums">{num(r.outbQty)}</td>
                                            <td className="py-1.5 text-right tabular-nums">{num(r.movQty)}</td>
                                            <td className="py-1.5 text-right tabular-nums">{num(r.stagedQty)}</td>
                                            <td className={`py-1.5 text-right tabular-nums font-bold ${r.diff !== 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                                                {r.diff === 0 ? '0' : (r.diff > 0 ? '+' : '') + num(r.diff)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
