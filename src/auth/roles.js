// 역할 한글 라벨. 백엔드는 코드만 주고받는다 (Role enum의 label은 서버 안에서만 쓴다).
export const ROLE_LABELS = {
    ADMR: '시스템관리자',
    CENT_ADMR: '센터관리자',
    ODR_PIC: '주문담당',
    IB_PIC: '입고담당',
    INV_PIC: '재고담당',
    OUTB_PIC: '출고담당',
    INQ: '조회',
};

export const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

export const roleLabel = (code) => ROLE_LABELS[code] ?? code;

export const roleLabels = (codes = []) => codes.map(roleLabel).join(' · ');
