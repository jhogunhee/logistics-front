import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ArrowLeft, Ban, CheckCircle2, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import ConfirmModal from '@/components/common/ConfirmModal';
import DropdownSelect from '@/components/common/DropdownSelect';
import ProdPickerModal from '@/components/common/ProdPickerModal';
import SelectCellEditor from '@/components/common/SelectCellEditor';
import { Badge } from '@/components/common/Badge';
import { adjQtyOf, invStktkApi, ETC_RSN_CD } from '@/api/invStktkApi';
import { codeApi } from '@/api/codeApi';
import { locApi } from '@/api/locApi';
import { lotApi } from '@/api/lotApi';
import { INV_STKTK_STATUS_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { fmtDt, num } from '@/utils/format';

/** 전산수량 기준값 — 확정 후에는 확정시점 값이 고정 기준이다 */
const baseQtyOf = (ln) => ln.cfmSysQty ?? ln.nowSysQty;

export default function StockCountDetail({ stktkId, onBack }) {
    const [head, setHead] = useState(null);
    const [lines, setLines] = useState([]);
    const [rsnCodes, setRsnCodes] = useState([]);
    const [selectedLn, setSelectedLn] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [addForm, setAddForm] = useState({ prod: null, locId: '', lotId: '' });
    const [addLots, setAddLots] = useState([]);
    const [storageLocs, setStorageLocs] = useState([]);
    const [prodPickerOpen, setProdPickerOpen] = useState(false);
    const gridRef = useRef(null);
    // 서버에서 받은 원본 값 (lnId → 입력 3필드). 저장 시 「바뀐 라인만」 보내는 기준이다 —
    // 전 라인을 보내면 둘이 같은 조사를 열었을 때 손대지도 않은 라인까지 낡은 값으로 덮어쓴다.
    const pristineRef = useRef({});

    const editable = head?.status === 'CREATED';

    const snapshotPristine = (lns) => {
        pristineRef.current = Object.fromEntries(lns.map(l => [
            l.lnId,
            { stktkQty: l.stktkQty ?? null, rsnCd: l.rsnCd ?? null, rsnDscr: l.rsnDscr ?? null },
        ]));
    };

    const reload = useCallback(async () => {
        const data = await invStktkApi.detail(stktkId);
        setHead(data);
        setLines(data.lines);
        snapshotPristine(data.lines);
        setSelectedLn(null);
    }, [stktkId]);

    useEffect(() => {
        let ignore = false;
        invStktkApi.detail(stktkId).then(data => {
            if (ignore) return;
            setHead(data);
            setLines(data.lines);
            snapshotPristine(data.lines);
            setSelectedLn(null);
        });
        codeApi.list('ADJ_RSN').then(codes => { if (!ignore) setRsnCodes(codes); });
        locApi.list({ locTyp: 'STORAGE' }).then(locs => { if (!ignore) setStorageLocs(locs); });
        return () => { ignore = true; };
    }, [stktkId]);

    const rsnNmByCd = useMemo(
        () => Object.fromEntries(rsnCodes.map(c => [c.codeCd, c.codeNm])),
        [rsnCodes],
    );

    // 화면 요약 — 상태가 아니라 수량에서 파생한다 (「부분입력」 같은 상태를 두지 않는 것과 같은 이유)
    const summary = useMemo(() => {
        const counted = lines.filter(l => l.stktkQty != null);
        const diffs = counted.map(l => ({ ln: l, adj: adjQtyOf(l) })).filter(d => d.adj !== 0);
        return {
            total: lines.length,
            counted: counted.length,
            diffCnt: diffs.length,
            plus: diffs.filter(d => d.adj > 0).reduce((s, d) => s + d.adj, 0),
            minus: diffs.filter(d => d.adj < 0).reduce((s, d) => s + d.adj, 0),
            changedCnt: lines.filter(l => l.cfmSysQty == null && l.nowSysQty !== l.sysQty).length,
            missingRsn: diffs.filter(d => !d.ln.rsnCd || (d.ln.rsnCd === ETC_RSN_CD && !String(d.ln.rsnDscr ?? '').trim())),
        };
    }, [lines]);

    const columnDefs = useMemo(() => [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        { field: 'locCd', headerName: '로케이션', width: 130 },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 150 },
        {
            field: 'tmpZon', headerName: '온도대', width: 90,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
        },
        { field: 'lotNo', headerName: 'Lot번호', width: 130 },
        {
            field: 'expiryDt', headerName: '유통기한', width: 105,
            cellRenderer: (p) => p.value ?? <span className="text-slate-400">미관리</span>,
        },
        {
            field: 'sysQty', headerName: '조사시점', width: 90,
            headerTooltip: '조사를 만든 시점의 전산수량 스냅샷. 조정 계산 기준이 아니라 「시작할 때는 얼마였나」의 기록',
            cellClass: 'ag-right-aligned-cell text-slate-500',
            valueFormatter: (p) => num(p.value),
        },
        {
            headerName: head?.status === 'CONFIRMED' ? '확정시점 전산' : '현재 전산', width: 115,
            headerTooltip: head?.status === 'CONFIRMED'
                ? '확정 시점에 재고 행 락을 걸고 다시 읽은 전산수량 = 조정전수량'
                : '지금의 전산수량. 확정은 이 값을 그 시점에 다시 읽어 조정수량을 정한다 — 조사시점과 다르면 조사 중 재고가 변한 것',
            valueGetter: (p) => baseQtyOf(p.data),
            cellClass: (p) => {
                const changed = p.data.cfmSysQty == null && p.data.nowSysQty !== p.data.sysQty;
                return `ag-right-aligned-cell font-medium ${changed ? 'text-amber-600 font-bold' : ''}`;
            },
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'alocQty', headerName: '예약', width: 80,
            headerTooltip: '실사수량이 예약+보류보다 적으면 확정이 막힌다 — 할당 해제·이동지시 취소를 먼저 해야 한다',
            cellClass: (p) => `ag-right-aligned-cell ${p.value > 0 ? 'text-amber-600 font-bold' : 'text-slate-300'}`,
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'hldQty', headerName: '보류', width: 80,
            cellClass: (p) => `ag-right-aligned-cell ${p.value > 0 ? 'text-rose-600 font-bold' : 'text-slate-300'}`,
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'stktkQty', headerName: '실사수량', width: 100, editable,
            headerTooltip: '실물을 센 수량. 비우면 「미조사」로 확정에서 건너뛴다 (0 = 실물 없음과 다르다)',
            cellClass: (p) => `ag-right-aligned-cell font-bold ${editable ? 'bg-indigo-50' : ''}`,
            cellRenderer: (p) => p.value == null || p.value === ''
                ? <span className="text-slate-300">미조사</span>
                : num(p.value),
        },
        {
            headerName: '조정수량', width: 100,
            headerTooltip: '실사수량 − 전산수량. 확정 시 이 수량이 ADJUST로 기록된다 (0이면 이력을 남기지 않는다)',
            valueGetter: (p) => adjQtyOf(p.data),
            cellClass: (p) => {
                if (p.value == null || p.value === 0) return 'ag-right-aligned-cell text-slate-300';
                return `ag-right-aligned-cell font-bold ${p.value > 0 ? 'text-emerald-600' : 'text-rose-600'}`;
            },
            valueFormatter: (p) => (p.value == null ? '' : p.value > 0 ? `+${num(p.value)}` : num(p.value)),
        },
        {
            field: 'rsnCd', headerName: '조정사유', width: 120, editable,
            headerTooltip: '차이가 있는 라인만 필수. 차이 0 라인은 조정 자체가 없어 사유도 없다',
            cellEditor: SelectCellEditor,
            cellEditorParams: { values: rsnCodes.map(c => c.codeCd), labelMap: rsnNmByCd, placeholder: '사유 선택' },
            cellClass: editable ? 'bg-indigo-50' : '',
            cellRenderer: (p) => {
                const adj = adjQtyOf(p.data);
                if (!p.value) {
                    return adj != null && adj !== 0
                        ? <span className="text-rose-500 font-bold">사유 필요</span>
                        : <span className="text-slate-300">—</span>;
                }
                return <span>{rsnNmByCd[p.value] ?? p.value}</span>;
            },
        },
        {
            field: 'rsnDscr', headerName: '기타 사유', width: 180,
            editable: (p) => editable && p.data.rsnCd === ETC_RSN_CD,
            headerTooltip: '사유가 「기타」일 때만 입력한다 (그 외 코드에서는 서버가 무시)',
            cellClass: (p) => (editable && p.data.rsnCd === ETC_RSN_CD ? 'bg-indigo-50' : ''),
            cellRenderer: (p) => p.data.rsnCd === ETC_RSN_CD
                ? (p.value || <span className="text-rose-500 font-bold">내용 필요</span>)
                : <span className="text-slate-300">—</span>,
        },
    ], [editable, head?.status, rsnCodes, rsnNmByCd]);

    // 그리드 편집 결과를 상태로 끌어올린다 — 요약(차이·사유 누락)이 즉시 갱신되도록
    const onCellValueChanged = (e) => {
        const raw = e.data.stktkQty;
        const normalized = raw === '' || raw == null ? null : Number(raw);
        setLines(prev => prev.map(l => l.lnId === e.data.lnId
            ? { ...l, ...e.data, stktkQty: Number.isNaN(normalized) ? null : normalized }
            : l));
    };

    const collectRows = () => {
        gridRef.current?.api.stopEditing();
        const rows = [];
        gridRef.current?.api.forEachNode(n => rows.push(n.data));
        return rows;
    };

    const doSave = async () => {
        const rows = collectRows();
        for (const r of rows) {
            if (r.stktkQty != null && r.stktkQty !== '' && Number(r.stktkQty) < 0) {
                toast.error(`실사수량은 0 이상이어야 합니다: ${r.prodCd} @ ${r.locCd}`);
                return;
            }
            if (r.rsnCd === ETC_RSN_CD && !String(r.rsnDscr ?? '').trim()) {
                toast.error(`사유가 기타일 때는 내용을 입력해야 합니다: ${r.prodCd} @ ${r.locCd}`);
                return;
            }
        }
        const items = rows
            .map(r => ({
                lnId: r.lnId,
                stktkQty: r.stktkQty === '' || r.stktkQty == null ? null : Number(r.stktkQty),
                rsnCd: r.rsnCd || null,
                rsnDscr: r.rsnCd === ETC_RSN_CD ? (String(r.rsnDscr ?? '').trim() || null) : null,
            }))
            // 바뀐 라인만 보낸다 — 손대지 않은 라인을 낡은 값으로 덮어쓰지 않기 위해
            .filter(it => {
                const p = pristineRef.current[it.lnId];
                return !p || p.stktkQty !== it.stktkQty || p.rsnCd !== it.rsnCd || p.rsnDscr !== it.rsnDscr;
            });
        if (items.length === 0) {
            toast('변경된 라인이 없습니다.');
            return;
        }
        try {
            await invStktkApi.saveLines(stktkId, items);
            toast.success(`실사수량 ${items.length}건을 저장했습니다.`);
            reload();
        } catch (e) {
            toast.error(e.message || '저장에 실패했습니다.');
        }
    };

    const doResync = async () => {
        try {
            await invStktkApi.resync(stktkId);
            toast.success('전산수량을 현재 값으로 다시 읽었습니다 (실사수량은 그대로).');
            reload();
        } catch (e) {
            toast.error(e.message || '전산수량 재조회에 실패했습니다.');
        }
    };

    const handleConfirmClick = () => {
        if (summary.counted === 0) {
            toast.error('실사수량이 입력된 라인이 없습니다.');
            return;
        }
        if (summary.missingRsn.length > 0) {
            const first = summary.missingRsn[0].ln;
            toast.error(`차이가 있는 라인은 조정사유가 필요합니다: ${first.prodCd} @ ${first.locCd} 외 ${summary.missingRsn.length - 1}건`);
            return;
        }
        setConfirmOpen(true);
    };

    const doConfirm = async () => {
        try {
            await invStktkApi.confirm(stktkId);
            toast.success(`${head.stktkNo} — 조사를 확정했습니다. 차이 ${summary.diffCnt}건이 조정으로 반영되었습니다.`);
            reload();
        } catch (e) {
            toast.error(e.message || '확정에 실패했습니다.');
        }
    };

    const doCancel = async () => {
        try {
            await invStktkApi.cancel(stktkId);
            toast.success(`${head.stktkNo} — 조사를 취소했습니다.`);
            reload();
        } catch (e) {
            toast.error(e.message || '조사 취소에 실패했습니다.');
        }
    };

    const doDeleteLine = async () => {
        if (!selectedLn) {
            toast('삭제할 라인을 선택하세요.');
            return;
        }
        try {
            await invStktkApi.deleteLine(stktkId, selectedLn.lnId);
            toast.success('라인을 삭제했습니다.');
            reload();
        } catch (e) {
            toast.error(e.message || '라인 삭제에 실패했습니다.');
        }
    };

    const openAdd = () => {
        setAddForm({ prod: null, locId: '', lotId: '' });
        setAddLots([]);
        setAddOpen(true);
    };

    const pickAddProd = async (prod) => {
        setAddForm(prev => ({ ...prev, prod, lotId: '' }));
        setProdPickerOpen(false);
        const lots = await lotApi.listByProd(prod.prodId);
        setAddLots(lots);
    };

    const doAddLine = async () => {
        if (!addForm.prod || !addForm.locId || !addForm.lotId) {
            toast.error('상품·로케이션·Lot을 모두 선택하세요.');
            return;
        }
        try {
            await invStktkApi.addLine(stktkId, {
                prodId: addForm.prod.prodId,
                locId: Number(addForm.locId),
                lotId: Number(addForm.lotId),
            });
            toast.success('조사 라인을 추가했습니다.');
            setAddOpen(false);
            reload();
        } catch (e) {
            toast.error(e.message || '라인 추가에 실패했습니다.');
        }
    };

    if (!head) {
        return <div className="text-sm text-slate-400">불러오는 중…</div>;
    }

    const scopeText = [
        head.zonCd && `존 ${head.zonCd}`,
        head.locCd && `로케이션 ${head.locCd}`,
        head.prodCd && `상품 ${head.prodCd}`,
    ].filter(Boolean).join(' · ') || '전 보관 로케이션';

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 헤더 */}
            <div className="flex items-center gap-2 flex-wrap">
                <button onClick={onBack} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <ArrowLeft size={16} />
                </button>
                <h2 className="text-lg font-bold text-slate-800">{head.stktkNo}</h2>
                <Badge meta={INV_STKTK_STATUS_META} value={head.status} show="label" />
                <span className="text-xs text-slate-400">{scopeText}</span>
                <span className="text-xs text-slate-400">· 생성 {fmtDt(head.createdAt)}</span>
                {head.cfmDt && <span className="text-xs text-emerald-600 font-bold">· 확정 {fmtDt(head.cfmDt)}</span>}
            </div>

            {/* 요약 */}
            <div className="flex items-center gap-4 px-4 py-2.5 bg-white border border-slate-200 rounded-xl shrink-0 text-sm flex-wrap">
                <span className="text-slate-500">라인 <b className="text-slate-700">{num(summary.total)}</b></span>
                <span className="text-slate-500">실사 입력 <b className={summary.counted === summary.total ? 'text-emerald-600' : 'text-amber-600'}>{num(summary.counted)}</b></span>
                <span className="text-slate-500">차이 <b className={summary.diffCnt > 0 ? 'text-indigo-700' : 'text-slate-400'}>{num(summary.diffCnt)}</b>건</span>
                {summary.plus > 0 && <span className="text-emerald-600 font-bold">+{num(summary.plus)}</span>}
                {summary.minus < 0 && <span className="text-rose-600 font-bold">{num(summary.minus)}</span>}
                {editable && summary.changedCnt > 0 && (
                    <span className="text-xs text-amber-600 font-bold">
                        조사 중 전산수량이 변한 라인 {num(summary.changedCnt)}건 — 확정은 변동된 최신값 기준으로 조정합니다
                    </span>
                )}
                {editable && summary.missingRsn.length > 0 && (
                    <span className="text-xs text-rose-500 font-bold">사유 미입력 {num(summary.missingRsn.length)}건</span>
                )}
            </div>

            {/* 라인 그리드 */}
            <div className="flex-1 min-h-0">
                <AgGridReact
                    ref={gridRef}
                    rowData={lines}
                    columnDefs={columnDefs}
                    getRowId={(p) => String(p.data.lnId)}
                    rowHeight={34}
                    headerHeight={38}
                    stopEditingWhenCellsLoseFocus={true}
                    rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                    onSelectionChanged={(e) => setSelectedLn(e.api.getSelectedNodes()[0]?.data ?? null)}
                    onCellValueChanged={onCellValueChanged}
                />
            </div>

            {/* 액션 */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {editable ? (
                    <>
                        <button
                            onClick={doSave}
                            className="flex items-center gap-1 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-colors">
                            <Save size={14} /> 저장
                        </button>
                        <button
                            onClick={doResync}
                            title="조사 중 다른 업무로 재고가 변했을 때 화면의 전산수량을 현재 값으로 다시 읽는다 (실사수량은 유지)"
                            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                            <RefreshCw size={14} /> 전산수량 재조회
                        </button>
                        <button
                            onClick={openAdd}
                            title="장부에 없는 재고를 실사에서 발견했을 때 · 기초재고 등록"
                            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                            <Plus size={14} /> 라인 추가
                        </button>
                        <button
                            onClick={doDeleteLine}
                            disabled={!selectedLn}
                            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors">
                            <Trash2 size={14} /> 라인 삭제
                        </button>
                        <div className="ml-auto flex items-center gap-2">
                            <button
                                onClick={() => setCancelOpen(true)}
                                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors">
                                <Ban size={14} /> 조사 취소
                            </button>
                            <button
                                onClick={handleConfirmClick}
                                className="flex items-center gap-1 px-4 py-2 bg-emerald-600 rounded-lg text-sm font-bold text-white hover:bg-emerald-700 transition-colors">
                                <CheckCircle2 size={14} /> 확정
                            </button>
                        </div>
                    </>
                ) : (
                    <span className="text-xs text-slate-400">
                        {head.status === 'CONFIRMED'
                            ? '확정된 조사는 수정할 수 없습니다 — 재정정이 필요하면 새 조사를 만드세요 (조정 이력은 재고 이력 조회에서 조사번호로 추적합니다).'
                            : '취소된 조사입니다.'}
                    </span>
                )}
            </div>

            {/* 확정 확인 */}
            {confirmOpen && (
                <ConfirmModal
                    title="조사를 확정하시겠습니까?"
                    confirmText="확정"
                    onCancel={() => setConfirmOpen(false)}
                    onConfirm={() => { doConfirm(); setConfirmOpen(false); }}
                >
                    <p className="text-sm text-slate-500">
                        실사 입력 <b>{num(summary.counted)}</b>건 중 차이 <b className="text-indigo-700">{num(summary.diffCnt)}</b>건이
                        조정(ADJUST)으로 기록되고 재고가 보정됩니다.
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        증가 <b className="text-emerald-600">+{num(summary.plus)}</b> · 감소 <b className="text-rose-600">{num(summary.minus)}</b>
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                        확정 후 전산수량은 실사수량과 일치합니다 (확정 시점 전산수량을 다시 읽어 조정합니다).
                        {summary.counted < summary.total && ` 미조사 ${num(summary.total - summary.counted)}건은 건너뜁니다.`}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">되돌리려면 반대 방향의 새 조사가 필요합니다 (append-only).</p>
                </ConfirmModal>
            )}

            {/* 조사 취소 확인 */}
            {cancelOpen && (
                <ConfirmModal
                    title="조사를 취소하시겠습니까?"
                    confirmText="조사 취소"
                    danger
                    onCancel={() => setCancelOpen(false)}
                    onConfirm={() => { doCancel(); setCancelOpen(false); }}
                >
                    <p className="text-sm text-slate-500">
                        {head.stktkNo} — 입력한 실사수량은 기록으로 남지만 재고에는 아무것도 반영되지 않습니다.
                    </p>
                </ConfirmModal>
            )}

            {/* 라인 추가 모달 */}
            {addOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20"
                     onMouseDown={() => setAddOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[460px] flex flex-col gap-4"
                         onMouseDown={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-800">조사 라인 추가</h3>
                        <p className="text-xs text-slate-500">
                            장부에 없는 재고를 실사에서 발견했을 때 씁니다. 해당 재고 행이 없으면 전산수량 0으로 담기고,
                            확정 시 (+)조정으로 재고가 새로 생성됩니다. <b>Lot은 이미 있는 것 중에서만</b> 고를 수 있습니다 —
                            Lot 생성은 검수의 소관입니다.
                        </p>

                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <label className="text-xs font-bold text-slate-500 w-20 shrink-0">상품 <span className="text-rose-500">*</span></label>
                                <div className="flex-1 flex items-center gap-2">
                                    <span className="text-sm text-slate-700 truncate flex-1">
                                        {addForm.prod
                                            ? <>{addForm.prod.prodCd} <span className="text-slate-400">{addForm.prod.prodNm}</span></>
                                            : <span className="text-slate-400">선택하세요</span>}
                                    </span>
                                    <button
                                        onClick={() => setProdPickerOpen(true)}
                                        className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">
                                        <Search size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="text-xs font-bold text-slate-500 w-20 shrink-0">로케이션 <span className="text-rose-500">*</span></label>
                                <div className="flex-1">
                                    <DropdownSelect
                                        value={addForm.locId}
                                        onChange={(v) => setAddForm(prev => ({ ...prev, locId: v }))}
                                        options={storageLocs.map(l => ({ value: String(l.locId), label: `${l.locCd} (${l.zonCd})` }))}
                                        placeholder="보관 로케이션 선택"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="text-xs font-bold text-slate-500 w-20 shrink-0">Lot <span className="text-rose-500">*</span></label>
                                <div className="flex-1">
                                    <DropdownSelect
                                        value={addForm.lotId}
                                        onChange={(v) => setAddForm(prev => ({ ...prev, lotId: v }))}
                                        options={addLots.map(l => ({
                                            value: String(l.lotId),
                                            label: `${l.lotNo}${l.expiryDt ? ` (유통기한 ${l.expiryDt})` : ''}`,
                                        }))}
                                        placeholder={addForm.prod ? 'Lot 선택' : '상품을 먼저 선택하세요'}
                                        disabled={!addForm.prod}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setAddOpen(false)} className="btn-modal-cancel">취소</button>
                            <button onClick={doAddLine} className="btn-modal-primary">추가</button>
                        </div>
                    </div>
                </div>
            )}

            <ProdPickerModal
                open={prodPickerOpen}
                onClose={() => setProdPickerOpen(false)}
                onSelect={pickAddProd}
            />
        </div>
    );
}
