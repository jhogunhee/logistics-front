// 재고 속성변경 API (wms-backend 연동) — Lot 속성(제조일자·유통기한) 정정.
// 재고를 한 톨도 움직이지 않는다: inv·inv_hist 무변경이고 lot 행만 갱신된다.
// 재고상태 전환은 재고 보류, 수량 정정은 재고조사가 담당한다 (여기 수량은 표시용 영향범위뿐).
import api from '@/utils/axios';

export const lotAttrChngApi = {
    /**
     * 정정 대상 Lot 조회. cond: { prodCd, prodNm, lotNo, expiryFrom, expiryTo, onlyInStock }
     * 유통기한 미관리 상품(shelfLifeDays 없음)의 Lot은 서버가 조건과 무관하게 제외한다 —
     * 두 날짜가 항상 비어 있는 것이 그 상품의 정의라 정정 대상이 아니다.
     * 응답의 invRowCnt·onHandQty가 이 정정의 영향 범위다 (Lot 단위라 모든 재고 행에 일괄 반영).
     */
    listTargets(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v !== '' && v != null));
        return api.get('/inventory/lot-attrs', { params });
    },

    /**
     * Lot 속성 정정. 두 날짜는 「바꿀 값」이 아니라 정정 후의 최종 값이라 한쪽만 고쳐도 둘 다 보낸다.
     * 서버가 거부하는 경우: 미관리 상품 Lot · 날짜 미입력 · 제조일자 > 입고일자 ·
     * 유통기한 < 제조일자 · 전후 값 동일 · 배치 재사용 키(상품+입고일자+제조일자) 충돌.
     * rsnDscr는 사유코드가 ETC(기타)일 때만 필수 — 그 외 코드에서는 서버가 무시한다.
     */
    change(lotId, { mfgDt, expiryDt, rsnCd, rsnDscr }) {
        return api.put(`/inventory/lot-attrs/${lotId}`, { mfgDt, expiryDt, rsnCd, rsnDscr });
    },

    /** 정정 이력 조회 (append-only 로그 — 되돌리는 정정도 새 행이라 왕복이 그대로 남는다) */
    listChngs(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v !== '' && v != null));
        return api.get('/inventory/lot-attrs/chngs', { params });
    },
};

/** 「기타」 사유코드 — 이 코드일 때만 자유 텍스트 입력을 받는다 (보류·재고조사와 같은 규칙) */
export const ETC_RSN_CD = 'ETC';

/** 정정 사유 공통코드 그룹. 정정 유형이 하나뿐이라 레거시의 유형 종속 연쇄 콤보와 달리 단일 그룹이다 */
export const LOT_ATTR_RSN_GRP = 'LOT_ATTR_RSN';
