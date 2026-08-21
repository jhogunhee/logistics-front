/**
 * 뱃지 표시 메타 — 코드값 → { label, badge }. 전부 같은 형태이고 `<Badge meta={...}>`가 소비한다.
 *
 * 코드 *값*은 서버(공통코드·백엔드 enum)에서 오지만 라벨과 뱃지 색은 화면이 정한다 —
 * 표시 스타일을 프론트 상수가 보유한다는 것은 이미 정해진 사항이다(`docs/schema.sql`의 code_group 주석).
 * 서버 응답 스키마가 아니라 뷰 룩업 테이블이므로 api 모듈이 아니라 여기에 둔다. api에 두면
 * 상품 API를 쓰지 않는 화면 15곳이 뱃지 색 하나 때문에 `@/utils/axios`까지 끌고 오게 된다.
 */

/** 온도대 표시 메타 (공통코드 TEMP_ZONE) */
export const TEMP_ZONE_META = {
    DRY: { label: '상온', badge: 'bg-amber-100 text-amber-700' },
    CHL: { label: '냉장', badge: 'bg-sky-100 text-sky-700' },
    FRZ: { label: '냉동', badge: 'bg-indigo-100 text-indigo-700' },
};

/** 로케이션 유형 표시 메타 */
export const LOC_TYPE_META = {
    STAGE:   { label: '스테이징', badge: 'bg-rose-100 text-rose-700' },
    STORAGE: { label: '보관',     badge: 'bg-emerald-100 text-emerald-700' },
};

/** 보관유형 표시 메타 (공통코드 STRG_TYP) */
export const STRG_TYP_META = {
    RACK: { label: '랙',   badge: 'bg-sky-100 text-sky-700' },
    FLAT: { label: '평치', badge: 'bg-lime-100 text-lime-700' },
    VRTL: { label: '가상', badge: 'bg-slate-100 text-slate-600' },
};

/** 업무구분 표시 메타 (공통코드 BIZ_DVSN) */
export const BIZ_DVSN_META = {
    INB:   { label: '입고작업', badge: 'bg-blue-100 text-blue-700' },
    OUTB:  { label: '출고작업', badge: 'bg-violet-100 text-violet-700' },
    STRG:  { label: '보관',     badge: 'bg-emerald-100 text-emerald-700' },
    PIKNG: { label: '피킹',     badge: 'bg-amber-100 text-amber-700' },
    RTNGS: { label: '반품',     badge: 'bg-rose-100 text-rose-700' },
    WRK:   { label: '작업',     badge: 'bg-slate-100 text-slate-600' },
};

/** 동적키유형 표시 메타 */
export const DYNC_KY_TYP_META = {
    NONE: { label: '고정', badge: 'bg-slate-100 text-slate-600' },
    YEAR: { label: '연도별', badge: 'bg-sky-100 text-sky-700' },
    MONTH: { label: '월별', badge: 'bg-sky-100 text-sky-700' },
    DAY: { label: '일자별', badge: 'bg-sky-100 text-sky-700' },
};


/** 입고주문 상태 표시 메타 — 백엔드 OmsIbStatus와 1:1 */
export const OMS_IB_STATUS_META = {
    CREATED:   { label: '작성', badge: 'bg-slate-100 text-slate-600' },
    CONFIRMED: { label: '확정', badge: 'bg-emerald-100 text-emerald-700' },
};

/** ASN 저장 상태 표시 메타 — 백엔드 IbStatus와 1:1. 사건 셋만 저장한다(생성/검수 시작/사람이 확정).
 *  진행 단계(적치지시·적치완료 등)는 상태가 아니라 파생값이다 — 아래 ASN_PRGR_META.
 *  취소 상태는 없다 — 확정취소가 ASN 행을 삭제한다 (omsIbOrderApi.cancelConfirm) */
export const ASN_STATUS_META = {
    SCHEDULED: { label: '입고예정', badge: 'bg-slate-100 text-slate-600' },
    RECEIVING: { label: '입고중',   badge: 'bg-amber-100 text-amber-700' },
    CONFIRMED: { label: '입고확정', badge: 'bg-emerald-100 text-emerald-700' },
};

/** ASN 진행 5단계 표시 메타 — 백엔드 IbPrgr와 1:1. 저장값이 아니라 수량·적치지시에서
 *  매번 계산해 내려오는 값이다(헤더 prgr, 라인 status). 양끝 세 토큰은 IbStatus와 같다 */
export const ASN_PRGR_META = {
    SCHEDULED:  { label: '입고예정', badge: 'bg-slate-100 text-slate-600' },
    RECEIVING:  { label: '검수',     badge: 'bg-amber-100 text-amber-700' },
    PTAWY_DRCT: { label: '적치지시', badge: 'bg-indigo-100 text-indigo-700' },
    PTAWY_CMPL: { label: '적치완료', badge: 'bg-sky-100 text-sky-700' },
    CONFIRMED:  { label: '입고확정', badge: 'bg-emerald-100 text-emerald-700' },
};


/** 출고주문 상태 표시 메타 — 백엔드 OmsOutbStatus와 1:1 */
export const OMS_OUTB_STATUS_META = {
    CREATED:   { label: '작성', badge: 'bg-slate-100 text-slate-600' },
    CONFIRMED: { label: '확정', badge: 'bg-emerald-100 text-emerald-700' },
};

/**
 * 출고 진행상태 표시 메타. 부분할당은 상태가 아니라 수량에서 파생하므로 여기 없다.
 * 취소(CANCELLED)도 없다 — 없앨 주문은 OMS 확정취소가 행째로 지운다(웨이브 편성 전만).
 */
export const OUTB_STATUS_META = {
    CREATED:   { label: '신규',     badge: 'bg-slate-100 text-slate-600' },
    ALLOCATED: { label: '할당',     badge: 'bg-indigo-100 text-indigo-700' },
    PICKING:   { label: '피킹중',   badge: 'bg-amber-100 text-amber-700' },
    PICKED:    { label: '피킹완료', badge: 'bg-sky-100 text-sky-700' },
    SHIPPED:   { label: '출고확정', badge: 'bg-emerald-100 text-emerald-700' },
};

/**
 * 웨이브 편입 출처. 수동 편성은 금지 대상이 아니라 가시화 대상이다 —
 * 전략 조건과 맞지 않는 주문이 웨이브에 들어 있는 상황을 화면이 구분해 보여준다.
 */
export const WAV_REG_TYP_META = {
    STGY:   { label: '전략',  badge: 'bg-violet-100 text-violet-700' },
    MANUAL: { label: '수동',  badge: 'bg-slate-100 text-slate-500' },
};

/**
 * 웨이브 상태 표시 메타. 편성/발행 두 단계뿐이다 — 발행 이후 진행(피킹/확정)은
 * 주문 단위로 흐르므로 웨이브는 거기서 역할이 끝난다.
 */
export const WAVE_STATUS_META = {
    PLANNED: { label: '편성중',   badge: 'bg-amber-100 text-amber-700' },
    ISSUED:  { label: '지시발행', badge: 'bg-emerald-100 text-emerald-700' },
    CLOSED:  { label: '종료',     badge: 'bg-slate-200 text-slate-600' },
};


/** 유형 표시 메타 (라벨/뱃지 색) — 백엔드 TxType과 1:1 */
export const TX_TYPE_META = {
    RECEIVE: { label: '입고', badge: 'bg-emerald-100 text-emerald-700' },
    MOVE:    { label: '이동', badge: 'bg-sky-100 text-sky-700' },
    ADJUST:  { label: '조정', badge: 'bg-violet-100 text-violet-700' },
    PICK:    { label: '피킹', badge: 'bg-amber-100 text-amber-700' },
    SHIP:    { label: '출고확정', badge: 'bg-rose-100 text-rose-700' },
};

/** 보류 건 상태 표시 메타. 2값뿐 — 부분 해제 여부는 수량(rlzQty vs hldQty)으로 본다 */
export const INV_HLD_STATUS_META = {
    HELD:     { label: '보류중', badge: 'bg-rose-100 text-rose-700' },
    RELEASED: { label: '해제',   badge: 'bg-slate-100 text-slate-500' },
};

/** 이동지시 상태 표시 메타 (DIRECTED에 부분확정이 포함된다 — 진행도는 수량으로 본다) */
export const INV_MOV_STATUS_META = {
    DIRECTED:  { label: '지시', badge: 'bg-indigo-100 text-indigo-700' },
    DONE:      { label: '완료', badge: 'bg-emerald-100 text-emerald-700' },
    CANCELLED: { label: '취소', badge: 'bg-slate-100 text-slate-500' },
};

/**
 * 이동구분 표시 메타. 재고이동 화면의 확정·취소는 INV_MOV(재고이동)만 가능하다.
 * PIKNG은 피킹지시가 별도 pikng_task로 확정되면서(2026-08-20) 백엔드 enum과 함께 제거했다.
 */
export const INV_MOV_DVSN_META = {
    INV_MOV: { label: '재고이동', badge: 'bg-sky-100 text-sky-700' },
    PTAWY:   { label: '적치',     badge: 'bg-violet-100 text-violet-700' },
};

/** 피킹지시 상태 표시 메타 — 백엔드 PikngTaskStatus와 1:1. CANCELLED 행은 화면 목록에 오지 않는다 */
export const PIKNG_TASK_STATUS_META = {
    DIRECTED:  { label: '지시', badge: 'bg-indigo-100 text-indigo-700' },
    DONE:      { label: '완료', badge: 'bg-emerald-100 text-emerald-700' },
    CANCELLED: { label: '취소', badge: 'bg-slate-100 text-slate-500' },
};

/** 조사 상태 표시 메타. 「부분입력」 같은 상태는 없다 — 진행도는 라인 수 비교로 본다 */
export const INV_STKTK_STATUS_META = {
    CREATED:   { label: '작성', badge: 'bg-indigo-100 text-indigo-700' },
    CONFIRMED: { label: '확정', badge: 'bg-emerald-100 text-emerald-700' },
    CANCELLED: { label: '취소', badge: 'bg-slate-100 text-slate-500' },
};
