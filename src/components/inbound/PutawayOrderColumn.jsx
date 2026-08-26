import { ChevronDown, ChevronRight, Undo2 } from 'lucide-react';

import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { fmtDe, num } from '@/utils/format';
import { Badge } from '@/components/common/Badge';
import { targetLocOf } from './putawayTask';

/**
 * 적치 화면 왼쪽 기둥 — 「입고건 → 상품 → 지시」를 카드 하나로 접고 편다.
 *
 * 그리드가 아닌 이유: 이 자리는 입고건 대여섯 개 중 하나를 고르는 곳이지 수십 행을 정렬·비교하는 곳이
 * 아니다. 7컬럼을 1/3 폭에 넣으면 가로 스크롤이 생겨 고르는 데 필요한 정보(입고일·임박일)가 숨는다.
 * 카드는 두 줄로 다 보이고, 오른쪽 도면의 카드와 언어가 같아진다. 왼쪽 = 「무엇을」, 오른쪽 = 「어디로」.
 *
 * 고른 입고건만 펼쳐져 상품별 지시 카드가 나온다 — 그 카드가 도면으로 끌어다 놓는 드래그 원천이다.
 * 정렬은 서버가 준 유통기한 임박순 하나뿐이고 그게 곧 작업 순서라 사용자가 바꿀 일이 없다.
 *
 * @param orders        Putaway.groupByOrder 결과 (유통기한 임박순)
 * @param selectedIbNo  펼칠 입고건
 * @param onSelect      (ibNo) => void
 * @param dragTaskId    끌리는 중인 지시 (흐리게)
 * @param onDragStart   (task) => void
 * @param onDragEnd     () => void
 * @param onHoverTask   (task | null) => void — 도면의 그 칸을 켠다
 * @param onClickTask   (task) => void — 도면에서 그 칸으로 이동
 * @param litLocCd      도면에서 hover 중인 칸 — 그리로 가는 카드를 켠다
 * @param onUnstage     (task) => void — 담아둔 변경 취소
 * @param onExecQtyChange (task, value) => void — 이번에 옮길 수량
 */
export default function PutawayOrderColumn({
    orders, selectedIbNo, onSelect, dragTaskId, onDragStart, onDragEnd, onHoverTask, onClickTask, litLocCd,
    onUnstage, onExecQtyChange,
}) {
    if (orders.length === 0) {
        return (
            <p className="text-sm text-slate-400 py-8 px-3 text-center leading-relaxed">
                실행할 적치지시가 없습니다<br />
                <span className="text-xs">「적치지시」 화면에서 먼저 지시를 발행하세요</span>
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-1.5">
            {orders.map(o => (
                <OrderCard key={o.ibNo} order={o} open={o.ibNo === selectedIbNo} onSelect={() => onSelect(o.ibNo)}
                           dragTaskId={dragTaskId} onDragStart={onDragStart} onDragEnd={onDragEnd}
                           onHoverTask={onHoverTask} onClickTask={onClickTask} litLocCd={litLocCd}
                           onUnstage={onUnstage} onExecQtyChange={onExecQtyChange} />
            ))}
        </div>
    );
}

/** 입고건 카드 — 접히면 두 줄 요약, 펼치면 상품별 지시 카드 */
const OrderCard = ({ order, open, onSelect, dragTaskId, onDragStart, onDragEnd, onHoverTask, onClickTask, litLocCd, onUnstage, onExecQtyChange }) => {
    // 상품별로 묶는다 — 작업자가 집어 드는 단위는 여전히 상품이다
    const groups = [];
    const byProd = new Map();
    for (const t of order.tasks) {
        let g = byProd.get(t.prodCd);
        if (!g) {
            g = { prodCd: t.prodCd, prodNm: t.prodNm, tmpZon: t.tmpZon, tasks: [] };
            byProd.set(t.prodCd, g);
            groups.push(g);
        }
        g.tasks.push(t);
    }
    const Chevron = open ? ChevronDown : ChevronRight;

    return (
        <div className={`rounded-xl border transition-colors ${open
            ? 'border-indigo-300 bg-indigo-50/40 shadow-sm'
            : 'border-slate-200 bg-white hover:border-indigo-200'}`}>
            <button onClick={onSelect} className="w-full text-left px-3 py-2 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    <Chevron size={14} className={`shrink-0 ${open ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className={`font-mono text-sm font-bold truncate ${open ? 'text-indigo-700' : 'text-slate-700'}`}>{order.ibNo}</span>
                    <span className="ml-auto text-xs text-slate-500 truncate shrink-0 max-w-[45%]" title="상대처 — 정상 발주는 벤더, 반품입고는 점포">
                        {order.partnerNm ?? '—'}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 pl-5 text-xs min-w-0">
                    {order.tmpZonList.map(z => <Badge key={z} meta={TEMP_ZONE_META} value={z} />)}
                    <span className="text-slate-500">{order.prodCount}상품</span>
                    <span className="ml-auto tabular-nums shrink-0">
                        <span className="text-slate-400">잔여 </span>
                        <b className="text-amber-600">{num(order.remainingQty)}</b>
                    </span>
                </div>
                <div className="flex items-center gap-2 pl-5 text-[11px] text-slate-400 tabular-nums">
                    <span>입고 {order.receiptDt ? fmtDe(order.receiptDt) : '—'}</span>
                    <span>·</span>
                    <span title="이 입고건 지시 중 가장 임박한 유통기한">
                        임박 {order.nearestExpiryDt ? fmtDe(order.nearestExpiryDt) : '미관리'}
                    </span>
                </div>
            </button>

            {open && (
                <div className="px-2 pb-2 flex flex-col gap-2">
                    <p className="text-[11px] text-slate-400 leading-snug px-1">
                        카드를 도면 위 칸으로 끌어다 놓으면 <b className="text-slate-500">지시 위치</b>가 바뀝니다.
                        적치 실행은 [적치 저장]이 합니다.
                    </p>
                    {groups.map(g => (
                        <div key={g.prodCd} className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 min-w-0 px-1">
                                <Badge meta={TEMP_ZONE_META} value={g.tmpZon} />
                                <span className="text-[11px] font-bold text-slate-700 truncate" title={`${g.prodCd} ${g.prodNm}`}>{g.prodNm}</span>
                                <span className="text-[10px] text-slate-400 shrink-0">{g.prodCd}</span>
                            </div>
                            {g.tasks.map(t => (
                                <TaskCard key={t.putawayTaskId} task={t}
                                          dragging={t.putawayTaskId === dragTaskId}
                                          lit={litLocCd != null && litLocCd === targetLocOf(t)}
                                          onDragStart={() => onDragStart(t)}
                                          onDragEnd={onDragEnd}
                                          onHover={(on) => onHoverTask(on ? t : null)}
                                          onClick={() => onClickTask(t)}
                                          onUnstage={() => onUnstage(t)}
                                          onExecQtyChange={(v) => onExecQtyChange(t, v)} />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/** 지시 카드 — 담아둔 변경이 있으면 「현재 → 새 위치」를 함께 보여준다. 분할 예정 행은 끌 수 없다(원 지시 단위로 담기 때문) */
const TaskCard = ({ task, dragging, lit, onDragStart, onDragEnd, onHover, onClick, onUnstage, onExecQtyChange }) => {
    const pending = task._pendingLoc;
    const virtual = Boolean(task._virtualOf);
    const staged = Boolean(task._stagedLoc);
    const execQty = String(task._execQty ?? '');
    const over = Number(execQty) > task.remainingQty;
    const excluded = execQty.trim() === '';

    return (
        <div draggable={!virtual}
             onDragStart={onDragStart}
             onDragEnd={onDragEnd}
             onMouseEnter={() => onHover(true)}
             onMouseLeave={() => onHover(false)}
             onClick={onClick}
             title="클릭하면 도면에서 그 칸으로 이동합니다"
             className={`rounded-lg border px-2.5 py-2 text-xs flex flex-col gap-1 select-none transition-shadow
                 ${virtual ? 'border-dashed border-amber-300 bg-amber-50/60 cursor-default'
                           : 'border-slate-200 bg-white cursor-grab active:cursor-grabbing hover:border-indigo-300 hover:shadow-sm'}
                 ${lit ? 'ring-2 ring-indigo-500 shadow-md' : ''}
                 ${dragging ? 'opacity-40 ring-2 ring-indigo-400' : ''}`}>
            <div className="flex items-center gap-1.5 min-w-0">
                {virtual && <span className="font-mono text-[10px] text-slate-400 shrink-0">{task._fromLocCd} →</span>}
                <span className={`font-mono font-bold truncate ${pending ? 'text-amber-600' : 'text-indigo-700'}`}>
                    {pending ? pending.locCd : task.toLocCd}
                </span>
                {pending && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold shrink-0">
                        {virtual ? '분할 예정' : '변경 예정'}
                    </span>
                )}
                {staged && !virtual && (
                    <button onClick={(e) => { e.stopPropagation(); onUnstage(); }} title="담아둔 변경 취소"
                            className="ml-auto text-slate-300 hover:text-rose-500 shrink-0">
                        <Undo2 size={12} />
                    </button>
                )}
            </div>
            <div className="flex items-center gap-2 text-slate-500">
                <span className="text-slate-400">잔여</span>
                <span className="tabular-nums font-bold text-amber-600">{num(task.remainingQty)}</span>
                <span className="ml-auto font-mono text-[10px] text-slate-400 truncate">{task.lotNo}</span>
            </div>
            {/* 이번에 옮길 수량 — 기본값이 잔여 전량이라 손대지 않으면 곧 전량 적치다.
                입력은 카드가 끌리는 것과 부딪히므로 draggable=false + 이벤트를 여기서 끊는다.
                비우면 이번 저장에서 제외 (표 탭의 적치수량 컬럼과 같은 규칙) */}
            <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                <label className="text-[11px] text-slate-400 shrink-0">적치</label>
                <input
                    type="number"
                    min={1}
                    max={task.remainingQty}
                    draggable={false}
                    value={execQty}
                    onChange={(e) => onExecQtyChange(e.target.value)}
                    className={`w-16 px-1.5 py-0.5 text-right tabular-nums text-xs rounded border
                        ${over ? 'border-rose-300 bg-rose-50 text-rose-600 font-bold'
                               : excluded ? 'border-slate-200 bg-slate-50 text-slate-400'
                               : 'border-indigo-200 bg-indigo-50 text-indigo-800 font-medium'}`}
                />
                <span className="text-[11px] text-slate-400 truncate">
                    {over ? '잔여 초과' : excluded ? '이번엔 제외' : '개'}
                </span>
            </div>
        </div>
    );
};
