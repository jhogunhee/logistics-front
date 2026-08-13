// 재고 로트변경 API (wms-backend 연동) — 수량을 지정한 Lot 속성정정.
// 「이 로케이션의 이 재고 중 N개는 제조일자가 X였다」: 원 Lot에서 N개를 빼
// (상품+입고일자+X) 배치의 Lot으로 넣는다 — 그 배치의 Lot이 있으면 병합, 없으면 채번(분할).
// 재고를 움직이지 않는 재고 속성변경(전량·Lot번호 유지)과 별개 조작이다 —
// 여기는 inv 2행 증감 + 재고 이력(ADJUST 2행)이 남고, 새 Lot 번호가 발생한다(현품 라벨 재출력).
import api from '@/utils/axios';

export const invLotChngApi = {
    /**
     * 변경 대상 재고 행 조회. cond: { prodCd, prodNm, lotNo, locCd }
     * 보관 로케이션 + 유통기한 관리 상품 + 가용수량 > 0 을 조건과 무관하게 서버가 강제한다 —
     * 스테이징 재고는 적치 잔량 계산이 깨져 대상이 아니고(검수 취소 후 재검수가 그 경로의 정답),
     * 예약·보류분은 그 문서가 가리키는 재고라 옮길 수 없다.
     */
    listTargets(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v !== '' && v != null));
        return api.get('/inventory/lot-chngs/targets', { params });
    },

    /**
     * 목적지 배치 후보 조회 — 원 Lot과 같은 상품+입고일자인 다른 Lot들 (서버가 규칙 강제).
     * 목적지 선택 모달용: 여기서 고르면 그 Lot의 날짜가 그대로 실려 병합이 되고(유통기한
     * 불일치 거부가 입력 단계에서 차단된다), 후보가 없으면 직접 입력이 분할(새 Lot 채번)이 된다.
     */
    listTargetLots(invId) {
        return api.get('/inventory/lot-chngs/target-lots', { params: { invId } });
    },

    /**
     * 로트변경 실행. items: [{ invId, chngQty, mfgDt, expiryDt, rsnCd, rsnDscr }] —
     * 전체가 한 트랜잭션이라 한 건이라도 검증에 걸리면 전량 롤백된다.
     * 발급된 로트변경 번호 목록을 돌려받는다 (재고 이력의 참조 문서번호로도 실린다).
     *
     * 서버가 거부하는 경우: 미관리 상품 · 스테이징 재고 · 가용 초과 · 제조일자가 원 Lot과 동일(순수
     * 분할 미지원) · 제조일자 > 입고일자 · 유통기한 < 제조일자 · 같은 재고 행 중복 ·
     * **목적지 배치의 Lot이 이미 있는데 유통기한이 입력과 다른 경우**(실제 값을 안내 — 그 값이
     * 틀렸다면 재고 속성변경으로 목적지 Lot을 먼저 정정하고 다시 시도).
     */
    change(items) {
        return api.post('/inventory/lot-chngs', { items });
    },

    /** 실적 조회 (append-only 로그 — 취소 경로가 없어 되돌린 것도 새 행으로 남는다) */
    list(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v !== '' && v != null));
        return api.get('/inventory/lot-chngs', { params });
    },
};
