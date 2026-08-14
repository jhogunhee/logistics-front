import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ArrowRight, PackageOpen, RefreshCw, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchText, SearchDateRange, SearchProd } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import { putawayApi } from '@/api/putawayApi';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { Badge } from '@/components/common/Badge';
import ConfirmModal from '@/components/common/ConfirmModal';
import { num } from '@/utils/format';


const COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'ibNo', headerName: '입고번호', width: 170 },
    { field: 'vndrNm', headerName: '벤더', width: 110 },
    { field: 'prodCd', headerName: '상품 코드', width: 115 },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 200 },
    {
        field: 'tmpZon', headerName: '온도대', width: 100,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
    },
    { field: 'lotNo', headerName: 'Lot번호', width: 140 },
    { field: 'receiptDt', headerName: '입고일자', width: 110 },
    {
        field: 'expiryDt', headerName: '유통기한', width: 110,
        headerTooltip: '이 Lot의 유통기한. FEFO 정렬(임박 순) 기준값',
        cellRenderer: (p) => p.value ?? <span className="text-slate-400">미관리</span>,
    },
    {
        field: 'pendingQty', headerName: '미적치', width: 100,
        headerTooltip: 'RCV-STAGE에 남아있는, 아직 보관 로케이션으로 옮기지 않은 이 Lot의 수량',
        cellClass: 'ag-right-aligned-cell text-amber-600 font-bold',
        valueFormatter: (p) => num(p.value),
    },
];

export default function Putaway() {
    const [rowData, setRowData] = useState([]);
    const [selected, setSelected] = useState(null);
    const [cond, setCond] = useState({ ibNo: '', dateFrom: '', dateTo: '', prodCd: '' });
    const [candidateLocs, setCandidateLocs] = useState([]);
    const [qty, setQty] = useState('');
    const [targetLocId, setTargetLocId] = useState('');
    const [confirmTarget, setConfirmTarget] = useState(null); // 적치 실행 확인 모달 대상
    const [recommend, setRecommend] = useState(null); // 전략 추천 결과 — strategySelected=false면 수동 선택만 노출
    const [confirmRecommend, setConfirmRecommend] = useState(null); // 추천대로 실행 확인 모달 대상
    const gridRef = useRef(null);
    const pendingSelectRef = useRef(null); // 재조회 후 같은 배치(라인+Lot)를 다시 선택하기 위한 키 (부분 적치 시 유지)

    const fetchList = async (keepSelection = false) => {
        if (keepSelection) {
            pendingSelectRef.current = selected ? { ibLineId: selected.ibLineId, lotId: selected.lotId } : null;
        } else {
            setSelected(null);
            setCandidateLocs([]);
            setQty('');
            setTargetLocId('');
            setRecommend(null);
        }
        const data = await putawayApi.lines(cond);
        setRowData(data);
    };

    const onModelUpdated = (p) => {
        if (pendingSelectRef.current == null) return;
        const { ibLineId, lotId } = pendingSelectRef.current;
        pendingSelectRef.current = null;
        p.api.forEachNode(n => { if (n.data.ibLineId === ibLineId && n.data.lotId === lotId) n.setSelected(true); });
    };

    useEffect(() => {
        putawayApi.lines().then(setRowData);
    }, []);

    // 배치 선택 시 전략 추천 + 대상 로케이션 후보 조회 + 수량 기본값(전량)
    const onSelectionChanged = async (e) => {
        const node = e.api.getSelectedNodes()[0];
        if (!node) {
            setSelected(null);
            setCandidateLocs([]);
            setQty('');
            setTargetLocId('');
            setRecommend(null);
            return;
        }
        setSelected(node.data);
        setQty(String(node.data.pendingQty));
        fetchRecommend(node.data, node.data.pendingQty);
        const locs = await putawayApi.candidateLocs(node.data.ibLineId);
        setCandidateLocs(locs);
        setTargetLocId(locs.length > 0 ? locs[0].locId : '');
    };

    // 전략 추천. 전략 미설정(strategySelected=false)이면 블록을 숨기고 수동 선택만 남긴다
    const fetchRecommend = async (batch, recommendQty) => {
        setRecommend(null);
        const n = Number(recommendQty);
        if (!(n > 0)) return;
        try {
            setRecommend(await putawayApi.recommend(batch.ibLineId, { lotId: batch.lotId, qty: n }));
        } catch (e) {
            toast.error(e.message || '적치 추천에 실패했습니다.');
        }
    };

    // 추천대로 실행 — 추천 (로케이션, 수량) 행별로 기존 적치 API를 순차 호출
    const doRecommendExecute = async (rec) => {
        let done = 0;
        try {
            for (const a of rec.assignments) {
                await putawayApi.putaway(selected.ibLineId, { lotId: selected.lotId, qty: a.qty, targetLocId: a.locId });
                done += 1;
            }
            toast.success(`추천대로 ${num(rec.asgnQty)}개를 ${rec.assignments.length}개 로케이션에 적치했습니다.`);
        } catch (e) {
            // 추천과 실행 사이 재고·용량이 변했을 수 있다 — 실패 지점부터 중단하고 재조회
            toast.error(`${done}건 실행 후 실패: ${e.message || '적치에 실패했습니다.'}`);
        }
        fetchList(rec.remainQty > 0 || done < rec.assignments.length);
    };

    const handlePutawayClick = () => {
        if (!selected) {
            toast('적치할 Lot을 선택하세요.');
            return;
        }
        const n = Number(qty);
        if (!(n > 0)) {
            toast.error('적치수량은 1 이상이어야 합니다.');
            return;
        }
        if (n > selected.pendingQty) {
            toast.error('미적치 잔량을 초과했습니다.');
            return;
        }
        if (!targetLocId) {
            toast.error('대상 로케이션을 선택하세요.');
            return;
        }
        setConfirmTarget({ ...selected, qty: n, targetLocId });
    };

    const doPutaway = async (target) => {
        try {
            await putawayApi.putaway(target.ibLineId, { lotId: target.lotId, qty: target.qty, targetLocId: Number(target.targetLocId) });
            toast.success(`${target.prodCd} ${num(target.qty)}개를 적치했습니다.`);
            fetchList(target.qty < target.pendingQty); // 잔량이 남았으면 같은 배치 선택 유지
        } catch (e) {
            toast.error(e.message || '적치에 실패했습니다.');
        }
    };

    const locOptions = candidateLocs.map(l => ({ value: l.locId, label: `${l.locCd} (${l.zonCd})` }));
    const targetLocLabel = (locId) => candidateLocs.find(l => l.locId === Number(locId))?.locCd ?? '';

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <PackageOpen size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">적치</h2>
                <span className="text-xs text-slate-400 mt-0.5">검수는 됐지만 아직 보관 로케이션으로 옮기지 않은 재고 — RCV-STAGE → 보관존 이동</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={() => fetchList()}>
                <SearchText name="ibNo" label="입고번호" placeholder="IB-20260717-001" />
                <SearchDateRange from="dateFrom" to="dateTo" label="입고일자" />
                <SearchProd name="prodCd" />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <span className="text-xs text-slate-500 font-medium">{num(rowData.length)}건</span>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        ref={gridRef}
                        rowData={rowData}
                        columnDefs={COLUMN_DEFS}
                        rowHeight={34}
                        headerHeight={38}
                        // 행 식별자를 주지 않으면 목록이 다시 올 때 ag-grid가 전부 새 행으로 보고 선택을 버린다.
                        // 그러면 후보 로케이션을 기다리는 사이(onSelectionChanged의 await) 선택이 풀려
                        // selected가 null이 되고, 배치는 떠 있는데 적치 실행 영역이 잠긴다.
                        // 배치의 키는 입고라인+Lot이다 (onModelUpdated의 재선택 조건과 같은 기준)
                        getRowId={(p) => `${p.data.ibLineId}:${p.data.lotId}`}
                        rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                        onSelectionChanged={onSelectionChanged}
                        onModelUpdated={onModelUpdated}
                    />
                </div>

                {/* 적치 실행 영역 */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col gap-3 shrink-0">
                    {!selected ? (
                        <span className="text-xs text-slate-400">위에서 적치할 Lot을 선택하세요.</span>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="font-bold text-slate-700">{selected.prodCd} {selected.prodNm}</span>
                                <Badge meta={TEMP_ZONE_META} value={selected.tmpZon} />
                                <span className="text-xs text-slate-400">{selected.ibNo} · {selected.lotNo} · 미적치 {num(selected.pendingQty)}개</span>
                            </div>

                            {/* 전략 추천 — 전략 미설정이면 이 블록이 없고 아래 수동 선택만 남는다 */}
                            {recommend?.strategySelected && (
                                <div className="border border-indigo-200 bg-indigo-50/50 rounded-xl px-4 py-3 flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <Wand2 size={14} className="text-indigo-600" />
                                        <span className="text-xs font-bold text-indigo-700">
                                            전략 추천 — {recommend.stgyNm} · 배정 {num(recommend.asgnQty)} / 요청 {num(recommend.reqQty)}
                                        </span>
                                        {recommend.remainQty > 0 && (
                                            <span className="text-[11px] font-bold text-rose-600">미배정 {num(recommend.remainQty)} (수동 처리 필요)</span>
                                        )}
                                        <button onClick={() => fetchRecommend(selected, qty)}
                                                className="ml-auto flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                                                title="입력한 수량으로 추천 다시 계산">
                                            <RefreshCw size={12} /> 새로고침
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {recommend.assignments.map((a, i) => (
                                            <span key={i} className="px-2.5 py-1 bg-white border border-indigo-200 rounded-lg text-[12px]">
                                                <span className="font-mono text-slate-600">{a.locCd}</span>
                                                <b className="text-indigo-700 ml-1.5">{num(a.qty)}</b>
                                            </span>
                                        ))}
                                        {recommend.assignments.length > 0 && (
                                            <button onClick={() => setConfirmRecommend(recommend)}
                                                    className="btn-primary">
                                                <ArrowRight size={12} /> 추천대로 실행
                                            </button>
                                        )}
                                        {recommend.assignments.length === 0 && (
                                            <span className="text-[11px] text-slate-400">배정 가능한 로케이션이 없습니다 — 수동으로 선택하세요.</span>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="flex items-end gap-3">
                                <div className="flex flex-col gap-1 w-32 shrink-0">
                                    <label className="text-xs font-bold text-slate-500">적치수량</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max={selected.pendingQty}
                                        value={qty}
                                        onChange={(e) => setQty(e.target.value)}
                                        className="input-num"
                                    />
                                </div>
                                <div className="flex flex-col gap-1 flex-1 min-w-0">
                                    <label className="text-xs font-bold text-slate-500">
                                        대상 로케이션 <span className="text-slate-400 font-normal">(수동 선택 — 온도대 일치 보관존)</span>
                                    </label>
                                    <DropdownSelect
                                        value={targetLocId}
                                        onChange={setTargetLocId}
                                        options={locOptions}
                                        placeholder="로케이션 선택"
                                    />
                                </div>
                                <button
                                    onClick={handlePutawayClick}
                                    className="flex items-center gap-1 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-colors shrink-0">
                                    <ArrowRight size={14} /> 적치 실행
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 추천대로 실행 확인 모달 */}
            {confirmRecommend && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[420px] flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">추천대로 적치하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {selected?.prodCd} {selected?.prodNm} · 총 <b className="text-emerald-600">{num(confirmRecommend.asgnQty)}개</b>
                        </p>
                        <div className="flex flex-col gap-1">
                            {confirmRecommend.assignments.map((a, i) => (
                                <span key={i} className="text-xs text-slate-500">
                                    RCV-STAGE → <span className="font-mono">{a.locCd}</span> <b>{num(a.qty)}개</b>
                                </span>
                            ))}
                        </div>
                        {confirmRecommend.remainQty > 0 && (
                            <p className="text-xs text-rose-500">미배정 {num(confirmRecommend.remainQty)}개는 남습니다 — 실행 후 수동으로 처리하세요.</p>
                        )}
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConfirmRecommend(null)}
                                className="btn-modal-cancel">
                                취소
                            </button>
                            <button
                                onClick={() => { doRecommendExecute(confirmRecommend); setConfirmRecommend(null); }}
                                className="btn-modal-primary">
                                적치
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 적치 확인 모달 */}
            {confirmTarget && (
                <ConfirmModal
                    title="적치하시겠습니까?"
                    confirmText="적치"
                    onCancel={() => setConfirmTarget(null)}
                    onConfirm={() => { doPutaway(confirmTarget); setConfirmTarget(null); }}
                >
                    <p className="text-sm text-slate-500">
                        {confirmTarget.prodCd} {confirmTarget.prodNm} · <b className="text-emerald-600">{num(confirmTarget.qty)}개</b>
                    </p>
                    <p className="text-xs text-slate-400">
                        RCV-STAGE → {targetLocLabel(confirmTarget.targetLocId)}
                    </p>
                </ConfirmModal>
            )}
        </div>
    );
}