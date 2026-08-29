/**
 * 검색 드롭다운 옵션 — `[{ value, label }]` 배열. 라벨만 뽑아 「전체」를 앞에 붙인 형태다.
 * 값이 고정된 것(뱃지 메타 기반)은 아래 상수로, 공통코드에서 받아오는 것은 toSearchOptions로 만든다.
 * 뱃지 메타와 형태가 다르고 소비처도 DropdownSelect라 파일을 나눈다.
 */
import {
    ASN_PRGR_META, OMS_IB_STATUS_META, OMS_OUTB_STATUS_META, OUTB_STATUS_META, TX_TYPE_META,
    WAVE_STATUS_META, WORK_TYP_META,
} from '@/constants/badgeMeta';

/** 공통코드 목록 → 검색 콤보 옵션 ('전체' 포함) */
export const toSearchOptions = (codes) => [
    { value: '', label: '전체' },
    ...codes.map(c => ({ value: c.codeCd, label: c.codeNm })),
];

/** ASN 진행단계(5단계 파생) 검색 드롭다운 옵션 — 그리드 뱃지와 같은 체계로 거른다 */
export const ASN_PRGR_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(ASN_PRGR_META).map(([value, m]) => ({ value, label: m.label })),
];

/** 입고주문 상태 검색 드롭다운 옵션 */
export const OMS_IB_STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(OMS_IB_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];

/** 출고주문 상태 검색 드롭다운 옵션 */
export const OMS_OUTB_STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(OMS_OUTB_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];

/** 출고진행상태 검색 드롭다운 옵션 (ASN_PRGR_OPTIONS와 같은 형태) */
export const OUTB_STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(OUTB_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];

/** 웨이브 상태 검색 드롭다운 옵션 */
export const WAVE_STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(WAVE_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];

/** 재고이력 유형 검색 드롭다운 옵션 */
export const TX_TYPE_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(TX_TYPE_META).map(([value, m]) => ({ value, label: m.label })),
];

/** 작업자 실적의 작업 종류 검색 드롭다운 옵션 */
export const WORK_TYP_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(WORK_TYP_META).map(([value, m]) => ({ value, label: m.label })),
];
