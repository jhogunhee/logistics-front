import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Split, AlertTriangle, GitMerge } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchText, SearchProd } from '@/components/common/SearchBar';
import SelectCellEditor from '@/components/common/SelectCellEditor';
import { invLotChngApi } from '@/api/invLotChngApi';
import { useCodes } from '@/hooks/useCodes';
import { ETC_RSN_CD, LOT_ATTR_RSN_GRP } from '@/constants/rsnCodes';
import { num } from '@/utils/format';

/**
 * "YYYY-MM-DD" + n일. toISOString()을 쓰지 않는 이유는 그게 UTC로 변환하기 때문이다
 * (StockAttrChange의 addDays와 같은 판단) — 로컬 연·월·일로 조립한다.
 */
const addDays = (dateStr, n) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    const p = (v) => String(v).padStart(2, '0');
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

// 조회 결과에 입력 필드를 붙인다 — 행이 곧 변경 후보라, 별도 담기 목록이 없다 (보류등록과 같은 구성).
// 목적지(newMfgDt·newExpiryDt·_destLotNo)는 셀 직접 입력이 아니라 목적지 선택 모달이 채운다
const toEditableRow = (r) => ({ ...r, chngQty: null, newMfgDt: '', newExpiryDt: '', _destLotNo: '', rsnCd: '', rsnDscr: '' });

// 수량이든 목적지든 사유든 손댄 행이 변경 대상이다 — 반쪽 입력은 대상에 넣어 검증에서 걸리게 한다
const isEntered = (r) => r.chngQty != null || r.newMfgDt !== '' || r.rsnCd !== '';

/**
 * 재고 로트변경 실행.
 * 행 단위가 Lot이 아니라 **재고 행(로케이션 포함)**이고 수량을 지정한다 —
 * 이 조작은 Lot을 고치는 게 아니라 재고를 다른 Lot으로 옮기는 장부 이동이라,
 * 입력이 (어느 재고 행, 몇 개)이고 가용수량도 행마다 검증한다.
 * Lot 단위로 조회하는 재고 속성변경(전량 일괄·재고 무이동)과 갈리는 지점.
 */
export default function StockLotChngExec() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ prodCd: '', prodNm: '', locCd: '', lotNo: '' });
    const [confirmTargets, setConfirmTargets] = useState(null);
    // 목적지 선택 모달 상태 — dest.row가 있으면 열림
    const [dest, setDest] = useState(null); // { row, cands: null(로딩)|[], mode: 'cand'|'manual', lotId, mfgDt, expiryDt }
    const gridRef = useRef(null);
    const rsn = useCodes(LOT_ATTR_RSN_GRP); // 사유 성격이 속성 정정과 같아 그룹을 재사용한다

    const fetchTargets = async () => {
        const data = await invLotChngApi.listTargets(cond);
        setRowData(data.map(toEditableRow));
    };

    useEffect(() => {
        invLotChngApi.listTargets({}).then(d => setRowData(d.map(toEditableRow)));
    }, []);

    // 사유 셀은 isEntered를, 기타 사유 셀은 rsnCd를 보고 그려진다 — 제 값이 안 바뀐 셀은 그리드가
    // 다시 그리지 않으므로, 행이 갈릴 때마다 강제로 다시 그린다 (보류등록·속성변경과 같은 판단)
    useEffect(() => {
        gridRef.current?.api?.refreshCells({ force: true });
    }, [rowData]);

    const entered = useMemo(() => rowData.filter(isEntered), [rowData]);
    const totalQty = entered.reduce((s, r) => s + (Number(r.chngQty) || 0), 0);

    /** 목적지 선택 모달 열기 + 후보 조회 (같은 상품+입고일자의 다른 Lot — 서버가 강제) */
    const openDest = async (row) => {
        setDest({ row, cands: null, mode: 'manual', lotId: null, mfgDt: row.newMfgDt || '', expiryDt: row.newExpiryDt || '' });
        const cands = await invLotChngApi.listTargetLots(row.invId);
        setDest(prev => (prev && prev.row.invId === row.invId
            ? {
                ...prev,
                cands,
                // 후보가 있으면 병합을 기본 선택지로 제안한다 (이미 고른 목적지가 있으면 그걸 복원)
                mode: row._destLotNo ? 'cand' : (cands.length > 0 && !row.newMfgDt ? 'cand' : prev.mode),
                lotId: row._destLotNo ? (cands.find(c => c.lotNo === row._destLotNo)?.lotId ?? null) : (cands[0]?.lotId ?? null),
            }
            : prev));
    };

    // 직접 입력한 제조일자가 기존 후보와 같으면 그 Lot으로 합쳐진다 — 유통기한도 그 Lot 값이 강제된다
    const manualMatch = useMemo(() => {
        if (!dest || dest.mode !== 'manual' || !dest.mfgDt || !dest.cands) return null;
        return dest.cands.find(c => c.mfgDt === dest.mfgDt) ?? null;
    }, [dest]);

    /** 모달의 현재 선택을 검증하고 확정값 {mfgDt, expiryDt, destLotNo} 또는 오류 문자열을 돌려준다 */
    const resolveDest = () => {
        const row = dest.row;
        if (dest.mode === 'cand') {
            const cand = dest.cands?.find(c => c.lotId === dest.lotId);
            if (!cand) return '합칠 Lot을 선택하세요.';
            return { mfgDt: cand.mfgDt, expiryDt: cand.expiryDt, destLotNo: cand.lotNo };
        }
        if (!dest.mfgDt) return '제조일자를 입력하세요.';
        if (dest.mfgDt === row.mfgDt) return '제조일자가 지금과 같습니다 — 유통기한만 고치려면 재고 속성변경을 쓰세요.';
        if (row.receiptDt && dest.mfgDt > row.receiptDt) return `제조일자가 입고일자(${row.receiptDt})보다 미래일 수 없습니다.`;
        if (manualMatch) {
            // 같은 배치의 Lot이 이미 있다 — 그 Lot으로 병합 (유통기한은 그 Lot 값)
            return { mfgDt: manualMatch.mfgDt, expiryDt: manualMatch.expiryDt, destLotNo: manualMatch.lotNo };
        }
        if (!dest.expiryDt) return '유통기한을 입력하세요.';
        if (dest.expiryDt < dest.mfgDt) return '유통기한이 제조일자보다 이전일 수 없습니다.';
        return { mfgDt: dest.mfgDt, expiryDt: dest.expiryDt, destLotNo: '' };
    };

    const destError = dest ? (() => { const r = resolveDest(); return typeof r === 'string' ? r : null; })() : null;

    const applyDest = () => {
        const resolved = resolveDest();
        if (typeof resolved === 'string') return;
        setRowData(prev => prev.map(r => (r.invId === dest.row.invId
            ? { ...r, newMfgDt: resolved.mfgDt, newExpiryDt: resolved.expiryDt, _destLotNo: resolved.destLotNo }
            : r)));
        setDest(null);
    };

    const clearDest = () => {
        setRowData(prev => prev.map(r => (r.invId === dest.row.invId
            ? { ...r, newMfgDt: '', newExpiryDt: '', _destLotNo: '' }
            : r)));
        setDest(null);
    };

    const columnDefs = useMemo(() => [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 150 },
        { field: 'locCd', headerName: '로케이션', width: 120 },
        { field: 'lotNo', headerName: '원 Lot번호', width: 140 },
        {
            field: 'receiptDt', headerName: '입고일자', width: 105, cellClass: 'text-slate-500',
            headerTooltip: '입고일자는 바뀌지 않는다 — 새 제조일자는 이 날짜를 넘을 수 없다',
        },
        { field: 'mfgDt', headerName: '제조일자', width: 105, cellClass: 'text-slate-500' },
        { field: 'expiryDt', headerName: '유통기한', width: 105, cellClass: 'text-slate-500' },
        {
            field: 'avalQty', headerName: '가용', width: 85,
            headerTooltip: '가용 = 보유 - 예약 - 보류. 변경수량의 상한 — 예약·보류분은 그 문서가 가리키는 재고라 옮길 수 없다',
            cellClass: 'ag-right-aligned-cell font-bold text-emerald-600',
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'chngQty', headerName: '변경수량', width: 100, editable: true,
            headerTooltip: '옮길 수량 — 가용이 상한. 전량을 지정하면 원 Lot의 이 행이 비워진다',
            cellClass: 'ag-right-aligned-cell bg-indigo-50 font-bold',
            cellRenderer: (p) => (p.value == null
                ? <span className="text-slate-300 font-normal">—</span>
                : num(p.value)),
        },
        {
            field: 'newMfgDt', headerName: '변경 후 Lot', width: 230,
            headerTooltip: '클릭해서 선택 — 같은 상품·입고일자의 기존 Lot으로 합치거나(병합), 새 제조일자를 직접 입력한다(분할)',
            cellClass: 'bg-indigo-50 cursor-pointer',
            cellRenderer: (p) => {
                if (!p.data.newMfgDt) return <span className="text-slate-400">클릭해서 선택…</span>;
                return (
                    <span className="text-xs font-bold text-amber-600">
                        {p.data.newMfgDt} ~ {p.data.newExpiryDt}
                        {p.data._destLotNo
                            ? <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{p.data._destLotNo} 병합</span>
                            : <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">새 Lot</span>}
                    </span>
                );
            },
        },
        {
            field: 'rsnCd', headerName: '변경사유', width: 130, editable: true,
            headerTooltip: '입력한 행만 필수. 변경 1건마다 사유가 따로 남는다',
            cellEditor: SelectCellEditor,
            cellEditorParams: { values: rsn.values, labelMap: rsn.nmByCd, placeholder: '사유 선택' },
            cellClass: 'bg-indigo-50',
            cellRenderer: (p) => {
                if (!p.value) {
                    return isEntered(p.data)
                        ? <span className="text-rose-500 font-bold">사유 필요</span>
                        : <span className="text-slate-300">—</span>;
                }
                return <span>{rsn.nm(p.value)}</span>;
            },
        },
        {
            field: 'rsnDscr', headerName: '기타 사유', width: 150,
            editable: (p) => p.data.rsnCd === ETC_RSN_CD,
            headerTooltip: '사유가 「기타」일 때만 입력한다 (그 외 코드에서는 서버가 무시)',
            cellClass: (p) => (p.data.rsnCd === ETC_RSN_CD ? 'bg-indigo-50' : ''),
            cellRenderer: (p) => p.data.rsnCd === ETC_RSN_CD
                ? (p.value || <span className="text-rose-500 font-bold">내용 필요</span>)
                : <span className="text-slate-300">—</span>,
        },
    ], [rsn]);

    /** 목적지 배치 셀은 편집이 아니라 모달이다 */
    const onCellClicked = (e) => {
        if (e.colDef.field === 'newMfgDt') openDest(e.data);
    };

    const onCellValueChanged = (e) => {
        // 기본 텍스트 에디터는 문자열을 남긴다 — 빈 값은 null로, 그 외는 숫자로 맞춰 올린다
        const raw = e.data.chngQty;
        const chngQty = raw === '' || raw == null ? null : Number(raw);
        setRowData(prev => prev.map(r => (r.invId === e.data.invId ? { ...r, ...e.data, chngQty } : r)));
    };

    const handleSubmit = () => {
        // 편집 중인 셀은 아직 행에 반영되지 않았다 — 열린 에디터를 닫고 나서 그리드에서 직접 걷는다
        gridRef.current?.api.stopEditing();
        const rows = [];
        gridRef.current?.api.forEachNode(n => rows.push(n.data));
        const targets = rows.filter(isEntered);
        if (targets.length === 0) {
            toast('변경수량·변경 후 Lot을 입력한 행이 없습니다.');
            return;
        }
        // 실행이 전량 롤백이라 걸린 행을 하나씩 알리면 고칠 때마다 다음 행이 새로 걸린다 —
        // 한 번에 다 보여줘서 한 번의 수정으로 다시 시도할 수 있게 한다
        const errors = [];
        for (const r of targets) {
            const where = `${r.prodCd} / ${r.locCd} / ${r.lotNo}`;
            const n = Number(r.chngQty);
            if (!(n > 0)) {
                errors.push(`${where}: 변경수량은 1 이상이어야 합니다.`);
            } else if (n > r.avalQty) {
                errors.push(`${where}: 가용재고(${num(r.avalQty)})를 초과했습니다.`);
            } else if (!r.newMfgDt || !r.newExpiryDt) {
                errors.push(`${where}: 변경 후 Lot을 선택하세요.`);
            } else if (!r.rsnCd) {
                errors.push(`${where}: 변경사유를 선택하세요.`);
            } else if (r.rsnCd === ETC_RSN_CD && !String(r.rsnDscr ?? '').trim()) {
                errors.push(`${where}: 사유가 기타일 때는 사유 내용을 입력해야 합니다.`);
            }
        }
        if (errors.length > 0) {
            toast.error(errors.join('\n'), { style: { whiteSpace: 'pre-line' } });
            return;
        }
        setConfirmTargets(targets);
    };

    /** 입력한 행들을 한 번에 보낸다 — 서버가 전량 롤백하므로 부분 성공은 없다 */
    const doChange = async (targets) => {
        try {
            const nos = await invLotChngApi.change(targets.map(r => ({
                invId: r.invId,
                chngQty: Number(r.chngQty),
                mfgDt: r.newMfgDt,
                expiryDt: r.newExpiryDt,
                rsnCd: r.rsnCd,
                rsnDscr: r.rsnCd === ETC_RSN_CD ? String(r.rsnDscr).trim() : null,
            })));
            toast.success(`로트변경 ${nos.length}건을 실행했습니다 (${nos.join(', ')}).`);
            fetchTargets(); // 옮겨진 재고로 갱신 + 입력 초기화
        } catch (e) {
            // 실패하면 재조회하지 않는다 — 전량 롤백이라 서버 값은 그대로이고,
            // 입력을 살려둬야 지적된 행만 고쳐서 다시 시도할 수 있다
            toast.error(e.message || '로트변경에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Split size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">재고 로트변경</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    재고를 다른 Lot으로 옮깁니다 — 원하는 수량만 · <b>Lot의 날짜만 고치려면 → 재고 속성변경</b>
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchTargets}>
                <SearchProd name="prodCd" label="상품 코드" placeholder="PROD-0001" />
                <SearchText name="prodNm" label="상품명" placeholder="상품명 일부" />
                <SearchText name="locCd" label="로케이션" placeholder="DRY-A-01-01" />
                <SearchText name="lotNo" label="Lot번호" placeholder="LOT-260722-001" />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-slate-500 font-medium">
                        보관 재고 {num(rowData.length)}건 (가용 수량이 있는 것만)
                    </span>
                    <span className="text-[11px] text-slate-400">
                        수량을 넣고 「변경 후 Lot」 칸을 눌러 옮길 곳을 고르세요 — 새 Lot이 생기면 라벨을 다시 출력합니다
                    </span>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-bold ${entered.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            입력 {num(entered.length)}건 · 총 {num(totalQty)}개
                        </span>
                        <button
                            onClick={handleSubmit}
                            className="flex items-center gap-1 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-colors">
                            <Split size={14} /> 로트변경
                        </button>
                    </div>
                </div>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        ref={gridRef}
                        rowData={rowData}
                        columnDefs={columnDefs}
                        getRowId={(p) => String(p.data.invId)}
                        rowHeight={34}
                        headerHeight={38}
                        stopEditingWhenCellsLoseFocus={true}
                        onCellClicked={onCellClicked}
                        onCellValueChanged={onCellValueChanged}
                    />
                </div>
            </div>

            {/* 목적지 배치 선택 모달 */}
            {dest && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20"
                     onMouseDown={() => setDest(null)}>
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[520px] flex flex-col gap-4"
                         onMouseDown={(e) => e.stopPropagation()}>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">변경 후 Lot 선택</h3>
                            <p className="text-xs text-slate-400 mt-1">
                                {dest.row.prodCd} {dest.row.prodNm} · <span className="font-mono">{dest.row.locCd}</span> · 원 Lot <b>{dest.row.lotNo}</b> (제조 {dest.row.mfgDt} · 유통 {dest.row.expiryDt} · 입고 {dest.row.receiptDt})
                            </p>
                        </div>

                        {/* 기존 Lot으로 합치기 — 후보는 같은 상품+입고일자의 다른 Lot뿐 (입고일자는 Lot의 정체성이라 못 바꾼다) */}
                        <div className="flex flex-col gap-1.5">
                            {dest.cands === null && <span className="text-xs text-slate-400 px-1">합칠 수 있는 Lot 조회 중…</span>}
                            {dest.cands?.length === 0 && (
                                <span className="text-xs text-slate-400 px-1">
                                    합칠 수 있는 Lot이 없습니다 — 아래에서 새 Lot을 만드세요.
                                </span>
                            )}
                            {dest.cands?.length > 0 && (
                                <>
                                    <label className={`flex items-center gap-2.5 text-xs rounded-lg border px-3 py-2 cursor-pointer
                                        ${dest.mode === 'cand' ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-200 hover:border-slate-300'}`}>
                                        <input type="radio" name="destPick" className="accent-emerald-600"
                                               checked={dest.mode === 'cand'}
                                               onChange={() => setDest(prev => ({ ...prev, mode: 'cand', lotId: prev.lotId ?? prev.cands[0]?.lotId ?? null }))} />
                                        <GitMerge size={12} className="text-emerald-600 shrink-0" />
                                        <b className="text-slate-700">기존 Lot으로 합치기</b>
                                        <span className="text-slate-400">아래에서 합칠 Lot을 고릅니다</span>
                                    </label>
                                    {dest.mode === 'cand' && (
                                        <div className="flex items-center gap-2 pl-8 pr-1 py-1">
                                            {/* 목록이 길어도 드롭다운 한 줄 — 모달 높이가 후보 수와 무관하다 */}
                                            <select
                                                value={dest.lotId ?? ''}
                                                onChange={(e) => setDest(prev => ({ ...prev, lotId: Number(e.target.value) || null }))}
                                                className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-300">
                                                {dest.cands.map(c => (
                                                    <option key={c.lotId} value={c.lotId}>
                                                        {c.lotNo} · 제조 {c.mfgDt} · 유통 {c.expiryDt}
                                                    </option>
                                                ))}
                                            </select>
                                            <span className="text-[11px] text-slate-400 shrink-0">{num(dest.cands.length)}건</span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* 새 배치 직접 입력 — 분할 (새 Lot 채번, 라벨 재출력) */}
                        <div className="flex flex-col gap-1.5">
                            <label className={`flex items-center gap-2.5 text-xs rounded-lg border px-3 py-2 cursor-pointer
                                ${dest.mode === 'manual' ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 hover:border-slate-300'}`}>
                                <input type="radio" name="destPick" className="accent-indigo-600"
                                       checked={dest.mode === 'manual'}
                                       onChange={() => setDest(prev => ({ ...prev, mode: 'manual' }))} />
                                <b className="text-slate-700">새 Lot 만들기</b>
                                <span className="text-slate-400">제조일자·유통기한을 직접 입력합니다</span>
                            </label>
                            {dest.mode === 'manual' && (
                                <div className="flex flex-col gap-2 pl-8 pr-1 py-1">
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="w-16 text-slate-500 font-bold shrink-0">제조일자</span>
                                        <input type="date" value={dest.mfgDt} max={dest.row.receiptDt || undefined}
                                               onChange={(e) => setDest(prev => ({
                                                   ...prev,
                                                   mfgDt: e.target.value,
                                                   // 유통기한 기본값 제안 (제조일자 + 유통기한일수) — 벤더 인쇄값으로 덮어쓸 수 있다
                                                   expiryDt: e.target.value && dest.row.shelfLifeDays != null
                                                       ? addDays(e.target.value, dest.row.shelfLifeDays) : prev.expiryDt,
                                               }))}
                                               className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="w-16 text-slate-500 font-bold shrink-0">유통기한</span>
                                        <input type="date" value={manualMatch ? manualMatch.expiryDt : dest.expiryDt}
                                               min={dest.mfgDt || undefined} disabled={!!manualMatch}
                                               onChange={(e) => setDest(prev => ({ ...prev, expiryDt: e.target.value }))}
                                               className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-400" />
                                    </div>
                                    {manualMatch && (
                                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1.5">
                                            <GitMerge size={12} className="shrink-0" />
                                            같은 제조일자의 <b>{manualMatch.lotNo}</b>가 이미 있어 그 Lot으로 합쳐집니다 (유통기한 {manualMatch.expiryDt}).
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {destError && dest.cands !== null && (
                            <span className="text-xs text-rose-500 font-medium">{destError}</span>
                        )}

                        <div className="flex gap-2 justify-end items-center">
                            {dest.row.newMfgDt && (
                                <button onClick={clearDest}
                                        className="mr-auto px-3 py-2 text-xs font-bold text-slate-400 hover:text-rose-500">
                                    선택 해제
                                </button>
                            )}
                            <button onClick={() => setDest(null)} className="btn-modal-cancel">취소</button>
                            <button onClick={applyDest} disabled={!!destError || dest.cands === null}
                                    className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300">
                                선택
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 실행 확인 모달 */}
            {confirmTargets && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20"
                     onMouseDown={() => setConfirmTargets(null)}>
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[560px] flex flex-col gap-4"
                         onMouseDown={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-800">
                            로트변경 {confirmTargets.length}건을 실행하시겠습니까?
                        </h3>
                        <p className="text-sm text-slate-500">
                            아래 수량이 다른 Lot으로 옮겨집니다. 취소는 없습니다 — 되돌리려면 반대로 다시 실행합니다.
                        </p>
                        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                            {confirmTargets.map(r => (
                                <div key={r.invId} className="flex flex-col gap-1 text-xs bg-slate-50 rounded-lg p-3">
                                    <div className="flex items-baseline gap-2 min-w-0">
                                        <b className="text-slate-700 truncate">{r.lotNo}</b>
                                        <span className="text-slate-400 truncate">{r.prodCd} {r.prodNm}</span>
                                        <span className="font-mono text-slate-400">{r.locCd}</span>
                                        <b className="text-indigo-700 ml-auto shrink-0">{num(Number(r.chngQty))}개</b>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="w-16 text-slate-400 font-bold">변경 후</span>
                                        {r._destLotNo
                                            ? <b className="text-emerald-700">기존 {r._destLotNo}로 병합</b>
                                            : <b className="text-indigo-700">새 Lot 채번 (분할)</b>}
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="w-16 text-slate-400 font-bold">제조일자</span>
                                        <span className="text-slate-500">{r.mfgDt || '-'}</span>
                                        <span className="text-slate-300">→</span>
                                        <b className="text-amber-600">{r.newMfgDt}</b>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="w-16 text-slate-400 font-bold">유통기한</span>
                                        <span className="text-slate-500">{r.expiryDt || '-'}</span>
                                        <span className="text-slate-300">→</span>
                                        <b className="text-amber-600">{r.newExpiryDt}</b>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="w-16 text-slate-400 font-bold">사유</span>
                                        <b className="text-slate-600">{rsn.nm(r.rsnCd)}</b>
                                        {r.rsnCd === ETC_RSN_CD && <span className="text-slate-400 truncate">— {r.rsnDscr}</span>}
                                    </div>
                                    {/* 새 번호 발생 — 현품 라벨과 어긋나는 유일한 지점이라 실행 전에 짚어 준다 */}
                                    <div className="flex items-center gap-1.5 text-slate-500">
                                        <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                                        옮겨진 수량은 {r._destLotNo ? <><b className="text-slate-700">{r._destLotNo}</b> 라벨로 교체</> : <><b className="text-slate-700">새 Lot 번호</b>를 받습니다</>} — 현품 라벨 재출력 필요
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setConfirmTargets(null)} className="btn-modal-cancel">
                                취소
                            </button>
                            <button
                                onClick={() => { const t = confirmTargets; setConfirmTargets(null); doChange(t); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                                실행
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
