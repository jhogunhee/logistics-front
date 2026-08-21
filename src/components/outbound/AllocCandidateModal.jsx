import { useEffect, useMemo, useState } from 'react';
import { Boxes, TriangleAlert, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbAllocApi } from '@/api/outbAllocApi';
import { fmtDe, num } from '@/utils/format';

/**
 * 수동할당 후보 재고 팝업.
 *
 * <b>잔여수명이 기준에 못 미치는 Lot도 고를 수 있다</b> — 붉게 표시할 뿐 막지 않는다.
 * 수동할당의 존재 이유가 곧 예외 처리라서, 여기서 차단하면 자동할당과 다를 게 없어진다.
 * (유통기한이 지난 Lot은 서버가 후보에서 빼므로 애초에 목록에 오지 않는다.)
 *
 * 통과 판정(lifePass)은 <b>자동할당이 쓰는 그 기준</b>이다 — 할당 전략에 고정 기준값 슬롯이
 * 있으면 그 값으로, 없으면 점포 기준으로 판정한다. 적용된 기준은 lifeRjctRsn 툴팁에 그대로 실린다.
 * 화면이 점포 기준으로만 판정하면 「여기선 초록인데 자동할당은 거르는」 Lot이 생겨 화면을 못 믿게 된다.
 * 재고위치 계층(tierSeq)도 같은 이유로 내려온다 — 어느 계층에도 안 맞는 재고는 자동할당이 쓰지 않으므로
 * 「대상 아님」으로 표시한다. 수동할당은 그 재고도 고를 수 있다.
 *
 * 수량은 행마다 입력하고, 넣은 행만 할당 대상이 된다 — 체크박스를 따로 두면
 * 「체크했는데 수량이 0」·「수량을 넣었는데 체크 안 함」 두 어긋남이 생긴다.
 *
 * @param line     대상 라인 (AllocLineResponse). null이면 닫힘
 * @param wavId    실행 웨이브
 * @param onClose  닫기
 * @param onSaved  저장 성공 콜백 (목록 재조회)
 */
export default function AllocCandidateModal({ line, wavId, onClose, onSaved }) {
    const [candidates, setCandidates] = useState(null); // null = 로딩중
    const [qtyById, setQtyById] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!line) return;
        setCandidates(null);
        setQtyById({});
        let ignore = false;
        outbAllocApi.candidates(line.outbLineId)
            .then(data => { if (!ignore) setCandidates(data); })
            .catch(e => { if (!ignore) { setCandidates([]); toast.error(e.message || '후보 재고를 불러오지 못했습니다.'); } });
        return () => { ignore = true; };
    }, [line?.outbLineId]);

    const entered = useMemo(
        () => Object.entries(qtyById)
            .map(([invId, qty]) => ({ invId: Number(invId), qty: Number(qty) }))
            .filter(i => i.qty > 0),
        [qtyById],
    );
    const enteredQty = entered.reduce((sum, i) => sum + i.qty, 0);

    if (!line) return null;

    const remainQty = line.remainQty;
    // 잔량 초과는 서버가 전 행 합계로 막지만, 화면이 먼저 눌러 헛수고를 줄인다
    const overRemain = enteredQty > remainQty;

    const setQty = (invId, raw, avalQty) => {
        const parsed = raw === '' ? '' : Math.max(0, Math.min(Number(raw) || 0, avalQty));
        setQtyById(prev => ({ ...prev, [invId]: parsed }));
    };

    const save = async () => {
        if (entered.length === 0) {
            toast('할당할 수량을 입력하세요.');
            return;
        }
        if (overRemain) {
            toast.error(`잔량(${num(remainQty)})을 초과했습니다 — 입력 합계 ${num(enteredQty)}`);
            return;
        }
        setSaving(true);
        try {
            await outbAllocApi.allocateManual(wavId, entered.map(i => ({ ...i, outbLineId: line.outbLineId })));
            toast.success(`${line.prodCd} ${num(enteredQty)}개를 할당했습니다.`);
            onSaved();
            onClose();
        } catch (e) {
            toast.error(e.message || '수동할당에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/20" onMouseDown={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-[820px] max-h-[80vh] flex flex-col"
                 onMouseDown={(e) => e.stopPropagation()}>

                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Boxes size={16} className="text-indigo-600" />
                        <h3 className="text-base font-bold text-slate-800">수동할당</h3>
                        <span className="text-xs text-slate-400">
                            {line.outbNo} · {line.prodCd} {line.prodNm}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                {/* 요약 — 얼마를 더 채워야 하는지 */}
                <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-5 text-xs shrink-0">
                    <Fig label="주문수량" value={line.odrQty} />
                    <Fig label="기할당" value={line.alocQty} />
                    <Fig label="잔량" value={remainQty} accent />
                    <div className="ml-auto flex items-center gap-2">
                        <span className="text-slate-400">입력 합계</span>
                        <span className={`text-sm font-bold tabular-nums ${overRemain ? 'text-rose-600' : 'text-slate-700'}`}>
                            {num(enteredQty)}
                        </span>
                    </div>
                </div>

                {/* 후보 목록 */}
                <div className="flex-1 min-h-0 overflow-auto px-6 py-3">
                    {candidates === null && <p className="text-sm text-slate-400 py-8 text-center">후보 재고를 불러오는 중…</p>}
                    {candidates?.length === 0 && (
                        <p className="text-sm text-slate-400 py-8 text-center">
                            할당할 수 있는 보관 재고가 없습니다 — 가용재고가 있는 Lot만 후보가 됩니다.
                        </p>
                    )}
                    {candidates?.length > 0 && (
                        <table className="w-full text-[13px]">
                            <thead>
                            <tr className="text-[11px] text-slate-400 border-b border-slate-200">
                                <Th>로케이션</Th>
                                <Th>계층</Th>
                                <Th>Lot</Th>
                                <Th>제조일자</Th>
                                <Th>유통기한</Th>
                                <Th right>가용</Th>
                                <Th right>잔여수명</Th>
                                <Th right>할당수량</Th>
                            </tr>
                            </thead>
                            <tbody>
                            {candidates.map(c => (
                                <tr key={c.invId}
                                    className={`border-b border-slate-100 ${c.lifePass && c.tierSeq != null ? '' : 'bg-rose-50/50'}`}>
                                    <Td className="font-medium text-slate-700">{c.locCd}</Td>
                                    <Td>
                                        {c.tierSeq == null
                                            ? (
                                                <span title="전략의 어느 재고위치 계층에도 맞지 않아 자동할당은 이 재고를 쓰지 않습니다"
                                                      className="text-rose-600 font-bold text-xs">
                                                    대상 아님 <TriangleAlert size={11} className="inline -mt-0.5" />
                                                </span>
                                            )
                                            : <span title={c.tierCond} className="text-slate-500 text-xs">{c.tierSeq}계층</span>}
                                    </Td>
                                    <Td className="text-slate-500">{c.lotNo}</Td>
                                    <Td className="text-slate-500">{fmtDe(c.mfgDt)}</Td>
                                    <Td className="text-slate-500">{fmtDe(c.expiryDt)}</Td>
                                    <Td right className="tabular-nums text-slate-600">{num(c.avalQty)}</Td>
                                    <Td right>
                                        {c.lifeRate == null
                                            ? <span className="text-slate-300">미관리</span>
                                            : (
                                                <span title={c.lifeRjctRsn ?? undefined}
                                                      className={`tabular-nums font-bold ${c.lifePass ? 'text-slate-600' : 'text-rose-600'}`}>
                                                    {c.lifeRate}%
                                                    {!c.lifePass && <TriangleAlert size={11} className="inline ml-1 -mt-0.5" />}
                                                </span>
                                            )}
                                    </Td>
                                    <Td right>
                                        <input
                                            type="number" min="0" max={c.avalQty}
                                            value={qtyById[c.invId] ?? ''}
                                            onChange={(e) => setQty(c.invId, e.target.value, c.avalQty)}
                                            placeholder="0"
                                            className="w-24 input-base text-right tabular-nums"
                                        />
                                    </Td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* 안내 + 저장 */}
                <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-3">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                        잔여수명이 기준에 못 미치는 Lot도 고를 수 있습니다 (붉은 행) — 수동할당은 예외 처리를 위한 경로입니다.
                        기준은 자동할당과 같습니다(전략의 고정 기준값 또는 점포 기준) — 비율에 마우스를 올리면 적용된 기준이 보입니다.
                        <br />계층은 자동할당이 이 재고를 몇 번째로 쓰는지입니다 — 「대상 아님」은 자동할당이 쓰지 않는 재고이고, 여기서는 고를 수 있습니다.
                        <br />유통기한이 지난 Lot은 후보에 나오지 않습니다.
                    </p>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button onClick={onClose} className="btn-ghost">취소</button>
                        <button onClick={save} disabled={saving || entered.length === 0 || overRemain}
                                className="btn-primary disabled:bg-slate-200 disabled:text-slate-400">
                            {saving ? '할당 중…' : '할당'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const Fig = ({ label, value, accent }) => (
    <div className="flex items-center gap-1.5">
        <span className="text-slate-400">{label}</span>
        <span className={`text-sm font-bold tabular-nums ${accent ? 'text-amber-600' : 'text-slate-700'}`}>{num(value)}</span>
    </div>
);

const Th = ({ children, right }) => (
    <th className={`py-2 px-2 font-bold ${right ? 'text-right' : 'text-left'}`}>{children}</th>
);

const Td = ({ children, right, className = '' }) => (
    <td className={`py-1.5 px-2 ${right ? 'text-right' : ''} ${className}`}>{children}</td>
);
