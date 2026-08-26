/**
 * 사유코드 상수 — 재고 보류·재고조사·속성변경이 같은 「기타」 규칙을 공유해서 한곳에 둔다.
 * API 모듈은 호출 경로만 갖고, 값의 의미는 여기서 정의한다.
 */

/** 「기타」 사유코드 — 이 코드일 때만 자유 텍스트 입력을 받는다 */
export const ETC_RSN_CD = 'ETC';

/** 속성변경 사유 공통코드 그룹. 정정 유형이 하나뿐이라 유형 선택 없이 단일 그룹이다 */
export const LOT_ATTR_RSN_GRP = 'LOT_ATTR_RSN';

/** 재고조정 사유 공통코드 그룹. 재고조사 조정사유(ADJ_RSN)와 별개다 — 조사는 「장부가 틀렸다」의 정정이고 조정은 「이만큼 처분했다」의 기록이다 */
export const INV_ADJ_RSN_GRP = 'INV_ADJ_RSN';

/** 보류사유 / 보류 해제사유 공통코드 그룹 */
export const HLD_RSN_GRP = 'HLD_RSN';
export const HLD_RLZ_RSN_GRP = 'HLD_RLZ_RSN';

/**
 * 재고조정이 보류분을 폐기하며 남기는 해제사유. 트랜잭션이 넣는 값이라 해제 화면 콤보에서는 뺀다 —
 * 고르면 조정 없이 사유만 조정인 해제가 되고, 서버(InvHldService.release)도 이 코드를 거부한다.
 */
export const RLZ_RSN_ADJ = 'ADJ';
