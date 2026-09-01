import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Plus, Repeat, Send } from 'lucide-react';
import toast from 'react-hot-toast';

import { spmtApi } from '@/api/spmtApi';
import { zonApi } from '@/api/zonApi';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { num } from '@/utils/format';
import SearchBar, { SearchSelect, SearchProd, SearchLoc } from '@/components/common/SearchBar';
import SelectCellEditor from '@/components/common/SelectCellEditor';
import ConfirmModal from '@/components/common/ConfirmModal';
import { Badge } from '@/components/common/Badge';

// 정기 보충 — 피킹존 고정로케이션이 재보충점(min) 미달이면 보관존 재고를 상한(max)까지 채우는
// 이동지시(SPMT)를 발행한다. 여기는 산정·발행까지고, 실물 이동(확정)은 재고 이동 > 이동지시 관리 몫.
// 추천은 예약이 아니다 — 발행 시 서버가 부족량·가용을 같은 식으로 재검증한다.

const TEMP_ZONE_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(TEMP_ZONE_META).map(([value, m]) => ({ value, label: m.label })),
];

/** 배정 행의 합계 (수량 미입력 행 제외) */
const assignedSum = (t) => t._assignments.reduce((s, a) => s + (Number(a.qty) || 0), 0);

export default function StockSpmt() {
    const [cond, setCond] = useState({ zonCd: '', prodCd: '', locCd: '', tmpZon: '' });
    const [zonCodes, setZonCodes] = useState([]);
    const [targets, setTargets] = useState(null); // null = 아직 조회 전
    const [selectedFxngLocId, setSelectedFxngLocId] = useState(null);
    const [confirmIssue, setConfirmIssue] = useState(null);
    const targetGridRef = useRef(null);
    const assignGridRef = useRef(null);
    const keySeq = useRef(0);

    const selected = targets?.find(t => t.fxngLocId === selectedFxngLocId) ?? null;
    const totalShort = (targets ?? []).reduce((s, t) => s + t.shortQty, 0);
    const totalAssigned = (targets ?? []).reduce((s, t) => s + assignedSum(t), 0);

    const zonOptions = [{ value: '', label: '전체' }, ...zonCodes.map(z => ({ value: z.zonCd, label: z.zonCd }))];

    useEffect(() => {
        zonApi.list().then(setZonCodes);
        fetchTargets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchTargets = async () => {
        try {
            const data = await spmtApi.targets(cond);
            setTargets(data.map(t => ({
                ...t,
                _assignments: t.assignments.map(a => ({ _key: `a-${keySeq.current++}`, ...a })),
            })));
            setSelectedFxngLocId(null);
        } catch (e) {
            toast.error(e.message || '보충 대상 조회에 실패했습니다.');
        }
    };

    // ── 상단: 보충 대상 (min 미달 고정로케이션) ──
    const targetColumnDefs = useMemo(() => [
        {
            field: 'locCd', headerName: '고정로케이션', width: 140,
            cellClass: 'font-mono font-bold text-indigo-700',
        },
        { field: 'zonCd', headerName: '존', width: 90, cellClass: 'text-slate-500' },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 150 },
        {
            field: 'tmpZon', headerName: '온도대', width: 90,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
        },
        {
            field: 'minQty', headerName: '재보충점', width: 95,
            cellClass: 'ag-right-aligned-cell text-slate-500', valueFormatter: (p) => num(p.value),
        },
        {
            field: 'maxQty', headerName: '보충 상한', width: 95,
            cellClass: 'ag-right-aligned-cell text-slate-500', valueFormatter: (p) => num(p.value),
        },
        {
            field: 'onHandQty', headerName: '현재고', width: 90,
            cellClass: 'ag-right-aligned-cell font-medium', valueFormatter: (p) => num(p.value),
        },
        {
            field: 'inflowQty', headerName: '지시중', width: 90,
            headerTooltip: '이 자리로 오고 있는 미완료 지시(이동·적치) 잔량 — 부족량에서 이미 빠져 있다',
            cellClass: (p) => `ag-right-aligned-cell ${p.value > 0 ? 'text-sky-600 font-bold' : 'text-slate-300'}`,
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'shortQty', headerName: '부족량', width: 95,
            headerTooltip: '부족량 = 보충 상한 − 현재고 − 지시중. 이만큼 채우는 지시를 발행한다',
            cellClass: 'ag-right-aligned-cell font-bold text-amber-600',
            valueFormatter: (p) => num(p.value),
        },
        {
            headerName: '배정 합계', width: 95,
            valueGetter: (p) => assignedSum(p.data),
            cellClass: 'ag-right-aligned-cell font-bold text-emerald-600',
            valueFormatter: (p) => num(p.value),
        },
        {
            headerName: '미배정', width: 90,
            headerTooltip: '부족량 중 출발 재고를 못 찾은 수량 — 보관존 가용이 모자란다는 뜻',
            valueGetter: (p) => p.data.shortQty - assignedSum(p.data),
            cellClass: (p) => `ag-right-aligned-cell ${p.value > 0 ? 'text-rose-600 font-bold' : 'text-slate-300'}`,
            valueFormatter: (p) => num(p.value),
        },
    ], []);

    // ── 하단: 선택 대상의 배정 (FEFO 추천 — 원천·수량 보정 가능) ──
    const srcLabelByInvId = useMemo(() => {
        if (!selected) return {};
        return Object.fromEntries(selected.sources.map(s =>
            [String(s.invId), `${s.fromLocCd} · ${s.lotNo} (가용 ${num(s.avalQty)})`]));
    }, [selected]);

    const assignColumnDefs = useMemo(() => [
        {
            field: 'invId', headerName: '출발 재고 (보관존)', flex: 1, minWidth: 220, editable: true,
            headerTooltip: 'FEFO(유통기한 임박순) 추천 — 다른 보관 재고로 바꿀 수 있다. 고정로케이션 자리는 후보에서 빠진다',
            cellEditor: SelectCellEditor,
            cellEditorParams: () => ({
                values: (selected?.sources ?? []).map(s => String(s.invId)),
                labelMap: srcLabelByInvId,
                placeholder: '원천 선택',
            }),
            cellClass: 'bg-indigo-50',
            cellRenderer: (p) => (p.value
                ? <span className="font-mono text-xs text-indigo-700 font-bold">{srcLabelByInvId[String(p.value)] ?? p.value}</span>
                : <span className="text-rose-500 font-bold text-xs">원천 선택 필요</span>),
        },
        {
            field: 'expiryDt', headerName: '유통기한', width: 110,
            cellRenderer: (p) => p.value ?? <span className="text-slate-400">미관리</span>,
        },
        {
            field: 'avalQty', headerName: '가용', width: 90,
            headerTooltip: '출발 재고의 가용수량(보유 − 예약 − 보류) — 배정 상한',
            cellClass: 'ag-right-aligned-cell font-bold text-emerald-600',
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'qty', headerName: '보충수량', width: 100, editable: true,
            headerTooltip: '이 원천에서 옮길 수량 — 비우면 발행에서 제외',
            cellClass: 'ag-right-aligned-cell bg-indigo-50 font-bold',
            cellRenderer: (p) => (p.value == null || p.value === ''
                ? <span className="text-slate-300 font-normal">—</span>
                : num(p.value)),
        },
    ], [selected, srcLabelByInvId]);

    const onTargetSelectionChanged = (e) => {
        const node = e.api.getSelectedNodes()[0];
        setSelectedFxngLocId(node ? node.data.fxngLocId : null);
    };

    const updateAssignments = (fxngLocId, mapper) => {
        setTargets(prev => prev.map(t => (t.fxngLocId === fxngLocId
            ? { ...t, _assignments: mapper(t._assignments) }
            : t)));
    };

    const onAssignCellValueChanged = (e) => {
        if (!selected) return;
        const key = e.data._key;
        updateAssignments(selected.fxngLocId, rows => rows.map(r => {
            if (r._key !== key) return r;
            if (e.colDef.field === 'invId') {
                // 원천을 바꾸면 표시 필드(Lot·유통기한·가용)를 그 재고의 값으로 갈아끼운다
                const source = selected.sources.find(s => String(s.invId) === String(e.data.invId));
                return source
                    ? { ...r, invId: source.invId, fromLocCd: source.fromLocCd, lotNo: source.lotNo,
                        expiryDt: source.expiryDt, avalQty: source.avalQty }
                    : { ...r, invId: '' };
            }
            const raw = e.data.qty;
            return { ...r, qty: raw === '' || raw == null ? null : Number(raw) };
        }));
    };

    const addAssignRow = () => {
        if (!selected) return;
        updateAssignments(selected.fxngLocId, rows => [...rows,
            { _key: `a-${keySeq.current++}`, invId: '', fromLocCd: '', lotNo: '', expiryDt: null, avalQty: 0, qty: null }]);
    };

    // ── 발행 ──
    // 전 대상의 배정을 한 번에 모은다. 발행이 전량 롤백이라 에러는 모아서 한 번에 알린다
    const collectItems = () => {
        const items = [];
        const errors = [];
        const usedByInv = new Map(); // 같은 원천을 여러 대상이 쓰는 합계 — 가용 초과를 클라이언트에서도 잡는다
        for (const t of targets ?? []) {
            let sum = 0;
            for (const a of t._assignments) {
                if (a.qty == null || a.qty === '') continue; // 빈 값 = 제외
                const n = Number(a.qty);
                if (!a.invId) {
                    errors.push(`${t.locCd}: 출발 재고를 선택하세요.`);
                    continue;
                }
                const where = `${t.locCd} ← ${a.fromLocCd}`;
                if (!(n > 0) || !Number.isInteger(n)) {
                    errors.push(`${where}: 보충수량은 1 이상 정수여야 합니다.`);
                    continue;
                }
                const used = (usedByInv.get(a.invId) ?? 0) + n;
                if (used > a.avalQty) {
                    errors.push(`${where}: 가용재고(${num(a.avalQty)})를 초과했습니다 (다른 대상 배정 포함).`);
                }
                usedByInv.set(a.invId, used);
                sum += n;
                items.push({ invId: a.invId, toLocId: t.locId, qty: n, locCd: t.locCd, prodCd: t.prodCd, fromLocCd: a.fromLocCd, lotNo: a.lotNo });
            }
            if (sum > t.shortQty) {
                errors.push(`${t.locCd}: 배정 합(${num(sum)})이 부족량(${num(t.shortQty)})을 초과했습니다.`);
            }
        }
        return { items, errors };
    };

    const handleIssueClick = () => {
        targetGridRef.current?.api.stopEditing();
        assignGridRef.current?.api.stopEditing();
        const { items, errors } = collectItems();
        if (errors.length > 0) {
            toast.error(errors.join('\n'), { style: { whiteSpace: 'pre-line' } });
            return;
        }
        if (items.length === 0) {
            toast('발행할 배정이 없습니다 — 대상을 조회하고 수량을 확인하세요.');
            return;
        }
        setConfirmIssue(items);
    };

    const doIssue = async (items) => {
        try {
            const movNos = await spmtApi.issue(items.map(i => ({ invId: i.invId, toLocId: i.toLocId, qty: i.qty })));
            toast.success(`보충지시 ${movNos.length}건을 발행했습니다 (${movNos.join(', ')}).`);
            fetchTargets(); // 유입 잔량이 반영돼 발행분만큼 대상에서 빠진다
        } catch (e) {
            // 전량 롤백이라 서버 값은 그대로 — 입력을 살려둬야 지적된 행만 고쳐 다시 시도할 수 있다
            toast.error(e.message || '보충지시 발행에 실패했습니다.');
        }
    };

    return (
        // min-h — 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Repeat size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">정기 보충</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    재보충점(min) 미달인 피킹존 고정로케이션을 보관존 재고로 상한(max)까지 — 발행만 하고 실물 이동은 「재고 이동」에서 확정
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchTargets}>
                <SearchSelect name="zonCd" label="존" options={zonOptions} />
                <SearchProd name="prodCd" />
                <SearchLoc name="locCd" />
                <SearchSelect name="tmpZon" label="온도대" options={TEMP_ZONE_OPTIONS} />
            </SearchBar>

            <PanelGroup direction="vertical" autoSaveId="wms-spmt-split-v1" className="flex-1 min-h-0">
                {/* 상단: 보충 대상 */}
                <Panel defaultSize={50} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-slate-700 shrink-0">보충 대상</span>
                        <span className="text-xs text-slate-400 truncate">
                            현재고+지시중이 재보충점 미달인 자리 — 행을 고르면 아래에서 원천·수량을 보정합니다
                        </span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">
                            {targets == null ? '조회 전' : `${num(targets.length)}곳 · 부족 ${num(totalShort)} · 배정 ${num(totalAssigned)}`}
                        </span>
                        <button
                            onClick={handleIssueClick}
                            disabled={!targets || targets.length === 0}
                            className="flex items-center gap-1 px-4 py-2 bg-emerald-600 rounded-lg text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-40 shrink-0">
                            <Send size={13} /> 보충지시 발행
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={targetGridRef}
                            rowData={targets ?? []}
                            columnDefs={targetColumnDefs}
                            getRowId={(p) => String(p.data.fxngLocId)}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                            onSelectionChanged={onTargetSelectionChanged}
                            overlayNoRowsTemplate={targets == null
                                ? '<span class="text-sm text-slate-400">[조회]를 눌러 재보충점 미달 자리를 확인하세요</span>'
                                : '<span class="text-sm text-slate-400">보충할 자리가 없습니다 — 모든 고정로케이션이 재보충점 이상입니다</span>'}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                {/* 하단: 선택 대상의 배정 보정 */}
                <Panel defaultSize={50} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-slate-700 shrink-0">원천 배정</span>
                        <span className="text-xs text-slate-400 truncate">
                            {selected
                                ? `${selected.locCd} · ${selected.prodNm} — 부족 ${num(selected.shortQty)}개, FEFO 추천을 확인하고 필요하면 원천·수량을 고치세요 (수량을 지우면 제외)`
                                : '위에서 보충 대상을 선택하세요'}
                        </span>
                        <button
                            onClick={addAssignRow}
                            disabled={!selected}
                            className="flex items-center gap-1 ml-auto px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-40 shrink-0">
                            <Plus size={12} /> 원천 추가
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={assignGridRef}
                            rowData={selected?._assignments ?? []}
                            columnDefs={assignColumnDefs}
                            getRowId={(p) => p.data._key}
                            rowHeight={34}
                            headerHeight={38}
                            singleClickEdit={true}
                            stopEditingWhenCellsLoseFocus={true}
                            onCellValueChanged={onAssignCellValueChanged}
                            overlayNoRowsTemplate={selected
                                ? '<span class="text-sm text-slate-400">원천 후보가 없습니다 — 보관존에 이 상품의 가용재고가 없습니다</span>'
                                : '<span class="text-sm text-slate-400">위에서 보충 대상을 선택하세요</span>'}
                        />
                    </div>
                </Panel>
            </PanelGroup>

            {/* 발행 확인 모달 */}
            {confirmIssue && (
                <ConfirmModal
                    title="보충지시를 발행하시겠습니까?"
                    confirmText="발행"
                    onCancel={() => setConfirmIssue(null)}
                    onConfirm={() => { const t = confirmIssue; setConfirmIssue(null); doIssue(t); }}
                >
                    <p className="text-sm text-slate-500">
                        대상 <b className="text-slate-700">{new Set(confirmIssue.map(i => i.toLocId)).size}곳</b> · 지시 <b className="text-slate-700">{confirmIssue.length}건</b> · 총 <b className="text-emerald-600">{num(confirmIssue.reduce((s, i) => s + i.qty, 0))}개</b>
                    </p>
                    <div className="flex flex-col gap-1 text-xs font-mono bg-slate-50 rounded-lg px-3 py-2 max-h-64 overflow-y-auto">
                        {confirmIssue.map((i, idx) => (
                            <div key={idx} className="flex justify-between gap-3">
                                <span className="text-slate-500">
                                    {i.fromLocCd} → <b className="text-indigo-700">{i.locCd}</b>
                                    <span className="font-sans text-slate-400"> · {i.prodCd} · {i.lotNo}</span>
                                </span>
                                <span className="tabular-nums text-slate-700">{num(i.qty)}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-slate-400">
                        발행 즉시 출발 재고가 예약되고, 실물 이동은 「재고 이동 › 이동지시 관리」에서 확정합니다.
                        전체가 한 트랜잭션 — 하나라도 실패하면 전부 되돌아갑니다.
                    </p>
                </ConfirmModal>
            )}
        </div>
    );
}
