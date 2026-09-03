/**
 * 대시보드 카드가 URL로 실어 보낸 조회 기간 — `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
 *
 * 대시보드는 <b>달 단위</b>로 세는데 착지 화면의 기본 조회는 <b>오늘</b>이라, 「확정 대기 1건」을
 * 누르고 간 화면이 「조회된 데이터가 없습니다」를 보여주는 단절이 있었다 — 카드의 약속과 화면이
 * 어긋난다. 카드가 센 기간을 링크에 실어 보내고, 화면이 첫 조회 기본값으로 받는다.
 *
 * 파라미터가 없으면 null — 사이드바로 들어온 평소 동선은 화면의 기본값 그대로다.
 * 화면 쪽 사용: `useState(() => { const l = urlDateRange(); return { …, dateFrom: l?.from ?? todayStr(), … }; })`
 */
export const urlDateRange = () => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    const to = params.get('to');
    const ok = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '');
    return ok(from) && ok(to) ? { from, to } : null;
};
