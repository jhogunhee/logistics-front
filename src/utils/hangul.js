// 한글 초성 검색 유틸.
// 사이드바 화면 검색이 쓴다 — 'ㄷㅇ'로 '단위 관리'를 찾는 식.

const CHO = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
    'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

const SYL_BASE = 0xac00;  // '가'
const SYL_LAST = 0xd7a3;  // '힣'
const CHO_SPAN = 588;     // 초성 하나가 차지하는 음절 수 (중성 21 × 종성 28)

/**
 * 완성형 음절을 초성으로 바꾼다. 음절이 아닌 문자(영문·숫자·기호·낱자 자모)는 그대로 둔다.
 * '단위 관리 uom' → 'ㄷㅇ ㄱㄹ uom'
 */
export const chosungOf = (s) =>
    [...s].map(ch => {
        const c = ch.codePointAt(0);
        return c >= SYL_BASE && c <= SYL_LAST ? CHO[Math.floor((c - SYL_BASE) / CHO_SPAN)] : ch;
    }).join('');

/** 검색어가 초성 낱자로만 이뤄졌는가 ('ㄷㅇ' → true, '단위' · 'uom' → false) */
const isChosungOnly = (s) => /^[ㄱ-ㅎ]+$/.test(s);

/**
 * 검색어가 대상 문자열에 걸리는지. 두 방식을 차례로 본다 —
 *   1) 부분일치 (대소문자 · 공백 무시)
 *   2) 검색어가 초성 낱자뿐이면 대상의 초성열과 부분일치
 *
 * 초성 판정을 검색어에만 거는 이유는 오탐 때문이다. 대상까지 무조건 초성으로 바꿔 비교하면
 * '단위'로 검색했을 때 '단'과 'ㄷ'이 섞여 엉뚱한 화면이 걸린다.
 */
export const matchesSearch = (haystack, query) => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '');
    if (!q) return true;

    const h = haystack.toLowerCase().replace(/\s+/g, '');
    if (h.includes(q)) return true;

    return isChosungOnly(q) && chosungOf(h).includes(q);
};
