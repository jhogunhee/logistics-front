/**
 * 화면 상단 요약 지표 한 칸. 현재고 조회와 로케이션 점유 맵이 같은 것을 각자 들고 있던 것을 모았다
 * (두 화면을 나누면서 영영 갈라질 자리였다 — `Badge`를 모은 것과 같은 이유다).
 *
 * `sub`는 값 옆에 붙는 작은 부연이다 — 「Σ보유 ÷ Σ상한」처럼 그 숫자가 무엇의 비율인지
 * 헤더 라벨만으로는 알 수 없을 때 쓴다. `accent`는 값 색 클래스(미지정이면 기본 먹색).
 *
 * `onClick`을 주면 버튼이 된다 — 지표가 「그래서 어디?」로 이어지는 화면(로케이션 점유 맵)에서
 * 숫자를 누르면 그 자리만 강조하는 식이다. `active`는 그 지표가 지금 걸려 있다는 표시.
 * 주지 않으면 예전처럼 그냥 칸이라 기존 사용처는 그대로다.
 */
export const StatTile = ({ label, value, sub, accent, onClick, active }) => {
    const body = (
        <>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
            <span className={`text-xl font-bold tabular-nums ${accent ?? 'text-slate-800'}`}>
                {value}
                {sub && <span className="ml-1.5 text-[11px] font-medium text-slate-300 normal-case tracking-normal">{sub}</span>}
            </span>
        </>
    );
    const base = 'flex-1 bg-white border rounded-xl px-4 py-3 flex flex-col gap-0.5';

    if (!onClick) {
        return <div className={`${base} border-slate-200`}>{body}</div>;
    }
    return (
        <button onClick={onClick}
                className={`${base} text-left transition-colors hover:border-indigo-300
                    ${active ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
            {body}
        </button>
    );
};
