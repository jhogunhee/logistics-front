import { Pin, TriangleAlert } from 'lucide-react';

import { BIZ_DVSN_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { num } from '@/utils/format';
import { Badge } from '@/components/common/Badge';
import { ProdThumb } from '@/components/common/ProdThumb';
import { isShort, pctOf } from './locMapLayout';

/**
 * 랙 상세 격자 — 존 → 통로 → 베이×레벨 입면. 셀은 점유율만큼 아래에서 차오르는 채움(레벨 1이 맨 아래).
 *
 * 현재고 맵(`StockLocMap`)과 적치 맵(`PutawayLocMap`) 둘이 쓴다. 갈라 둔 이유는 적치의 드롭이
 * 베이 합산 칸이 아니라 **레벨 단위 로케이션**에 떨어져야 해서, 구조도가 아니라 이 격자가 캔버스이기
 * 때문이다. 배치 자체(무엇이 어느 통로·베이·레벨인지)는 여전히 `locMapLayout.buildZones`가 소유한다.
 *
 * 드롭·표시 관련 props를 주지 않으면 읽기 전용 격자 그대로다 — 현재고 맵의 동작은 바뀌지 않는다.
 * 칸 버튼에 `data-loccd`, 존 섹션에 `data-tmpzon`을 붙여 두어 바깥이 좌표를 잡거나 스크롤할 수 있다
 * (적치 맵이 변경 화살표와 온도대 자동 이동에 쓴다).
 *
 * @param zones          `buildZones` 결과
 * @param selectedLocCd  선택 표시할 로케이션 코드
 * @param onSelect       칸 클릭 (r)
 * @param onHover        툴팁용 { r, x, y } 또는 null
 * @param emptyText      존이 하나도 없을 때 문구
 * @param droppableOf    (r) => { ok, reason } — 주면 드롭 모드. !ok인 칸은 흐리게 + 이유 툴팁
 * @param onDropTo       (r) => void — 드롭 수락
 * @param dragOverLocCd  지금 커서가 얹힌 칸 (테두리 강조)
 * @param onDragOverCell (r | null) => void
 * @param badgeOf        (r) => string | { text, tone } | null — 칸 아래 보조 표기(적치 탭의 적재가능수량).
 *                       tone: 'tight'(모자람 — 강조) · 'muted'(넉넉함 — 흐리게) · 'ok'(기본)
 * @param markOf         (r) => { drct, pendingIn, pendingOut } | null — 칸 위에 얹는 표식(지시 목적지·담아둔 변경)
 * @param rankOf         (r) => number | null — 추천 순위(적치 탭). 「놓을 수 있다」 위에 「여기가 몇 순위」를 얹는다
 * @param highlightLocCds Set<locCd> — 바깥에서 가리킨 칸(카드 hover 등)을 진하게
 * @param compact        존 헤더에서 존명·온도대·점유율을 뺀다. 존을 가로로 나란히 놓는 쪽(적치 맵)이 쓴다 —
 *                       헤더가 넓으면 존 하나의 최소 폭이 커져 두 개도 한 줄에 못 들어간다.
 *                       뺀 정보는 그쪽 화면이 이미 갖고 있다(온도대는 묶음 머리에, 점유는 칸별 적재가능수량에)
 */
export default function RackGrid({
    zones, selectedLocCd, onSelect, onHover, emptyText = '조건에 맞는 보관 로케이션이 없습니다.',
    droppableOf, onDropTo, dragOverLocCd, onDragOverCell, badgeOf, markOf, rankOf, highlightLocCds, compact,
}) {
    const cellProps = (r) => ({
        r,
        selected: selectedLocCd === r.locCd,
        onClick: () => onSelect?.(r),
        onHover,
        drop: droppableOf ? droppableOf(r) : null,
        onDropTo,
        dragOver: dragOverLocCd === r.locCd,
        onDragOverCell,
        badge: badgeOf?.(r) ?? null,
        mark: markOf?.(r) ?? null,
        rank: rankOf?.(r) ?? null,
        highlight: highlightLocCds?.has(r.locCd) ?? false,
    });

    return (
        <>
            {zones.length === 0 && (
                <p className="text-sm text-slate-400 py-8 text-center">{emptyText}</p>
            )}
            {zones.map(zone => (
                <section key={zone.zonCd} data-tmpzon={zone.tmpZon}
                         className={`bg-white border border-slate-200 rounded-xl transition-opacity ${compact ? 'p-3' : 'p-4'} ${zone.dim ? 'opacity-25' : ''}`}>
                    <div className={`sticky top-0 z-20 bg-white flex items-center gap-2 ${compact ? 'mb-2 py-1' : 'mb-3 py-1'}`}>
                        <h3 className="text-sm font-bold text-slate-700">{zone.zonCd}</h3>
                        {!compact && <span className="text-xs text-slate-400">{zone.zonNm}</span>}
                        <Badge meta={BIZ_DVSN_META} value={zone.bizDvsn} show="label" />
                        {!compact && <Badge meta={TEMP_ZONE_META} value={zone.tmpZon} />}
                        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="tabular-nums">{num(zone.all.length)}자리</span>
                            {!compact && zone.occupancy != null && (
                                <>
                                    <span className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <span className={`block h-full rounded-full ${zone.occupancy > 100 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                                              style={{ width: `${Math.min(zone.occupancy, 100)}%` }} />
                                    </span>
                                    <span className="font-medium text-slate-500 tabular-nums">점유 {zone.occupancy}%</span>
                                </>
                            )}
                        </div>
                    </div>
                    <div className={`flex flex-wrap items-end ${compact ? 'gap-4' : 'gap-6'}`}>
                        {/* 통로 → 랙(베이) → 층(레벨). 랙 머리와 층 라벨을 붙여 「몇 번 랙 몇 층」을 코드 없이 읽게 한다 —
                            칸에 적힌 01-02가 베이-레벨이라는 것은 아는 사람만 아는 규칙이다.
                            랙마다 세로 기둥으로 세워야 「이 랙의 위아래」가 한 덩어리로 보인다 */}
                        {zone.aisles.map(({ aisle, bays, levels, at }) => (
                            <div key={aisle || '(단일)'} className="flex flex-col gap-1">
                                {aisle && <span className="text-[11px] font-bold text-slate-400">통로 {aisle}</span>}
                                <div className="flex items-end gap-2">
                                    {/* 층 라벨은 왼쪽에 한 번만 — 랙마다 반복하면 격자가 숫자로 뒤덮인다 */}
                                    <div className="flex flex-col gap-1 pb-4">
                                        {levels.map(level => (
                                            <span key={level}
                                                  className="h-11 flex items-center text-[10px] text-slate-400 tabular-nums">
                                                {Number(level)}층
                                            </span>
                                        ))}
                                    </div>
                                    {bays.map(bay => (
                                        <div key={bay} className="flex flex-col gap-1">
                                            {levels.map(level => {
                                                const cell = at.get(`${bay}|${level}`);
                                                return cell
                                                    ? <MapCell key={level} {...cellProps(cell)} />
                                                    // 없는 층도 자리를 비워 둔다 — 랙마다 높이가 달라지면 층이 어긋나 보인다
                                                    : <span key={level} className={wideCellClass} />;
                                            })}
                                            <span className="text-center text-[10px] font-medium text-slate-400">랙 {bay}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {zone.flat.map(r => (
                            <MapCell key={r.locId} wide {...cellProps(r)} />
                        ))}
                    </div>
                </section>
            ))}
        </>
    );
}

/** 빈 층 자리 — MapCell과 같은 크기라야 랙 사이의 층이 나란히 선다 */
const wideCellClass = 'h-11 w-16';

/** 랙 상세 채움 색 — 높이가 점유율을 말하므로 색은 상태만 가른다: 정상 indigo, 초과만 rose */
const fillColor = (pct) => (pct > 100 ? 'bg-rose-500' : pct === 100 ? 'bg-indigo-600' : 'bg-indigo-400');

/** 칸 하나 = 로케이션 하나. 구조도의 나열 칸(`wide`)도 같은 그림이라 밖에서도 쓴다 */
export const MapCell = ({
    r, wide, selected, onClick, onHover, drop, onDropTo, dragOver, onDragOverCell, badge, mark, rank, highlight,
}) => {
    const pct = pctOf(r);
    const short = isShort(r);
    const empty = pct == null || pct === 0;
    const height = pct == null ? 0 : Math.min(Math.max(pct, pct > 0 ? 8 : 0), 100); // 미량도 보이게 최소 8%
    const blocked = drop != null && !drop.ok;
    const marked = mark && (mark.drct > 0 || mark.pendingIn > 0 || mark.pendingOut > 0);

    // 드롭 모드에서만 preventDefault를 건다 — 안 걸면 브라우저가 드롭을 거부한다(=금지 커서)
    const dropHandlers = drop?.ok ? {
        onDragOver: (e) => { e.preventDefault(); onDragOverCell?.(r); },
        onDragLeave: () => onDragOverCell?.(null),
        onDrop: (e) => { e.preventDefault(); onDragOverCell?.(null); onDropTo?.(r); },
    } : {};

    // 표식이 있는 칸은 흐리게 만들지 않는다 — 「이 입고건이 가는 자리」는 드래그 중에도 보여야 한다
    const dimmed = blocked && !marked;

    // 뱃지가 없으면 감싸지 않는다 — 현재고 맵의 격자 배치를 건드리지 않으려고
    const cell = (
            <button onClick={onClick}
                    data-loccd={r.locCd}
                    title={blocked ? drop.reason : undefined}
                    onMouseEnter={(e) => onHover?.({ r, x: e.clientX, y: e.clientY })}
                    onMouseMove={(e) => onHover?.({ r, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => onHover?.(null)}
                    {...dropHandlers}
                    className={`relative h-11 ${wide ? 'px-3' : 'w-16'} rounded-md overflow-hidden
                        flex items-start justify-center pt-1 text-[11px] font-medium tabular-nums
                        transition-transform hover:scale-105 hover:z-10 hover:shadow-md
                        ${empty
                            ? 'bg-white border border-dashed border-slate-300 text-slate-400'
                            : 'bg-slate-100 border border-slate-200 text-slate-600'}
                        ${dimmed ? 'opacity-25' : blocked ? 'opacity-60' : ''}
                        ${rank === 1 ? 'outline outline-2 outline-emerald-500' : ''}
                        ${dragOver ? 'ring-2 ring-emerald-500 scale-105 z-10 shadow-md' : ''}
                        ${highlight ? 'ring-2 ring-indigo-500 scale-105 z-10 shadow-md' : ''}
                        ${selected ? 'ring-2 ring-inset ring-slate-900 z-10' : short && !highlight ? 'ring-2 ring-amber-400' : ''}`}>
                {/* 점유율만큼 아래에서 차오르는 채움 */}
                {!empty && (
                    <span className={`absolute bottom-0 inset-x-0 ${fillColor(pct)} opacity-90`}
                          style={{ height: `${height}%` }} />
                )}
                <span className={`relative ${pct >= 75 ? 'text-white' : ''}`}>
                    {wide ? r.locCd : `${r.bay}-${r.level}`}
                </span>
                {/* 고정 자리는 「이 자리는 이 상품 자리」를 그림으로 — 이미지가 없으면 압정으로 되돌아간다.
                    구조도(PlanCell)에는 넣지 않는다: 거긴 베이 합산이라 레벨마다 다른 고정상품을 하나로 대표할 수 없다 */}
                {r.fxngProdCd && !marked && (r.fxngProdImgUrl
                    ? <span className="absolute top-1 right-1"><ProdThumb src={r.fxngProdImgUrl} alt={r.fxngProdNm} size={18} /></span>
                    : <Pin size={11} className={`absolute top-1 right-1 ${pct >= 75 ? 'text-white/85' : 'text-indigo-600'}`} />
                )}
                {short && !marked && <TriangleAlert size={11} className="absolute bottom-1 right-1 text-amber-500 fill-amber-100" />}
                {/* 추천 순위 — 왼쪽 위. 「놓을 수 있다」(밝기)와 「여기가 좋다」(순위)를 갈라 놓는다.
                    고정 자리 표시는 오른쪽 위라 겹치지 않는다.
                    1순위만 채운 배지 + 칸 테두리로 멀리서도 보이게 하고, 2·3순위는 테두리 배지로 뒤로 물린다 —
                    셋을 같은 무게로 그리면 「추천」이 아니라 또 하나의 목록이 된다 */}
                {rank != null && (
                    <span className={`absolute top-0.5 left-0.5 rounded-full font-bold leading-none
                                      flex items-center justify-center shadow-sm ${rank === 1
                        ? 'w-5 h-5 text-[11px] bg-emerald-600 text-white'
                        : 'w-4 h-4 text-[9px] bg-white text-emerald-700 border border-emerald-500'}`}>
                        {rank}
                    </span>
                )}
                {/* 표식 — 지시 목적지(▶잔여)와 담아둔 변경(+들어올 / −나갈). 칸 아래쪽에 겹쳐 얹는다 */}
                {marked && (
                    <span className="absolute bottom-0.5 inset-x-0.5 flex justify-center gap-0.5 text-[9px] font-bold leading-none">
                        {mark.drct > 0 && (
                            <span className="px-1 py-0.5 rounded bg-indigo-600 text-white shadow-sm">▶{num(mark.drct)}</span>
                        )}
                        {mark.pendingIn > 0 && (
                            <span className="px-1 py-0.5 rounded bg-amber-400 text-amber-950 shadow-sm">+{num(mark.pendingIn)}</span>
                        )}
                        {mark.pendingOut > 0 && (
                            <span className="px-1 py-0.5 rounded bg-white/90 text-slate-500 border border-slate-300 shadow-sm">−{num(mark.pendingOut)}</span>
                        )}
                    </span>
                )}
            </button>
    );

    if (!badge) return cell;
    // badgeOf는 문자열이나 { text, tone }을 준다 — 칸마다 숫자가 붙는 자리라 전부 같은 세기로
    // 칠하면 도면이 숫자 밭이 된다. 지금 필요한 만큼 안 들어가는 칸만 눈에 걸리게 한다
    const { text, tone } = typeof badge === 'string' ? { text: badge, tone: 'ok' } : badge;
    const badgeTone = dimmed ? 'text-slate-300'
        : tone === 'tight' ? 'text-amber-600 font-bold'
        : tone === 'muted' ? 'text-slate-400'
        : 'text-emerald-600 font-medium';
    return (
        <div className={wide ? '' : 'flex flex-col items-center gap-0.5'}>
            {cell}
            <span className={`text-[10px] tabular-nums leading-none ${badgeTone}`}>{text}</span>
        </div>
    );
};
