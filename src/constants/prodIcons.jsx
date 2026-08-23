/**
 * 상품 아이콘(이모지) 목록. `prod.img_url`에 `emoji:🥛`으로 저장하고 화면이 글자를 그대로 그린다.
 *
 * **화면에서 상품 이미지를 정하는 유일한 방법이다.** 파일 업로드도, 그림 파일을 연결하는
 * 경로도 두지 않는다 — 업로드는 스토리지와 인증이 필요하고, 파일 연결은 「파일을 미리 어딘가에
 * 넣어 둔다」는 화면 밖 단계를 전제해서 버튼이 할 수 없는 일을 약속하게 된다(새로 만든 상품에는
 * 그 파일이 있을 리 없다). 고르는 것으로 끝나는 방식만 남겼다.
 *
 * **아이콘 세트(Lucide·Tabler 등) 대신 이모지를 쓰는 이유** —
 * ① 라이선스가 없다. 무료 아이콘 사이트는 대개 출처 표기 의무가 붙고 이 프로젝트는 공개 배포 중이다.
 * ② 설치도 번들 비용도 0이다. 글자라서 import가 없다.
 * ③ 이름을 검증할 필요가 없다. 아이콘 세트는 없는 이름을 써도 빌드가 통과하고 그리는 순간
 *    터진다(실제로 lucide의 IceCream2가 그랬다). 이모지는 문자 그대로라 그 실패가 없다.
 * ④ 컬러이고 품목이 갈린다. 단색 외곽선 아이콘으로는 우유·요거트·치즈가 한 그림으로 뭉개지는데
 *    🥛·🍓·🧀는 한눈에 다르다. 시더 상품의 손그림과 나란히 놓아도 갭이 작다.
 *
 * 대가는 **OS마다 글리프 모양이 조금 다르다**는 것이다(윈도우 Segoe UI Emoji / 맥 Apple Color
 * Emoji). 어디서 보든 컬러이고 뜻이 같아 데모에서는 문제가 되지 않는다고 보고 받아들였다.
 */
export const PROD_ICON_PREFIX = 'emoji:';

/**
 * 고를 수 있는 이모지 — 식품·음료 유통센터에 실제로 나올 만한 것만 추렸다.
 * 전체를 열면 고르는 게 아니라 헤매는 일이 되므로 목록은 여기서 관리한다.
 *
 * `kw`는 검색어와 상품명 추천에 쓰는 낱말이다. 라벨에 이미 들어 있는 말은 적지 않는다
 * (라벨도 함께 훑는다). **두 글자 미만은 넣지 않는다** — 「삼다수」의 '수'가 생수에 걸리는 식으로
 * 한 글자는 엉뚱한 상품을 잡는다.
 */
export const PROD_ICONS = [
    { group: '음료', items: [
        { ch: '💧', label: '생수', kw: ['물', '워터', 'water', '삼다수', '아이시스', '백산수'] },
        { ch: '🥤', label: '음료·탄산', kw: ['콜라', '사이다', '탄산', '소다', 'cola'] },
        { ch: '🧃', label: '주스', kw: ['주스', 'juice', '음료수'] },
        { ch: '☕', label: '커피', kw: ['coffee', '아메리카노', '라떼', '원두'] },
        { ch: '🍺', label: '주류(맥주)', kw: ['맥주', 'beer'] },
        { ch: '🍷', label: '주류(와인)', kw: ['와인', 'wine', '소주', '주류'] },
    ]},
    { group: '유제품', items: [
        { ch: '🥛', label: '우유', kw: ['milk', '멸균유', '저지방'] },
        { ch: '🍌', label: '바나나우유', kw: ['바나나', 'banana'] },
        { ch: '🍓', label: '요거트·딸기', kw: ['요구르트', 'yogurt', '요플레'] },
        { ch: '🧀', label: '치즈', kw: ['cheese', '모짜렐라', '체다', '슬라이스'] },
        { ch: '🧈', label: '버터', kw: ['butter', '마가린'] },
        { ch: '🍦', label: '아이스크림', kw: ['빙과', '아이스', '싸만코', '콘', 'ice'] },
    ]},
    { group: '가공·간편식', items: [
        { ch: '🍜', label: '라면', kw: ['면', '우동', '짜장', '컵라면', 'noodle', '신라면', '진라면'] },
        { ch: '🍚', label: '즉석밥', kw: ['밥', '햇반', '쌀밥', 'rice'] },
        { ch: '🍙', label: '김밥·삼각김밥', kw: ['주먹밥', '김밥'] },
        { ch: '🥪', label: '샌드위치', kw: ['버거', '토스트', 'sandwich'] },
        { ch: '🥟', label: '만두', kw: ['교자', '군만두', '물만두', 'dumpling'] },
        { ch: '🍕', label: '피자', kw: ['pizza'] },
        { ch: '🥓', label: '햄·베이컨', kw: ['스팸', '소시지', '가공육', 'ham', 'bacon'] },
        { ch: '🥫', label: '통조림', kw: ['참치캔', '캔', '깡통'] },
    ]},
    { group: '신선', items: [
        { ch: '🥗', label: '샐러드', kw: ['salad', '닭가슴살'] },
        { ch: '🥩', label: '육류', kw: ['소고기', '돼지', '삼겹', '한우', 'beef', 'pork'] },
        { ch: '🍗', label: '닭고기', kw: ['치킨', '닭', 'chicken'] },
        { ch: '🐟', label: '생선', kw: ['고등어', '연어', '수산', 'fish'] },
        { ch: '🍤', label: '새우·해산물', kw: ['새우', '오징어', '조개', 'shrimp'] },
        { ch: '🥚', label: '계란', kw: ['달걀', 'egg'] },
        { ch: '🫘', label: '두부·콩', kw: ['두부', '콩', 'tofu'] },
        { ch: '🥕', label: '채소', kw: ['야채', '당근', '양파', '채소'] },
        { ch: '🍎', label: '과일', kw: ['사과', '배', '과일'] },
        { ch: '🫐', label: '베리류', kw: ['블루베리', '베리', '포도'] },
    ]},
    { group: '곡물·베이커리', items: [
        { ch: '🌾', label: '쌀·곡물·밀가루', kw: ['백설', '곡물', '잡곡', 'flour'] },
        { ch: '🥖', label: '빵', kw: ['식빵', '베이커리', 'bread'] },
        { ch: '🍰', label: '케이크·디저트', kw: ['케익', 'cake', '디저트'] },
        { ch: '🍪', label: '과자·비스킷', kw: ['쿠키', '비스켓', 'cookie'] },
        { ch: '🍿', label: '스낵', kw: ['팝콘', '칩', 'snack'] },
        { ch: '🍭', label: '사탕·캔디', kw: ['젤리', '캔디', 'candy'] },
    ]},
    { group: '비식품', items: [
        { ch: '🍽️', label: '일회용품·식기', kw: ['종이컵', '일회용', '접시', '수저', '포크', '나이프', '식기', '빨대'] },
        { ch: '🧻', label: '위생용품', kw: ['물티슈', '휴지', '티슈', '기저귀'] },
        { ch: '🧼', label: '세제', kw: ['세탁', '비누', '주방세제', '샴푸'] },
        { ch: '🍼', label: '유아용품', kw: ['분유', '젖병', '유아'] },
        { ch: '📦', label: '기타(포장)', kw: ['잡화', '기타'] },
    ]},
];

/** 검색·추천이 훑는 평평한 목록 */
const ALL_ITEMS = PROD_ICONS.flatMap(g => g.items.map(i => ({ ...i, group: g.group })));

/** 한 항목이 가진 검색 낱말 전부 (라벨을 ·와 괄호로 쪼갠 것 + kw) */
const wordsOf = (item) => [
    ...item.label.split(/[·()]/).map(s => s.trim()).filter(Boolean),
    ...(item.kw ?? []),
];

/** 검색 — 라벨·낱말·이모지 어디든 걸리면 통과. 빈 검색어면 null(=전체 그룹을 그대로 보여준다) */
export const searchIcons = (query) => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ALL_ITEMS.filter(i =>
        i.ch === q
        || i.label.toLowerCase().includes(q)
        || wordsOf(i).some(w => w.toLowerCase().includes(q)));
};

/**
 * 상품명에서 추천 — 상품명이 낱말을 품고 있으면 후보다. 「서울우유 1L」→ 🥛, 「슬라이스 치즈」→ 🧀.
 * 긴 낱말이 걸린 쪽을 먼저 보여준다(「바나나우유」가 「우유」보다 구체적이다).
 * 한 글자 낱말은 애초에 목록에 없어 오탐이 잘 나지 않는다.
 */
export const recommendIcons = (prodNm, limit = 5) => {
    const name = (prodNm ?? '').toLowerCase();
    if (name.length < 2) return [];
    return ALL_ITEMS
        .map((i) => {
            const hit = wordsOf(i)
                .filter(w => w.length >= 2 && name.includes(w.toLowerCase()))
                .sort((a, b) => b.length - a.length)[0];
            return hit ? { item: i, score: hit.length } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(x => x.item);
};

/** 이모지 → 라벨. 툴팁에 쓴다 */
export const PROD_ICON_LABELS = Object.fromEntries(
    PROD_ICONS.flatMap(g => g.items).map(i => [i.ch, i.label]),
);

/**
 * 타일 색 — 온도대를 따른다. 상품 목록에서 상온·냉장·냉동이 색으로 갈려
 * 온도대 뱃지를 읽지 않아도 무리가 구분된다.
 *
 * 온도대 뱃지(TEMP_ZONE_META)와 냉동 색이 다른 것은 의도다 — 그쪽은 뱃지끼리 구분되는 것이
 * 일이고 여기는 타일이 부드럽게 깔리는 것이 일이라, 기준으로 삼는 대상이 서로 다르다.
 */
export const PROD_THUMB_TINT = {
    DRY: 'bg-amber-100 border-amber-200',
    CHL: 'bg-sky-100 border-sky-200',
    FRZ: 'bg-cyan-100 border-cyan-200',
};

/** 온도대를 모르는 자리(응답에 필드가 없는 화면)의 기본 타일 */
export const PROD_THUMB_TINT_FALLBACK = 'bg-slate-100 border-slate-200';

/** `emoji:🥛` → { ch, label }. 접두가 다르거나 목록에 없으면 null (= 이미지 주소로 취급) */
export const prodIconOf = (value) => {
    if (typeof value !== 'string' || !value.startsWith(PROD_ICON_PREFIX)) return null;
    const ch = value.slice(PROD_ICON_PREFIX.length);
    return PROD_ICON_LABELS[ch] ? { ch, label: PROD_ICON_LABELS[ch] } : null;
};
