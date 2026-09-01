import { useEffect, useState } from 'react';
import { Loader2, PackageOpen, X } from 'lucide-react';

import { invApi } from '@/api/invApi';
import { fmtDe, num } from '@/utils/format';
import { ProdThumb } from '@/components/common/ProdThumb';

/**
 * 「이 칸에 지금 무엇이 쌓여 있나」 — 도면에서 칸을 누르면 옆에 뜨는 상세.
 *
 * 칸 안에 그리지 않고 패널로 뺀 이유는 한 로케이션에 상품·Lot이 여럿 있을 수 있어서다.
 * 칸에 썸네일 하나만 그리면 나머지가 숨고, 유통기한·예약수량처럼 자리를 고를 때 실제로 보는 값은
 * 칸 크기에 들어가지 않는다.
 *
 * 조회는 현재고 API를 로케이션으로 걸러 그대로 쓴다 — 같은 값을 두 벌로 만들지 않는다.
 *
 * @param loc      선택된 칸 (locMap 행). null이면 아무것도 그리지 않는다
 * @param prodCd   지금 놓으려는 상품 코드 — 같은 상품 행을 위로 올리고 표시한다
 * @param onClose  닫기
 * @param action   맨 아래 붙일 실행 버튼(선택). 재고이동 도면이 「이 자리로 보내기」를 여기 단다 —
 *                 칸을 눌러 내용을 확인한 그 자리에서 바로 정해야 확인과 결정이 갈라지지 않는다
 */
export default function LocStockPanel({ loc, prodCd, onClose, action }) {
    // 칸이 바뀌면 앞 칸의 목록을 그대로 두지 않으려고 응답에 칸 코드를 같이 담는다 —
    // 조회 시작에 비우면(setState) 렌더 연쇄가 되고, 그러지 않으면 남의 재고가 잠깐 보인다
    const [loaded, setLoaded] = useState(null);   // { locCd, rows }
    const rows = loaded && loaded.locCd === loc?.locCd ? loaded.rows : null;   // null = 조회 중

    useEffect(() => {
        const locCd = loc?.locCd;
        if (!locCd) return undefined;
        let alive = true;
        invApi.list({ locCd })
            .then(data => { if (alive) setLoaded({ locCd, rows: data }); })
            .catch(() => { if (alive) setLoaded({ locCd, rows: [] }); });
        return () => { alive = false; };
    }, [loc?.locCd]);

    if (!loc) return null;

    // 같은 상품이 먼저다 — 자리를 고를 때 제일 먼저 보는 것이 「여기 이미 이 상품이 있나」다.
    // 그 다음은 유통기한 순(FEFO와 같은 눈)
    const sorted = [...(rows ?? [])].sort((a, b) =>
        (a.prodCd === prodCd ? 0 : 1) - (b.prodCd === prodCd ? 0 : 1)
        || String(a.expiryDt ?? '9999').localeCompare(String(b.expiryDt ?? '9999')));
    const sameProd = sorted.some(r => r.prodCd === prodCd);

    return (
        <aside className="w-72 shrink-0 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 shrink-0">
                <span className="font-mono text-sm font-bold text-slate-700">{loc.locCd}</span>
                <span className="text-[11px] text-slate-400">{loc.zonCd}</span>
                <button onClick={onClose} aria-label="닫기"
                        className="ml-auto p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100">
                    <X size={14} />
                </button>
            </div>

            <div className="px-3 py-2 border-b border-slate-100 shrink-0 flex items-center gap-3 text-[11px]">
                <span className="text-slate-400">적재가능 <b className="text-emerald-600 tabular-nums">
                    {loc.availQty == null ? '∞' : num(loc.availQty)}</b></span>
                <span className="text-slate-400">보유 <b className="text-slate-600 tabular-nums">{num(loc.onHandQty ?? 0)}</b></span>
                {sameProd && (
                    <span className="ml-auto px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">
                        같은 상품 있음
                    </span>
                )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {rows === null && (
                    <p className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
                        <Loader2 size={13} className="animate-spin" /> 불러오는 중…
                    </p>
                )}
                {rows?.length === 0 && (
                    <p className="flex flex-col items-center gap-1.5 py-8 text-xs text-slate-400">
                        <PackageOpen size={20} className="text-slate-300" />
                        비어 있는 자리입니다
                    </p>
                )}
                {sorted.map(r => (
                    <div key={r.invId}
                         className={`px-3 py-2 border-b border-slate-50 flex gap-2 ${
                             r.prodCd === prodCd ? 'bg-emerald-50/60' : ''}`}>
                        <ProdThumb src={r.prodImgUrl} alt={r.prodNm} tmpZon={r.tmpZon} size={28} />
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-700 truncate" title={r.prodNm}>{r.prodNm}</p>
                            <p className="text-[10px] text-slate-400 font-mono truncate">
                                {r.prodCd} · {r.lotNo}
                            </p>
                            <p className="text-[10px] text-slate-400">
                                유통기한 {fmtDe(r.expiryDt) || '—'}
                            </p>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                            <p className="text-xs font-bold text-slate-700">{num(r.onHandQty)}</p>
                            {/* 예약·보류는 있을 때만 — 없는 줄을 늘 그리면 목록이 두 배로 길어진다 */}
                            {r.alocQty > 0 && <p className="text-[10px] text-indigo-500">예약 {num(r.alocQty)}</p>}
                            {r.hldQty > 0 && <p className="text-[10px] text-amber-600">보류 {num(r.hldQty)}</p>}
                        </div>
                    </div>
                ))}
            </div>

            {action && <div className="px-3 py-2 border-t border-slate-100 shrink-0">{action}</div>}
        </aside>
    );
}
