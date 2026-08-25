/**
 * PDA 수량 요약 칸 (지시/완료/잔여 · 주문/할당/피킹/결품 등). 값이 비면 '0'으로 그린다 —
 * 현장 화면에서 빈 칸은 「아직 안 읽힘」으로 오독된다.
 */
export const StatBox = ({ label, value, tone = '', big = false }) => (
    <div className="rounded-lg bg-slate-50 py-1.5 text-center">
        <p className="text-[11px] text-slate-400">{label}</p>
        <p className={`font-bold tabular-nums ${big ? 'text-xl' : 'text-base'} ${tone || 'text-slate-700'}`}>
            {value || '0'}
        </p>
    </div>
);
