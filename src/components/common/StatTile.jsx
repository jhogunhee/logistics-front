/**
 * 화면 상단 요약 지표 한 칸. 현재고 조회와 로케이션 점유 맵이 같은 것을 각자 들고 있던 것을 모았다
 * (두 화면을 나누면서 영영 갈라질 자리였다 — `Badge`를 모은 것과 같은 이유다).
 *
 * `sub`는 값 옆에 붙는 작은 부연이다 — 「Σ보유 ÷ Σ상한」처럼 그 숫자가 무엇의 비율인지
 * 헤더 라벨만으로는 알 수 없을 때 쓴다. `accent`는 값 색 클래스(미지정이면 기본 먹색).
 */
export const StatTile = ({ label, value, sub, accent }) => (
    <div className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-col gap-0.5">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <span className={`text-xl font-bold tabular-nums ${accent ?? 'text-slate-800'}`}>
            {value}
            {sub && <span className="ml-1.5 text-[11px] font-medium text-slate-300 normal-case tracking-normal">{sub}</span>}
        </span>
    </div>
);
