import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ClipboardCheck, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

import { ibOrderApi } from '@/api/ibOrderApi';
import { ASN_STATUS_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { eaQtyPerInbUomOf, fmtDe, fmtInbQty, num, todayStr, ymd } from '@/utils/format';
import { failFeedback, okFeedback } from '@/utils/scanFeedback';
import { Badge } from '@/components/common/Badge';
import { ProdThumb } from '@/components/common/ProdThumb';
import { QtyStepper } from '@/components/mobile/QtyStepper';
import { ScanRow } from '@/components/mobile/ScanRow';

/** 진행 위치 복원용 sessionStorage 키 — 새로고침해도 검수하던 입고건으로 돌아온다 */
const ASN_KEY = 'mrecv.ibOrderId';

/** 유통기한 미리보기 = 제조일자 + 유통기한일수 — 서버 계산(LotIssuer)과 같은 식 (웹 검수 화면과 동일) */
const expiryPreview = (mfgDt, shelfLifeDays) => {
    if (!mfgDt || shelfLifeDays == null) return null;
    const [y, m, d] = mfgDt.split('-').map(Number);
    return ymd(new Date(y, m - 1, d + shelfLifeDays));
};

/** 라인의 검수 잔량 (EA) */
const remainEaOf = (l) => l.expctQty - l.rcvdQty;

/**
 * 입고검수 (PDA — /m). 출고확정처럼 <b>스캔 주도</b>다 — 하차한 실물의 상품 바코드를 스캔하면
 * 그 라인이 뜨고, 입고단위 수량(관리 상품은 제조일자까지)을 넣어 저장한다. Lot 채번·유통기한
 * 계산·검수정책 판정은 전부 서버 몫이라 이 화면은 「무엇이 몇 개 왔나」만 입력한다.
 *
 * 입고일자는 오늘 고정이다 — 소급 검수, 검수 취소, 정책 시뮬레이션, 입고확정(마감)은 웹 검수·확정
 * 화면의 몫이다.
 */
export default function MobileReceiving() {
    const [asns, setAsns] = useState([]);
    const [asn, setAsn] = useState(null);            // 선택 입고건 (없으면 목록 화면)
    const [lines, setLines] = useState([]);
    const [scanVal, setScanVal] = useState('');
    // 검수 시트 — { line, qty(입고단위), mfgDt }를 한 상태로 들고 있다가 저장 시점에 검증한다
    const [sheet, setSheet] = useState(null);
    const [busy, setBusy] = useState(false);
    const scanRef = useRef(null);

    const openLines = useMemo(() => lines.filter(l => remainEaOf(l) > 0), [lines]);
    const doneCount = lines.length - openLines.length;

    const fetchAsns = () => ibOrderApi.listForInsp()
        .then(list => setAsns(list.filter(a => a.status !== 'CONFIRMED')));

    const openAsn = async (head) => {
        const list = await ibOrderApi.lines(head.ibOrderId).catch(() => null);
        if (!list) return;
        sessionStorage.setItem(ASN_KEY, String(head.ibOrderId));
        setAsn(head);
        setLines(list);
        setScanVal('');
        setSheet(null);
    };

    const backToList = () => {
        sessionStorage.removeItem(ASN_KEY);
        setAsn(null);
        setLines([]);
        setSheet(null);
        fetchAsns().catch(() => {});
    };

    // 최초 조회 + 진행 위치 복원
    useEffect(() => {
        (async () => {
            const list = await ibOrderApi.listForInsp().catch(() => null);
            if (!list) return;
            const open = list.filter(a => a.status !== 'CONFIRMED');
            setAsns(open);
            const saved = Number(sessionStorage.getItem(ASN_KEY));
            const head = open.find(x => x.ibOrderId === saved);
            if (head) await openAsn(head);
        })();
    }, []);

    // 시트가 닫히면 스캔 입력으로 포커스 복귀 — 연속 검수가 스캔만으로 이어지게 한다
    useEffect(() => {
        if (asn && !sheet) scanRef.current?.focus();
    }, [asn, sheet]);

    // ── 스캔 → 라인 선택 ──────────────────────────────────────
    const openSheet = (line) => {
        const ea = eaQtyPerInbUomOf(line);
        setSheet({
            line,
            // 기본값 = 잔량이 담기는 최대 입고단위 수 — 배수로 안 떨어지는 끝수는 웹 검수가 처리한다
            qty: String(Math.max(1, Math.floor(remainEaOf(line) / ea))),
            mfgDt: '',
        });
    };

    const handleScan = () => {
        const v = scanVal.trim().toUpperCase();
        if (!v) return;
        const hit = lines.find(l => String(l.prodCd).toUpperCase() === v);
        setScanVal('');
        if (!hit) {
            failFeedback();
            toast.error(`이 입고건에 없는 상품입니다: ${v}`);
            return;
        }
        if (remainEaOf(hit) <= 0) {
            failFeedback();
            toast.error(`이미 전량 검수된 라인입니다: ${hit.prodCd} ${hit.prodNm}`);
            return;
        }
        okFeedback();
        openSheet(hit);
    };

    // ── 검수 저장 ─────────────────────────────────────────────
    const handleSaveClick = () => {
        const { line, qty, mfgDt } = sheet;
        const n = Number(qty);
        const ea = eaQtyPerInbUomOf(line);
        if (!(n >= 1) || !Number.isInteger(n)) {
            toast.error(`검수수량은 입고단위(${line.inbUomCd}) 1 이상 정수여야 합니다.`);
            return;
        }
        if (n * ea > remainEaOf(line)) {
            toast.error(`검수수량이 잔량(${fmtInbQty(remainEaOf(line), ea, line.inbUomCd)})을 초과합니다.`);
            return;
        }
        if (line.shelfLifeDays != null && !mfgDt) {
            toast.error('제조일자를 입력하세요 — 유통기한 관리 상품입니다.');
            return;
        }
        if (line.shelfLifeDays != null && mfgDt > todayStr()) {
            toast.error('제조일자가 오늘(입고일자)보다 미래일 수 없습니다.');
            return;
        }
        doSave(sheet, n);
    };

    const doSave = async ({ line, mfgDt }, n) => {
        if (busy) return; // 연타로 같은 검수가 두 번 저장되는 것을 막는다
        setBusy(true);
        try {
            await ibOrderApi.receive(asn.ibOrderId, {
                lines: [{
                    ibLineId: line.ibLineId,
                    inspectQty: n,
                    receiptDt: todayStr(),
                    mfgDt: line.shelfLifeDays != null ? mfgDt : null,
                }],
            });
            okFeedback();
            toast.success(`${line.prodNm} — ${num(n)} ${line.inbUomCd} (${num(n * eaQtyPerInbUomOf(line))}개) 검수`);
            setSheet(null);
            // 재조회 실패는 인터셉터가 알린다 — 여기서 삼키지 않으면 성공한 검수가 실패 토스트로 둔갑한다
            await ibOrderApi.lines(asn.ibOrderId).then(setLines).catch(() => {});
        } catch (e) {
            // 검수정책 위반이면 서버가 규칙·메시지를 준다 — 첫 위반을 그대로 보여준다
            const v = e.response?.data?.violations;
            toast.error(v?.length ? `${v[0].ruleName}: ${v[0].message}` : (e.message || '검수 저장에 실패했습니다.'));
        } finally {
            setBusy(false);
        }
    };

    // ── 입고건 목록 ───────────────────────────────────────────
    if (!asn) {
        return (
            <div className="flex flex-col gap-3 h-full">
                <div className="flex items-center gap-2">
                    <ClipboardCheck size={18} className="text-indigo-600" />
                    <h2 className="text-lg font-bold text-slate-800">입고검수</h2>
                    <span className="text-xs text-slate-400 mt-0.5">검수 대상 입고건</span>
                    <button onClick={() => fetchAsns().catch(() => {})} className="btn-ghost ml-auto">
                        <RefreshCw size={13} /> 새로고침
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                    {asns.length === 0 && (
                        <p className="text-sm text-slate-400 text-center mt-12">검수할 입고건이 없습니다</p>
                    )}
                    {asns.map(a => <AsnCard key={a.ibOrderId} asn={a} onOpen={() => openAsn(a)} />)}
                </div>
            </div>
        );
    }

    // ── 검수 화면 — 스캔 입력 + 미검수 라인 목록 ───────────────
    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex items-center gap-1 shrink-0">
                <button onClick={backToList} aria-label="입고건 목록으로"
                        className="p-1.5 -ml-1.5 rounded-lg text-slate-500 active:bg-slate-200">
                    <ChevronLeft size={20} />
                </button>
                <span className="font-bold text-slate-800 text-sm truncate">{asn.ibNo}</span>
                <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
                    완료 라인 {doneCount} / {lines.length}
                </span>
            </div>

            {/* 스캔 입력 — 하차한 실물의 상품 바코드를 찍는다 */}
            <ScanRow ref={scanRef} value={scanVal} onChange={setScanVal} onCommit={handleScan}
                     placeholder="상품 바코드 스캔" />

            {/* 미검수 라인 — 스캐너 없이도 카드를 눌러 검수할 수 있다 */}
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                {openLines.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
                        <CheckCircle2 size={48} className="text-emerald-500" />
                        <p className="text-sm font-bold text-slate-700">이 입고건의 검수가 모두 끝났습니다</p>
                        <p className="text-xs text-slate-500">적치지시 발행과 입고확정은 데스크톱 화면에서 합니다</p>
                        <div className="flex gap-2 mt-2">
                            <button onClick={() => openAsn(asn)} className="btn-ghost py-2.5">
                                <RefreshCw size={13} /> 다시 조회
                            </button>
                            <button onClick={backToList} className="btn-primary py-2.5">입고건 목록</button>
                        </div>
                    </div>
                ) : openLines.map(l => (
                    <button key={l.ibLineId} onClick={() => openSheet(l)}
                            className="flex items-center gap-3 text-left bg-white border border-slate-200 rounded-xl p-3
                                       active:bg-indigo-50 transition-colors shrink-0">
                        <ProdThumb src={l.prodImgUrl} alt={l.prodNm} tmpZon={l.tmpZon} size={44} />
                        <span className="flex-1 min-w-0">
                            <span className="block font-bold text-slate-800 truncate">{l.prodNm}</span>
                            <span className="block text-xs text-slate-500">{l.prodCd}</span>
                        </span>
                        <span className="text-right shrink-0">
                            <span className="block text-[11px] text-slate-400">잔량</span>
                            <span className="block text-sm font-bold text-amber-600 tabular-nums">
                                {fmtInbQty(remainEaOf(l), eaQtyPerInbUomOf(l), l.inbUomCd)}
                            </span>
                        </span>
                    </button>
                ))}
            </div>

            {/* 검수 시트 — 수량(입고단위) + 관리 상품은 제조일자 */}
            {sheet && (
                <ReceiveSheet
                    sheet={sheet}
                    setSheet={setSheet}
                    busy={busy}
                    onCancel={() => setSheet(null)}
                    onConfirm={handleSaveClick}
                />
            )}
        </div>
    );
}

/** 입고건 목록 카드 — 라인 진행도와 상태를 보여준다 */
function AsnCard({ asn, onOpen }) {
    const pct = asn.lineCount > 0 ? Math.round((asn.cmplLineCount / asn.lineCount) * 100) : 0;
    return (
        <button onClick={onOpen}
                className="text-left bg-white border border-slate-200 rounded-xl p-4 active:bg-indigo-50 transition-colors shrink-0">
            <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 truncate">{asn.ibNo}</span>
                <span className="ml-auto shrink-0">
                    <Badge meta={ASN_STATUS_META} value={asn.status} show="label" />
                </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                <span className="truncate">{asn.vndrNm}</span>
                <span className="shrink-0">완료 라인 {num(asn.cmplLineCount)} / {num(asn.lineCount)}</span>
                <span className="ml-auto shrink-0">{fmtDe(asn.expctDe)}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
            </div>
        </button>
    );
}

/** 검수 입력 바텀시트 — 수량은 입고단위로 받고 낱개 환산을 함께 보여준다 */
function ReceiveSheet({ sheet, setSheet, busy, onCancel, onConfirm }) {
    const { line, qty, mfgDt } = sheet;
    const ea = eaQtyPerInbUomOf(line);
    const maxUnits = Math.max(1, Math.floor(remainEaOf(line) / ea));
    const expiry = expiryPreview(mfgDt, line.shelfLifeDays);
    return (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end" onMouseDown={onCancel}>
            <div className="w-full bg-white rounded-t-2xl p-4 pb-6 flex flex-col gap-3"
                 onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                    <ProdThumb src={line.prodImgUrl} alt={line.prodNm} tmpZon={line.tmpZon} size={44} />
                    <div className="min-w-0">
                        <h3 className="text-base font-bold text-slate-800 truncate">{line.prodNm}</h3>
                        <p className="text-xs text-slate-500">{line.prodCd}</p>
                    </div>
                    <span className="ml-auto shrink-0">
                        <Badge meta={TEMP_ZONE_META} value={line.tmpZon} />
                    </span>
                </div>
                <p className="text-sm text-slate-500">
                    예정 {fmtInbQty(line.expctQty, ea, line.inbUomCd)} · 기검수 {fmtInbQty(line.rcvdQty, ea, line.inbUomCd) || '0'} ·{' '}
                    잔량 <b className="text-amber-600">{fmtInbQty(remainEaOf(line), ea, line.inbUomCd)}</b>
                </p>
                <QtyStepper
                    qty={qty} onChange={(v) => setSheet(s => ({ ...s, qty: v }))} onSubmit={onConfirm}
                    max={maxUnits} suffix={line.inbUomCd} autoFocus
                />
                {ea > 1 && Number(qty) > 0 && (
                    <p className="text-xs text-slate-500 text-right">= 낱개 {num(Number(qty) * ea)}개</p>
                )}
                {line.shelfLifeDays != null && (
                    <label className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-600 shrink-0">제조일자</span>
                        <input
                            type="date" value={mfgDt} max={todayStr()}
                            onChange={(e) => setSheet(s => ({ ...s, mfgDt: e.target.value }))}
                            className="input-base flex-1 py-2.5"
                        />
                        <span className="text-xs text-slate-400 shrink-0">
                            {expiry ? `유통기한 ${expiry}` : `${num(line.shelfLifeDays)}일`}
                        </span>
                    </label>
                )}
                <div className="flex gap-2">
                    <button onClick={onCancel} className="btn-modal-cancel flex-1">취소</button>
                    <button onClick={onConfirm} disabled={busy} className="btn-modal-primary flex-1 disabled:opacity-40">
                        검수 저장
                    </button>
                </div>
            </div>
        </div>
    );
}
