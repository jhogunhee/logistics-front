-- =============================================================================
-- 입고(Inbound) 테이블 재설계 — 예정 / 작업 / 이력 3-layer (PostgreSQL)
-- =============================================================================
-- 배경
--   기존 ib_line 에 예정수량과 진행누계(rcvd_qty, ptawy_qty)가 함께 얹혀
--   있어 동시성/정합성 위험과 이력 관리 한계가 있었음. 검수 이력은 inv_hist에
--   얹혀 있어 "입고 작업" 관점의 취소/작업자/지시-실행 시간차를 담기 어려웠고,
--   적치는 지시(instruction)/실행(execution) 단계가 미분되어 있었음.
--
-- 목표
--   Layer 1  예정(plan)   ib_order / ib_line
--                          — 예정수량 + 확정수량 스냅샷만 소유
--   Layer 2  작업(task)   ib_receive_task / ib_putaway_task
--                          — mutable, 진행 중인 검수·적치 작업
--   Layer 3  이력(hist)   ib_hist
--                          — append-only, 입고 프로세스 이벤트 로그
--
-- 결정사항
--   - DB: PostgreSQL
--   - 적치: 지시(INSTRUCTED) → 실행(DONE) 2단계
--   - 이력: 재고이력(inv_hist)과 분리된 ib_hist 신설
--   - 마감 기능 제거 → 입고확정으로 통합 (예정 100 − 확정 80 = 결품 20)
--   - CHECK / FK(REFERENCES) / CREATE INDEX / CREATE VIEW / GENERATED 컬럼 은 넣지 않는다
--     — 무결성·상태 규칙·파생 값은 앱 계층에서, 인덱스는 실사용 프로파일링 후 별도로
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Layer 1: 예정 (Plan) — 기존 테이블 정리
-- -----------------------------------------------------------------------------
-- ib_order.status 코드 (텍스트, 앱 계층에서 검증)
--   SCHEDULED  입고예정
--   RECEIVING  검수중
--   CONFIRMED  입고확정 (기존 RECEIVED 를 개명, 마감 개념 제거)
--   COMPLETED  적치완료

ALTER TABLE ib_line
  DROP COLUMN rcvd_qty,          -- 작업 테이블에서 집계 (백엔드 쿼리)
  DROP COLUMN ptawy_qty,         -- 작업 테이블에서 집계 (백엔드 쿼리)
  ADD  COLUMN confirm_qty   integer,      -- 입고확정수량 (확정 시 스냅샷)
  ADD  COLUMN confirmed_at  timestamptz,
  ADD  COLUMN confirmed_by  text;
-- expct_qty (입고예정수량, EA) 는 immutable 로 유지
-- 결품수량 = expct_qty - confirm_qty 는 백엔드에서 계산 (컬럼 저장 안 함)


-- -----------------------------------------------------------------------------
-- Layer 2-1: 검수작업 (ib_receive_task)
-- -----------------------------------------------------------------------------
-- 검수 1건 = 1 row. Lot 이 함께 채번되며 UK (lot_id) 로 1:1 보장.
-- 이번 검수분(inspect_qty)만 저장하고 라인 누계는 백엔드 쿼리에서 SUM.
-- 취소는 status = CANCELLED 로 표시 (이미 적치가 시작된 검수는 취소 불가 — app 규칙).
--
-- status 값: RECEIVED / CANCELLED (앱 계층에서 검증)

CREATE TABLE ib_receive_task (
  receive_task_id  bigserial   PRIMARY KEY,
  ib_line_id       bigint      NOT NULL,              -- → ib_line.ib_line_id
  inspect_qty      integer     NOT NULL,
  receipt_dt       date        NOT NULL,              -- 실제 입고일
  mfg_dt           date,                              -- 유통기한 관리 상품만
  lot_id           bigint      NOT NULL,              -- → lot.lot_id (서버 채번)
  status           text        NOT NULL,
  cancelled_reason text,
  worker_id        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  cancelled_at     timestamptz,
  UNIQUE (lot_id)
);


-- -----------------------------------------------------------------------------
-- Layer 2-2: 적치작업 (ib_putaway_task) — 지시 → 실행 2단계
-- -----------------------------------------------------------------------------
-- status 값 (앱 계층에서 검증):
--   INSTRUCTED   지시 발행 (PDA/작업자에게 할당됨)
--   IN_PROGRESS  실행 중 (선택적, 스캔 시작 등)
--   DONE         실행 완료 — putaway_qty 확정, RCV-STAGE → to_loc 로 이동
--   CANCELLED    지시 취소
--
-- 앱 계층 규칙:
--   - DONE 이면 putaway_qty 와 executed_at 이 반드시 세팅되어야 함
--   - 부분 실행: 지시 20 → 실제 15만 적치 → DONE + putaway_qty=15
--     남은 5개는 새 지시로 다시 발행

CREATE TABLE ib_putaway_task (
  putaway_task_id  bigserial   PRIMARY KEY,
  ib_line_id       bigint      NOT NULL,              -- → ib_line.ib_line_id
  lot_id           bigint      NOT NULL,              -- → lot.lot_id
  from_loc_id      bigint      NOT NULL,              -- → loc.loc_id (보통 RCV-STAGE)
  to_loc_id        bigint      NOT NULL,              -- → loc.loc_id (지시된 보관 로케이션)
  instruct_qty     integer     NOT NULL,              -- 적치지시수량
  putaway_qty      integer,                           -- 실적치수량 (DONE 시)
  status           text        NOT NULL,
  instructed_at    timestamptz NOT NULL DEFAULT now(),
  executed_at      timestamptz,
  instructed_by    text,
  worker_id        text,
  cancelled_reason text
);


-- -----------------------------------------------------------------------------
-- Layer 3: 입고이력 (ib_hist) — append-only
-- -----------------------------------------------------------------------------
-- inv_hist(재고 관점)와 분리된 입고 프로세스 관점의 이력.
-- 취소 이벤트는 qty 에 음수 부호로 기록 (예: RECEIVE_CANCEL, qty = -10).
--
-- event_type 값 (앱 계층에서 검증):
--   RECEIVE           검수 성공     + inv_hist(RECEIVE, RCV-STAGE +N)
--   RECEIVE_CANCEL    검수 취소     + inv_hist(RECEIVE, RCV-STAGE -N)
--   PUTAWAY_INSTRUCT  적치 지시     (재고이동 없음)
--   PUTAWAY_DONE      적치 실행     + inv_hist(MOVE, RCV-STAGE → to_loc)
--   PUTAWAY_CANCEL    적치 취소
--   CONFIRM           입고 확정     (마감 대체, 재고이동 없음)

CREATE TABLE ib_hist (
  ib_hist_id   bigserial   PRIMARY KEY,
  ib_line_id   bigint      NOT NULL,     -- → ib_line.ib_line_id
  event_type   text        NOT NULL,
  qty          integer     NOT NULL,     -- 취소는 음수 부호
  ref_task_id  bigint,                   -- receive_task_id or putaway_task_id
  lot_id       bigint,                   -- → lot.lot_id (해당 시)
  to_loc_id    bigint,                   -- → loc.loc_id (해당 시)
  memo         text,
  event_at     timestamptz NOT NULL DEFAULT now(),
  event_by     text
);


-- =============================================================================
-- 라인별 진행 수량 (rcvd_qty / ptawy_instruct_qty / ptawy_done_qty) 은
-- 뷰로 만들지 않고 백엔드 쿼리에서 직접 집계한다:
--   SUM(ib_receive_task.inspect_qty) WHERE status = 'RECEIVED'
--   SUM(ib_putaway_task.instruct_qty) WHERE status IN ('INSTRUCTED','IN_PROGRESS','DONE')
--   SUM(ib_putaway_task.putaway_qty)  WHERE status = 'DONE'
-- 통합 작업 조회("작업자별 오늘 처리한 작업 전체")도 필요할 때 UNION 쿼리로.
-- =============================================================================


-- =============================================================================
-- 마이그레이션 순서 (다운타임 최소)
--   1. ib_receive_task, ib_putaway_task, ib_hist 생성 (빈 테이블)
--   2. 기존 inv_hist 의 RECEIVE 건 → ib_receive_task + ib_hist(RECEIVE) 백필
--   3. 기존 라인 rcvd_qty / ptawy_qty 값이 새 집계 쿼리 결과와 일치하는지 검증
--   4. ib_line 에 confirm_qty, confirmed_at/by 컬럼 추가
--   5. 기존 RECEIVED 상태 라인 → confirm_qty = rcvd_qty 백필, status → CONFIRMED
--   6. 백엔드 코드 컷오버 완료 후 rcvd_qty / ptawy_qty 컬럼 DROP
-- =============================================================================
