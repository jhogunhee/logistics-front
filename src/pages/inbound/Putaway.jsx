import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Layers, Loader2, Map as MapIcon, MapPin, PackageOpen, Table2, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { putawayApi } from '@/api/putawayApi';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { fmtDe, num } from '@/utils/format';
import SearchBar, { SearchDateRange, SearchText, SearchProd } from '@/components/common/SearchBar';
import ConfirmModal from '@/components/common/ConfirmModal';
import PutawayLocMap from '@/components/inbound/PutawayLocMap';
import PutawayOrderColumn from '@/components/inbound/PutawayOrderColumn';
import { targetLocOf } from '@/components/inbound/putawayTask';
import { Badge } from '@/components/common/Badge';

// 이 화면은 지시 기반 실행이다 — 직접 적치(로케이션 골라 즉시 이동) 경로는 적치지시 도입 때
// 서버와 함께 제거됐다. 한때 병합 충돌이 이 파일만 옛 직접 적치 버전으로 되돌려 실행이
// 존재하지 않는 API를 부르며 죽어 있었다(2026-08-14 복구). 지시 발행은 「적치지시」 화면 몫.
//
// 축은 「입고건 → 상품 → 지시」다. 한때 상품 축(입고건을 무시하고 상품별 합산)이었는데, 작업자는
// 입고건 단위로 내려놓은 팔레트 앞에 서므로 입고건이 먼저 보여야 하고, 지시등록 화면과도 같은
// 구조가 된다(2026-08-26). 왼쪽 기둥이 「무엇을」(입고건 → 상품 → 지시 카드), 오른쪽이 「어디로」(도면 또는 표).
// 왼쪽을 그리드가 아니라 카드로 둔 이유는 PutawayOrderColumn 머리말에 있다.

const VIEW_KEY = 'wms-putaway-view';
const loadView = () => { try { return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'map'; } catch { return 'map'; } };
const saveView = (v) => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* 저장 못 해도 화면은 동작한다 */ } };

/** 지시 목록을 입고건별로 접는다 — 서버는 지시 1건씩 주고, 화면의 작업 단위인 입고건은 여기서 만든다 */
const groupByOrder = (tasks) => {
    const byOrder = new Map();
    for (const t of tasks) {
        const group = byOrder.get(t.ibNo) ?? {
            ibOrderId: t.ibOrderId, ibNo: t.ibNo, partnerNm: t.vndrNm ?? t.storeNm, receiptDt: t.receiptDt,
            remainingQty: 0, nearestExpiryDt: null, prodCds: new Set(), tmpZons: new Set(), tasks: [],
        };
        group.remainingQty += t.remainingQty;
        group.prodCds.add(t.prodCd);
        group.tmpZons.add(t.tmpZon);
        if (t.receiptDt && (!group.receiptDt || t.receiptDt < group.receiptDt)) group.receiptDt = t.receiptDt;
        // 서버가 유통기한 순으로 주므로 첫 값이 곧 최단이다 (미관리는 null로 뒤에 온다)
        if (group.nearestExpiryDt == null) group.nearestExpiryDt = t.expiryDt;
        group.tasks.push(t);
        byOrder.set(t.ibNo, group);
    }
    return [...byOrder.values()].map(g => ({ ...g, prodCount: g.prodCds.size, tmpZonList: [...g.tmpZons] }));
};

export default function Putaway() {
    // 입고일자 기본값은 비움(전체) — 적치는 미완료 지시가 전부 대상이고 오래된 게 오히려 급하다.
    // 7일로 자르면 놓친 지시가 조용히 안 보인다 (지시등록 화면의 7일 기본값과 다른 이유)
    const [cond, setCond] = useState({ ibNo: '', vndrNm: '', dateFrom: '', dateTo: '', prodCd: '' });
    const [tasks, setTasks] = useState([]);
    const [selectedIbNo, setSelectedIbNo] = useState(null);
    const [confirmSave, setConfirmSave] = useState(null); // 적치 저장 확인 모달 대상 (수량 입력된 지시들)
    // 저장이 서버에서 도는 동안(원격 DB라 6초를 넘기기도 한다) 버튼을 잠근다 — 다시 누르면 담아둔 지시 변경이
    // 한 번 더 changeLoc으로 나가 분할이 중복 생성된다. 실행은 서버가 「완료」로 거부하지만 변경은 막아주지 않는다
    const [saving, setSaving] = useState(false);
    const [view, setViewState] = useState(loadView); // map(창고 도면 — 기본) | table(표)
    const [mapKey, setMapKey] = useState(0); // 저장 후 맵 재조회 트리거 (적재가능수량이 바뀐다)
    // 왼쪽 카드와 오른쪽 도면을 잇는 상태 — 드래그 원천은 왼쪽, 드롭 대상은 오른쪽이라 여기서 든다
    const [dragTaskId, setDragTaskId] = useState(null);
    const [hoverLocCd, setHoverLocCd] = useState(null);   // 카드 hover → 도면의 그 칸
    const [hoverTask, setHoverTask] = useState(null);     // 카드 hover → 도면의 추천 순위(끌기 전에 판단한다)
    const [hoverCellCd, setHoverCellCd] = useState(null); // 칸 hover → 그리로 가는 카드
    const [focusLoc, setFocusLoc] = useState(null);       // 카드 클릭 → 도면 이동 요청 { locCd, seq }

    const setView = (v) => { setViewState(v); saveView(v); };

    const orderRows = useMemo(() => groupByOrder(tasks), [tasks]);
    const selectedOrder = orderRows.find(g => g.ibNo === selectedIbNo) ?? null;
    // 분할 예정 행(_virtualOf)은 끌 수 없다 — 담아두기는 원 지시 단위라 원 행을 다시 끌어야 고쳐진다
    const dragTask = selectedOrder?.tasks.find(t => t.putawayTaskId === dragTaskId && !t._virtualOf) ?? null;

    // 표 탭: 선택 입고건의 지시들 — 어떤 상품을 어디에 얼마씩 넣는지가 한눈에 보여야 한 번 들고 나가 나눠 넣는다.
    // [무엇을(상품) → 어디로(로케이션) → 얼마나(지시·완료·잔여) → 이번에 옮길 수량] 순이고 근거(Lot·유통기한)는 뒤로
    const taskColumnDefs = [
        { field: 'prodCd', headerName: '상품 코드', width: 105, cellClass: 'text-slate-500' },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 150 },
        {
            field: 'tmpZon', headerName: '온도대', width: 80,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
        },
        {
            // 이 화면의 핵심 정보 — 작업자는 여기 적힌 로케이션으로만 물건을 넣는다.
            // 자리에 못 넣는 상황(파손·실물 점유)은 도면에서 지시 자체를 고친 뒤 실행한다 — 목적지를 바꾸는 자리는
            // 도면 하나다. 한때 여기 연필로 후보 목록 팝업을 열었는데, 수량이 잔여 전량으로 시작해 후보 대부분이
            // 「부족」으로 죽어 있어 왜 못 고르는지 알 수 없었다(2026-08-26). 도면은 놓는 순간 적재가능만큼으로 깎아준다
            field: 'toLocCd', headerName: '대상 로케이션', width: 200,
            headerTooltip: '지시된 적치 위치. 바꾸려면 [맵] — 카드를 도면 위 칸으로 끌어다 놓는다. 담아둔 변경은 [적치 저장]이 적치와 함께 반영한다',
            cellRenderer: (p) => {
                const pending = p.data._pendingLoc;
                const isVirtual = !!p.data._virtualOf;
                const staged = !!p.data._stagedLoc;
                return (
                    <div className="flex items-center gap-1.5">
                        <span className={`font-mono font-bold ${pending ? 'text-amber-600' : 'text-indigo-700'}`}>
                            {pending ? pending.locCd : p.value}
                        </span>
                        {pending && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold shrink-0">
                                {isVirtual ? '분할 예정' : '변경 예정'}
                            </span>
                        )}
                        {!isVirtual && (
                            <button
                                title="맵에서 변경 — 도면으로 넘어가 이 지시의 칸을 보여준다"
                                onClick={() => jumpToMap(p.data)}
                                className="text-slate-300 hover:text-indigo-600"
                            >
                                <MapPin size={13} />
                            </button>
                        )}
                        {staged && !isVirtual && (
                            <button
                                title="담아둔 변경 취소"
                                onClick={() => unstageLoc(p.data)}
                                className="text-slate-300 hover:text-rose-500"
                            >
                                <Undo2 size={13} />
                            </button>
                        )}
                    </div>
                );
            },
        },
        {
            field: 'drctQty', headerName: '지시', width: 84,
            cellClass: 'ag-right-aligned-cell tabular-nums font-medium', valueFormatter: (p) => num(p.value),
        },
        {
            field: 'cmplQty', headerName: '완료', width: 84,
            cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 0 ? 'text-emerald-600 font-bold' : 'text-slate-300'}`,
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'remainingQty', headerName: '잔여', width: 84,
            headerTooltip: '잔여 = 지시 - 완료. 이번에 실행할 수 있는 상한',
            cellClass: 'ag-right-aligned-cell tabular-nums font-bold text-amber-600',
            valueFormatter: (p) => num(p.value),
        },
        {
            field: '_execQty', headerName: '적치수량', width: 96, editable: true,
            cellDataType: 'number',
            cellEditor: 'agNumberCellEditor', cellEditorParams: { min: 1, precision: 0 },
            valueFormatter: (p) => num(p.value),
            // 잔여 초과 상태인 동안 셀을 붉게 — 토스트는 사라져도 안 고친 행이 계속 눈에 걸린다
            cellClass: (p) => Number(p.value) > p.data.remainingQty
                ? 'ag-right-aligned-cell bg-rose-50 text-rose-600 font-bold'
                : 'ag-right-aligned-cell bg-indigo-50',
            headerTooltip: '이번에 옮길 수량 — 기본값은 잔여 전량, 일부만 옮겼으면 고치고, 안 옮길 행은 지워서 제외',
        },
        { field: 'lotNo', headerName: 'Lot번호', width: 130, cellClass: 'text-slate-500' },
        {
            field: 'expiryDt', headerName: '유통기한', width: 104,
            cellRenderer: (p) => (p.value ? fmtDe(p.value) : <span className="text-slate-400">미관리</span>),
        },
    ];

    // keepOrder면 선택을 유지한다 — 재조회 뒤에도 같은 입고건이 남아 있으면 그대로 펼쳐진 채다(전량 적치되면 목록에서 빠진다)
    /**
     * 목록 재조회. keepIbNo가 결과에 남아 있으면 그 입고건을 그대로 펼쳐 두고(부분 적치 뒤 이어서 작업),
     * 사라졌는데 advance면 다음 입고건으로 넘어간다 — 목록이 유통기한 임박순이라 맨 앞이 곧 다음 차례다.
     * advance가 없으면(조회 버튼) 선택을 비운다 — 조건을 다시 잡는 중이라 임의로 골라주면 놀란다.
     */
    const fetchList = async ({ keepIbNo = null, advance = false } = {}) => {
        try {
            const data = await putawayApi.tasks({ status: 'DIRECTED', ...cond });
            // 적치수량 편집 기본값 = 잔여 전량 — 부분 실행할 때만 고친다
            const rows = data.map(t => ({ ...t, _execQty: t.remainingQty }));
            setTasks(rows);
            setMapKey(k => k + 1); // 지시가 바뀌면 유입 잔량도 바뀌어 적재가능수량이 어긋난다

            const ibNos = [...new Set(rows.map(t => t.ibNo))];
            if (keepIbNo && ibNos.includes(keepIbNo)) return;
            setSelectedIbNo(advance ? (ibNos[0] ?? null) : null);
        } catch (e) {
            toast.error(e.message || '조회에 실패했습니다.');
        }
    };

    useEffect(() => {
        let ignore = false;
        putawayApi.tasks({ status: 'DIRECTED' }).then(data => {
            if (!ignore) setTasks(data.map(t => ({ ...t, _execQty: t.remainingQty })));
        }).catch(() => {});
        return () => { ignore = true; };
    }, []);

    // 적치수량 초과는 적는 순간(편집 확정 시점) 한 번 알린다 — 값을 잔여로 깎아주지는 않는다.
    // 조용한 자동 수정은 그럴듯한 오답을 깔아주는 것(제조일자 기본값을 뺀 것과 같은 원칙).
    // 셀 붉은 표시가 남아 있고, [적치 저장] 검증과 서버 검증이 뒤를 받친다
    const onTaskCellValueChanged = (e) => {
        if (e.colDef.field !== '_execQty') return;
        if (Number(e.newValue) > e.data.remainingQty) {
            toast.error(`적치수량이 잔여수량(${num(e.data.remainingQty)})을 초과했습니다.`);
        }
    };

    // ── 로케이션 변경·분할 — 지시받은 자리에 못 넣을 때 지시 자체를 고친다 (실행은 여전히 지시대로).
    //    도면에서 끌어다 놓으면 화면에 담아두기만 하고, 서버 반영은 [적치 저장]이 변경과 실행을 이어서 한다.
    //    저장 전에는 조회만 다시 해도 원상복구다 ──

    /** 표에서 「맵에서 변경」 — 도면 탭으로 넘어가며 그 지시의 카드와 칸을 함께 켜고 칸까지 스크롤한다 */
    const jumpToMap = (task) => {
        const locCd = targetLocOf(task);
        setView('map');
        setHoverCellCd(locCd);
        setHoverLocCd(locCd);
        setFocusLoc(prev => ({ locCd, seq: (prev?.seq ?? 0) + 1 }));
    };

    /** 행 목록에서 taskId의 담아둔 변경을 걷어낸 사본 — 분할 예정 행 제거 + 원 행 복원 */
    const clearStage = (rows, taskId) => rows
        .filter(r => r._virtualOf !== taskId)
        .map(r => r.putawayTaskId === taskId
            ? {
                ...r, _pendingLoc: null, _stagedLoc: null, _stagedQty: null,
                remainingQty: r.drctQty - r.cmplQty, _execQty: r.drctQty - r.cmplQty,
            }
            : r);

    /**
     * 지시 변경 담아두기 — 도면의 드롭이 부른다. loc은 `{ locId, locCd }`면 되고(맵 행이 그 모양이다),
     * 서버 반영은 여기서 하지 않는다. 담겼으면 true.
     */
    const stageLoc = (task, loc, qty) => {
        const n = Number(qty);
        const baseRemaining = task.drctQty - task.cmplQty; // 서버 기준 잔여 (담아둔 분할과 무관)
        if (!(n > 0) || !Number.isInteger(n)) {
            toast.error('변경 수량은 1 이상 정수여야 합니다.');
            return false;
        }
        if (n > baseRemaining) {
            toast.error(`변경 수량이 잔여수량(${num(baseRemaining)})을 초과했습니다.`);
            return false;
        }
        if (!loc) {
            toast('변경할 로케이션을 선택하세요.');
            return false;
        }
        setTasks(prev => clearStage(prev, task.putawayTaskId).flatMap(r => {
            if (r.putawayTaskId !== task.putawayTaskId) return [r];
            if (n === baseRemaining && r.cmplQty === 0) {
                // 전량·미실행 — 목적지만 바꿔 담는다
                return [{ ...r, _pendingLoc: loc, _stagedLoc: loc, _stagedQty: n }];
            }
            // 분할 — 원 행 잔여를 줄이고 분할 예정 행을 바로 아래에 끼운다
            const rest = baseRemaining - n;
            return [
                { ...r, _stagedLoc: loc, _stagedQty: n, remainingQty: rest, _execQty: rest > 0 ? rest : '' },
                {
                    ...r, putawayTaskId: `v-${r.putawayTaskId}`, _virtualOf: r.putawayTaskId,
                    _pendingLoc: loc, _stagedLoc: null, _stagedQty: null, _fromLocCd: r.toLocCd,
                    drctQty: n, cmplQty: 0, remainingQty: n, _execQty: n,
                },
            ];
        }));
        return true;
    };

    const unstageLoc = (task) => setTasks(prev => clearStage(prev, task.putawayTaskId));

    /**
     * 이번에 옮길 수량 — 카드와 표가 같은 `_execQty`를 고친다. 문자열 그대로 둔다:
     * 빈 값이 「이 지시는 이번에 제외」라는 뜻이라(검수 저장과 같은 규칙) 0으로 눌러버리면 안 된다.
     */
    const setExecQty = (task, value) => setTasks(prev => prev.map(r =>
        r.putawayTaskId === task.putawayTaskId ? { ...r, _execQty: value } : r));

    // ── 적치 저장 (일괄 실행) — 그리드에 입력 → 저장 → 확인 모달, 검수·이동확정과 같은 패턴 ──
    // 적치수량 기본값이 잔여 전량이라 아무것도 안 고치고 저장하면 곧 전량 적치다 (별도 전량 버튼을 안 두는 이유).
    // 안 옮길 행은 수량을 지운다 — 빈 값 = 제외 (검수 저장의 「입력한 라인만」 규칙과 동일)
    const handleSaveClick = () => {
        if (!selectedOrder) {
            toast('적치할 입고건을 선택하세요.');
            return;
        }
        const targets = selectedOrder.tasks.filter(t => String(t._execQty ?? '').trim() !== '');
        const staged = selectedOrder.tasks.filter(t => t._pendingLoc); // 담아둔 지시 변경 (전량 변경 원 행 + 분할 예정 행)
        if (targets.length === 0 && staged.length === 0) {
            toast('적치수량을 입력한 지시가 없습니다.');
            return;
        }
        for (const t of targets) {
            const n = Number(t._execQty);
            if (!(n > 0) || !Number.isInteger(n)) {
                toast.error(`적치수량은 1 이상 정수여야 합니다: ${t.prodNm} → ${targetLocOf(t)}`);
                return;
            }
            if (n > t.remainingQty) {
                toast.error(`적치수량이 잔여수량(${num(t.remainingQty)})을 초과했습니다: ${t.prodNm} → ${targetLocOf(t)}`);
                return;
            }
        }
        setConfirmSave({ targets, staged });
    };

    // 지시 변경(건별 트랜잭션)이 먼저, 실행(전체 한 트랜잭션)이 뒤 — 실행이 실패해도 지시는
    // 유효하게 바뀐 상태라 재조회 후 다시 저장하면 이어진다
    const doSave = async ({ targets, staged }) => {
        if (saving) return;
        setSaving(true);
        const totalQty = targets.reduce((s, t) => s + Number(t._execQty), 0);
        try {
            const idByRow = new Map(); // 화면 행 키 → 실행할 서버 지시 id (분할이면 새 지시)
            for (const s of staged) {
                const serverTaskId = s._virtualOf ?? s.putawayTaskId;
                const qty = s._virtualOf ? s.drctQty : null; // null = 잔여 전량 (전량 변경)
                const executableId = await putawayApi.changeLoc(serverTaskId, s._pendingLoc.locId, qty);
                idByRow.set(s.putawayTaskId, executableId ?? serverTaskId);
            }
            if (targets.length > 0) {
                await putawayApi.executeAll(targets.map(t => ({
                    taskId: idByRow.get(t.putawayTaskId) ?? t.putawayTaskId,
                    qty: Number(t._execQty),
                })));
            }
            const changed = staged.length > 0 ? `지시 변경 ${staged.length}건 · ` : '';
            toast.success(targets.length > 0
                ? `${changed}${num(totalQty)}개를 ${new Set(targets.map(targetLocOf)).size}개 로케이션에 적치했습니다.`
                : `지시 변경 ${staged.length}건을 반영했습니다.`);
            // 잔여가 남으면 같은 입고건 선택을 유지해 이어서 처리한다 (전량이면 입고건이 목록에서 빠진다)
            // 잔여가 남았으면 같은 입고건이 그대로 펼쳐지고, 전량이면 목록에서 빠지므로 다음 입고건으로 이어간다
            fetchList({ keepIbNo: selectedOrder.ibNo, advance: true });
        } catch (e) {
            toast.error(e.message || '적치 저장에 실패했습니다.');
            // 지시 변경이 일부 반영됐을 수 있어 서버 상태로 재동기화한다
            fetchList({ keepIbNo: selectedOrder.ibNo });
        } finally {
            setSaving(false);
        }
    };

    const orderLabel = selectedOrder
        ? `${selectedOrder.ibNo} · ${selectedOrder.partnerNm ?? '—'} — ${selectedOrder.prodCount}개 상품 · 잔여 ${num(selectedOrder.remainingQty)}개`
        : null;

    return (
        // min-h — 노트북처럼 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <PackageOpen size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">적치</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    발행된 적치지시를 실행 — 지시받은 로케이션으로만 적치(부분 실행 허용)
                </span>
            </div>

            {/* 검색 조건 — 대상 로케이션은 두지 않는다. 이 화면의 축은 입고건이고 로케이션은 그 결과다.
                조건으로 걸면 입고건 잔여가 그 로케이션 몫만 더해 실제와 달라진다.
                「이 로케이션에 뭐가 걸렸나」는 지시 단위 목록인 적치지시 관리 화면이 답한다 */}
            <SearchBar label="검색" cond={cond} setCond={setCond} onSearch={() => fetchList()}>
                <SearchText name="ibNo" label="입고번호" placeholder="IB-20260717-001" />
                <SearchText name="vndrNm" label="상대처" placeholder="벤더 또는 점포" />
                <SearchDateRange from="dateFrom" to="dateTo" label="입고일자" />
                <SearchProd name="prodCd" />
            </SearchBar>

            <div className="flex gap-3 flex-1 min-h-0">
                {/* 왼쪽 기둥: 입고건 → 상품 → 지시 카드 (「무엇을」) */}
                <div className="w-72 shrink-0 flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">적치할 입고건</span>
                        <span className="text-xs text-slate-400 truncate">유통기한 임박순</span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">{orderRows.length}건</span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                        <PutawayOrderColumn
                            orders={orderRows}
                            selectedIbNo={selectedIbNo}
                            onSelect={setSelectedIbNo}
                            dragTaskId={dragTaskId}
                            onDragStart={(t) => { setDragTaskId(t.putawayTaskId); setHoverLocCd(null); }}
                            onDragEnd={() => setDragTaskId(null)}
                            onHoverTask={(t) => { setHoverLocCd(t ? targetLocOf(t) : null); setHoverTask(t); }}
                            onClickTask={(t) => setFocusLoc(prev => ({ locCd: targetLocOf(t), seq: (prev?.seq ?? 0) + 1 }))}
                            litLocCd={hoverCellCd}
                            onUnstage={unstageLoc}
                            onExecQtyChange={setExecQty}
                        />
                    </div>
                </div>

                {/* 오른쪽: 선택 입고건의 지시 — 도면(기본) 또는 표 + 적치 저장 (「어디로」) */}
                <div className="flex-1 min-w-0 flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-slate-700 shrink-0">적치 위치</span>
                        <span className="text-xs text-slate-400 truncate">
                            {orderLabel ?? '왼쪽에서 입고건을 선택하세요'}
                        </span>
                        {/* 표/맵은 조건이 아니라 같은 지시를 보는 두 방식이다 — 담아둔 변경은 탭을 옮겨도 그대로 남는다 */}
                        <div className="ml-auto shrink-0 flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                            <button onClick={() => setView('map')}
                                    className={`flex items-center gap-1 px-2.5 py-1.5 ${view === 'map'
                                        ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <MapIcon size={13} /> 맵
                            </button>
                            <button onClick={() => setView('table')}
                                    className={`flex items-center gap-1 px-2.5 py-1.5 border-l border-slate-200 ${view === 'table'
                                        ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <Table2 size={13} /> 표
                            </button>
                        </div>
                        <button
                            onClick={handleSaveClick}
                            disabled={!selectedOrder || saving}
                            className="btn-primary shrink-0 disabled:opacity-40">
                            <Layers size={13} /> {saving ? '저장 중…' : '적치 저장'}
                        </button>
                    </div>
                    {/* 저장은 지시 변경(건별) + 실행(일괄)을 이어서 하고 DB가 원격이라 6초를 넘기기도 한다 —
                        버튼 라벨만으로는 멈춘 것처럼 보여서 도면 위에 덮어 진행 중임을 남긴다 */}
                    <div className="flex-1 min-h-0 relative">
                        {saving && (
                            <div className="absolute inset-0 z-20 bg-white/70 flex items-start justify-center pt-10">
                                <span className="flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-full shadow px-4 py-2">
                                    <Loader2 size={14} className="animate-spin text-indigo-600" />
                                    적치를 저장하는 중… 지시 변경과 실물 이동을 함께 처리합니다
                                </span>
                            </div>
                        )}
                        {view === 'map' ? (
                            selectedOrder
                                ? <PutawayLocMap tasks={selectedOrder.tasks}
                                                 dragTask={dragTask} onDragEnd={() => setDragTaskId(null)}
                                                 hoverLocCd={hoverLocCd} hoverTask={hoverTask} onHoverCell={setHoverCellCd}
                                                 focusLoc={focusLoc}
                                                 onStage={stageLoc} reloadKey={mapKey} />
                                : <p className="text-sm text-slate-400 py-8 text-center">왼쪽에서 입고건을 선택하세요</p>
                        ) : (
                            <AgGridReact
                                rowData={selectedOrder?.tasks ?? []}
                                columnDefs={taskColumnDefs}
                                getRowId={(p) => String(p.data.putawayTaskId)}
                                rowHeight={34}
                                headerHeight={38}
                                singleClickEdit={true}
                                stopEditingWhenCellsLoseFocus={true}
                                onCellValueChanged={onTaskCellValueChanged}
                                overlayNoRowsTemplate={'<span class="text-sm text-slate-400">왼쪽에서 입고건을 선택하세요</span>'}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* 적치 저장 확인 모달 — 행별 (상품, 로케이션, 수량)을 나열해 숫자를 보고 누르게 한다 */}
            {confirmSave && (
                <ConfirmModal
                    title="적치를 저장하시겠습니까?"
                    confirmText="적치"
                    onCancel={() => setConfirmSave(null)}
                    onConfirm={() => { doSave(confirmSave); setConfirmSave(null); }}
                >
                    <p className="text-sm text-slate-500">
                        {selectedOrder?.ibNo} · {selectedOrder?.partnerNm} · <b className="text-emerald-600">
                        {num(confirmSave.targets.reduce((s, t) => s + Number(t._execQty), 0))}개</b>
                    </p>
                    {confirmSave.staged.length > 0 && (
                        <div className="flex flex-col gap-1 text-xs font-mono bg-amber-50 rounded-lg px-3 py-2">
                            <span className="font-sans font-bold text-amber-700">지시 변경 {confirmSave.staged.length}건이 함께 반영됩니다</span>
                            {confirmSave.staged.map(s => (
                                <div key={s.putawayTaskId} className="flex justify-between gap-3">
                                    <span className="text-slate-500">
                                        <span className="font-sans text-slate-400">{s.prodNm} · </span>
                                        {s._fromLocCd ?? s.toLocCd} → <b className="text-amber-700">{s._pendingLoc.locCd}</b>
                                        {s._virtualOf && <span className="font-sans"> (분할)</span>}
                                    </span>
                                    <span className="tabular-nums text-slate-700">{num(s._virtualOf ? s.drctQty : s.remainingQty)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex flex-col gap-1 text-xs font-mono bg-slate-50 rounded-lg px-3 py-2">
                        {confirmSave.targets.map(t => (
                            <div key={t.putawayTaskId} className="flex justify-between gap-3">
                                <span className="text-slate-500">
                                    <span className="font-sans text-slate-400">{t.prodNm} · </span>
                                    RCV-STAGE → <b className="text-indigo-700">{targetLocOf(t)}</b>
                                </span>
                                <span className="tabular-nums text-slate-700">
                                    {num(t._execQty)}
                                    {Number(t._execQty) < t.remainingQty && (
                                        <span className="text-amber-600"> (잔여 {num(t.remainingQty - t._execQty)} 남음)</span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-slate-400">
                        적치 {confirmSave.targets.length}건이 한 트랜잭션으로 처리됩니다 — 하나라도 실패하면 적치 전부가 되돌아갑니다.
                    </p>
                </ConfirmModal>
            )}

        </div>
    );
}
