/** 지시가 지금 향하는 칸 — 담아둔 변경이 있으면 그쪽. 카드 기둥·도면·화면 본체가 같은 판정을 쓴다 */
export const targetLocOf = (t) => t._pendingLoc?.locCd ?? t.toLocCd;
