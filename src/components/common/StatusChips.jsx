import { num } from '@/utils/format';

/**
 * 조회 결과의 상태 분포 칩 — 목록 화면 머리의 「18건」 자리에
 * 「전체 18 · 확정 16 · 미확정 2」로 깔린다.
 *
 * 상태가 여럿으로 갈리는 목록에서 「미확정이 몇 개지?」가 관리자의 첫 질문인데,
 * 답이 그리드를 한 줄씩 훑어야 나왔다. 칩은 <b>이미 조회한 결과</b>를 세는 것이라
 * 화면 소관이다 — 조회 범위 밖을 따로 세는 전역 알림(대시보드 소관)과 다르다.
 *
 * 칩을 누르면 그 상태만 남는다 — 서버 재조회가 아니라 받은 결과를 화면에서 거르는
 * 것이라 즉시다. 다시 누르거나 [전체]를 누르면 풀린다. 0건 상태도 흐리게 남겨 둔다 —
 * 단계 어휘가 자리를 지켜야 「지금 이 단계엔 없다」로 읽힌다(있다 없다 하면 못 배운다).
 *
 * @param rows     조회 결과 행들
 * @param statusOf (row) => 상태 키
 * @param meta     상태 메타 ({ [key]: { label, badge } } — badgeMeta.js의 것 그대로)
 * @param value    지금 걸린 상태 키. null = 전체
 * @param onChange (key | null) => void
 */
export default function StatusChips({ rows, statusOf, meta, value, onChange }) {
    const counts = {};
    for (const r of rows) {
        const k = statusOf(r);
        counts[k] = (counts[k] ?? 0) + 1;
    }
    const chip = 'px-2 py-1 rounded-lg text-xs font-medium transition-all';
    return (
        <div className="flex items-center gap-1 flex-wrap">
            <button type="button" onClick={() => onChange(null)}
                    className={`${chip} ${value == null
                        ? 'bg-slate-700 text-white'
                        : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                전체 <b className="tabular-nums">{num(rows.length)}</b>
            </button>
            {Object.entries(meta).map(([key, m]) => {
                const n = counts[key] ?? 0;
                if (n === 0) {
                    return (
                        <span key={key} className={`${chip} text-slate-300`} title="이 상태의 행이 없습니다">
                            {m.label} 0
                        </span>
                    );
                }
                const active = value === key;
                return (
                    <button key={key} type="button"
                            onClick={() => onChange(active ? null : key)}
                            title={active ? '필터 해제' : `${m.label}만 보기`}
                            className={`${chip} ${m.badge}
                                ${active ? 'ring-2 ring-slate-400'
                                    : value != null ? 'opacity-40 hover:opacity-100' : 'hover:ring-2 hover:ring-slate-200'}`}>
                        {m.label} <b className="tabular-nums">{num(n)}</b>
                    </button>
                );
            })}
        </div>
    );
}
