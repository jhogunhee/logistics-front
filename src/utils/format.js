/**
 * 화면 표시용 포맷터. 20개 파일에 formatDate · formatDateTime · fmt · fmtDt · num 이라는
 * 다섯 이름으로 흩어져 있던 것을 모았다 — 같은 이름이 파일마다 자릿수가 달랐던 곳도 있었다
 * (NbrRuleMaster의 formatDateTime은 초까지, 나머지는 분까지).
 *
 * 서버가 내려주는 일시는 ISO 문자열("2026-07-16T14:03:21.123")이다. Date로 파싱하지 않고
 * 문자열을 자르는 이유는 타임존 보정이 끼어들지 않게 하려는 것이다 — 서버·화면 모두 KST이고
 * 값에 오프셋이 없어서, new Date()로 돌리면 브라우저 타임존에 따라 날짜가 하루 밀 수 있다.
 */

/** 일자 (DE) — "2026-07-16" */
export const fmtDe = (v) => (v ? String(v).slice(0, 10) : '');

/** 일시 (DT) — "2026-07-16 14:03" */
export const fmtDt = (v) => (v ? String(v).replace('T', ' ').slice(0, 16) : '');

/** 일시 + 초 — "2026-07-16 14:03:21". 채번 카운터처럼 같은 분에 여러 건이 쌓이는 곳에서만 쓴다 */
export const fmtDtSec = (v) => (v ? String(v).replace('T', ' ').slice(0, 19) : '');

/**
 * 수량 — 천 단위 구분. null/undefined는 빈 칸 (0과 구분해야 한다).
 * 빈 문자열도 빈 칸이다 — 편집 중 비운 셀은 Number('')가 0이라 지우자마자 "0"이 찍힌다.
 */
export const num = (v) => (v == null || String(v).trim() === '' ? '' : Number(v).toLocaleString());

/**
 * 낱개(EA)로 저장된 수량을 「입고단위 (낱개)」로 표시 — "2 BOX (48)".
 *
 * 괄호에 낱개를 같이 적는 이유: 입고예정 목록의 헤더 합계는 EA로 낸다(상품마다 입고단위가
 * 달라 붙일 단위가 낱개뿐이다). 라인이 "2 BOX"만 보이면 헤더의 48과 안 맞아 보이는데,
 * 괄호가 그 대조를 그 자리에서 끝낸다.
 *
 * 규칙 셋:
 *   - 0과 빈 값은 빈 칸이다. "0 BOX (0)"은 아직 시작 안 한 라인마다 찍혀 시야만 어지럽힌다.
 *   - 입고단위가 낱개인 상품(eaPerUnit === 1)은 같은 숫자가 두 번 나오므로 괄호를 생략한다.
 *   - 입고단위로 딱 안 떨어지면 낱개로만 적는다 — "42.5 BOX"는 업무상 없는 수량이다.
 *     검수·적치를 입고단위 배수로만 받도록 정리하는 중이라 원칙적으로 안 나오는 값이고,
 *     그래서 소수로 뭉개는 대신 단위를 낱개로 떨어뜨려 "박스로 안 맞는 건"임을 드러낸다.
 *
 * @param eaQty     낱개 저장값
 * @param eaPerUnit 입고단위 1개의 낱개 수 (api/prodApi의 eaQtyPerInbUomOf)
 * @param uomCd     입고단위 코드 ("BOX" 등)
 */
export const fmtInbQty = (eaQty, eaPerUnit, uomCd) => {
    if (eaQty == null || Number(eaQty) === 0) return '';
    if (!eaPerUnit || eaPerUnit <= 1) return `${num(eaQty)} ${uomCd || 'EA'}`;
    if (eaQty % eaPerUnit !== 0) return `${num(eaQty)} EA`;
    return `${num(eaQty / eaPerUnit)} ${uomCd} (${num(eaQty)})`;
};

/**
 * 로컬 기준 "YYYY-MM-DD". `toISOString().slice(0, 10)`을 쓰지 않는 이유는 그게 UTC로
 * 변환하기 때문이다 — KST 오전 9시 이전에는 하루 전 날짜가 나온다. 6개 화면이 전부
 * 그 형태였고, 기간 검색의 기본값이 매일 아침 9시간 동안 하루씩 밀고 있었다.
 */
const ymd = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 오늘 (input[type=date] 기본값용) — "2026-07-16" */
export const todayStr = () => ymd(new Date());

/** n일 뒤 (기간 검색의 기본 종료일 등). 음수면 n일 전 */
export const daysAheadStr = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return ymd(d);
};
