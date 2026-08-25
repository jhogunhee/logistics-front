import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, MapPin, ScanBarcode, Search } from 'lucide-react';
import toast from 'react-hot-toast';

import { invApi } from '@/api/invApi';
import { fmtDe, num } from '@/utils/format';
import { failFeedback, okFeedback } from '@/utils/scanFeedback';
import { ProdThumb } from '@/components/common/ProdThumb';
import { ScanRow } from '@/components/mobile/ScanRow';

/** 수량 4칸 (보유/예약/보류/가용) */
const QtyBox = ({ label, value, tone = '' }) => (
    <div className="rounded-lg bg-slate-50 py-1">
        <p className="text-[11px] text-slate-400">{label}</p>
        <p className={`font-bold tabular-nums text-sm ${tone || 'text-slate-300'}`}>{num(value) || '0'}</p>
    </div>
);

/**
 * 현재고 조회 (PDA — /m). 조회 전용 — 로케이션을 스캔하면 그 자리의 재고가, 상품을 스캔하면
 * 그 상품이 있는 자리들이 나온다(상용 RF의 bin/item inquiry). 아무것도 바꾸지 않으므로
 * 확인 단계가 없고, 스캔 하나가 곧 질문이다.
 */
export default function MobileStockInquiry() {
    const [scanVal, setScanVal] = useState('');
    // 마지막 조회 결과 — { kind: 'LOC'|'PROD', key, rows }. null이면 아직 스캔 전
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const scanRef = useRef(null);

    useEffect(() => {
        scanRef.current?.focus();
    }, []);

    // ── 스캔 → 조회 ───────────────────────────────────────────
    // 스캔값이 로케이션인지 상품인지 미리 알 수 없다 — 로케이션으로 먼저 찾고, 없으면 상품으로 찾는다
    const handleScan = async () => {
        const v = scanVal.trim().toUpperCase();
        if (!v || busy) return;
        setScanVal('');
        setBusy(true);
        try {
            const byLoc = (await invApi.list({ locCd: v })).filter(r => String(r.locCd).toUpperCase() === v);
            if (byLoc.length > 0) {
                okFeedback();
                setResult({ kind: 'LOC', key: v, rows: byLoc });
                return;
            }
            const byProd = (await invApi.list({ prodCd: v })).filter(r => String(r.prodCd).toUpperCase() === v);
            if (byProd.length > 0) {
                okFeedback();
                setResult({ kind: 'PROD', key: v, rows: byProd });
                return;
            }
            failFeedback();
            toast.error(`재고가 없거나 모르는 코드입니다: ${v}`);
        } catch { /* 조회 실패 토스트는 인터셉터가 띄운다 */ } finally {
            setBusy(false);
            scanRef.current?.focus();
        }
    };

    const totalOnHand = result?.rows.reduce((s, r) => s + r.onHandQty, 0) ?? 0;

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex items-center gap-1 shrink-0">
                <Link to="/m" aria-label="작업 선택으로"
                      className="p-1.5 -ml-1.5 rounded-lg text-slate-500 active:bg-slate-200">
                    <ChevronLeft size={20} />
                </Link>
                <Search size={16} className="text-indigo-600" />
                <span className="font-bold text-slate-800 text-sm">현재고 조회</span>
                {result && (
                    <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
                        {result.rows.length}건 · 보유 {num(totalOnHand)}개
                    </span>
                )}
            </div>

            {/* 스캔 입력 — 로케이션이든 상품이든 찍으면 알아서 갈린다 */}
            <ScanRow ref={scanRef} value={scanVal} onChange={setScanVal} onCommit={handleScan}
                     placeholder="로케이션 또는 상품 바코드 스캔" />

            {/* 결과 */}
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                {!result ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
                        <ScanBarcode size={48} className="text-slate-300" />
                        <p className="text-sm text-slate-400">
                            로케이션을 찍으면 그 자리의 재고가,
                            <br />상품을 찍으면 그 상품이 있는 자리들이 나옵니다
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2.5 shrink-0">
                            <MapPin size={16} className="text-indigo-600 shrink-0" />
                            <span className="font-black text-lg text-slate-800 truncate">{result.key}</span>
                            <span className="ml-auto text-xs text-slate-500 shrink-0">
                                {result.kind === 'LOC' ? '이 자리의 재고' : '이 상품이 있는 자리'}
                            </span>
                        </div>
                        {result.rows.map(r => (
                            <div key={r.invId}
                                 className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2 shrink-0">
                                <div className="flex items-center gap-3">
                                    <ProdThumb src={r.prodImgUrl} alt={r.prodNm} tmpZon={r.tmpZon} size={40} />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-800 truncate">
                                            {result.kind === 'LOC' ? r.prodNm : r.locCd}
                                        </p>
                                        <p className="text-xs text-slate-500 truncate">
                                            {result.kind === 'LOC' ? r.prodCd : `${r.prodNm} · ${r.zonCd}`}
                                        </p>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500">
                                    Lot {r.lotNo}
                                    {r.expiryDt && <> · 유통기한 {fmtDe(r.expiryDt)}</>}
                                </p>
                                <div className="grid grid-cols-4 gap-1.5 text-center">
                                    <QtyBox label="보유" value={r.onHandQty} tone="text-slate-700" />
                                    <QtyBox label="예약" value={r.alocQty} tone={r.alocQty > 0 ? 'text-amber-600' : ''} />
                                    <QtyBox label="보류" value={r.hldQty} tone={r.hldQty > 0 ? 'text-rose-600' : ''} />
                                    <QtyBox label="가용" value={r.avalQty} tone="text-emerald-600" />
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}
