/**
 * 검색 드롭다운 옵션 — `[{ value, label }]` 배열. 뱃지 메타에서 라벨만 뽑아 「전체」를 앞에 붙인 형태다.
 * 뱃지 메타와 형태가 다르고 소비처도 DropdownSelect라 파일을 나눈다.
 */
import {
    ASN_STATUS_META, OMS_IB_STATUS_META, OMS_OUTB_STATUS_META, OUTB_STATUS_META, TX_TYPE_META,
} from '@/constants/badgeMeta';

/** ASN 상태 검색 드롭다운 옵션 */
export const ASN_STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(ASN_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
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

/** 출고진행상태 검색 드롭다운 옵션 (ASN_STATUS_OPTIONS와 같은 형태) */
export const OUTB_STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(OUTB_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];

/** 재고이력 유형 검색 드롭다운 옵션 */
export const TX_TYPE_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(TX_TYPE_META).map(([value, m]) => ({ value, label: m.label })),
];
