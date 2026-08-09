import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { PauseCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchText } from '@/components/common/SearchBar';
import SelectCellEditor from '@/components/common/SelectCellEditor';
import { invApi } from '@/api/invApi';
import { invHldApi } from '@/api/invHldApi';
import { useCodes } from '@/hooks/useCodes';
import { ETC_RSN_CD } from '@/constants/rsnCodes';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { Badge } from '@/components/common/Badge';
import { num } from '@/utils/format';

// 조회 결과에 입력 3필드를 붙인다 — 행이 곧 등록 후보라, 별도 담기 목록이 없다
const toEditableRow = (r) => ({ ...r, qty: null, rsnCd: '', rsnDscr: '' });

// 수량이든 사유든 손댄 행이 등록 대상이다 — 반쪽 입력은 대상에 넣어 검증에서 걸리게 한다
const isEntered = (r) => r.qty != null || r.rsnCd !== '';

export default function StockHoldRegister() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ prodCd: '', prodNm: '', locCd: '', lotNo: '' });
    const rsn = useCodes('HLD_RSN'); // 보류사유
    const [confirmTargets, setConfirmTargets] = useState(null);
    const gridRef = useRef(null);

    // 보류 대상은 보관 재고뿐이다 (v1 — 스테이징 보류는 적치·출고확정 파급을 수반해 제외)
    const fetchStock = async () => {
        const data = await invApi.list({ ...cond, locTyp: 'STORAGE' });
        setRowData(data.filter(r => r.avalQty > 0).map(toEditableRow));
    };

    useEffect(() => {
        invApi.list({ locTyp: 'STORAGE' }).then(data => setRowData(data.filter(r => r.avalQty > 0).map(toEditableRow)));
    }, []);

    // 사유 셀은 qty를, 기타 사유 셀은 rsnCd를 보고 그려진다 — 제 값이 안 바뀐 셀은 그리드가
    // 다시 그리지 않으므로, 행이 갈릴 때마다 강제로 다시 그린다 (StockAttrChange와 같은 판단)
    useEffect(() => {
        gridRef.current?.api?.refreshCells({ force: true });
    }, [rowData]);

    const entered = useMemo(() => rowData.filter(isEntered), [rowData]);
    const totalQty = entered.reduce((s, r) => s + (Number(r.qty) || 0), 0);

    const columnDefs = useMemo(() => [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 180 },
        {
            field: 'tmpZon', headerName: '온도대', width: 100,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
        },
        { field: 'locCd', headerName: '로케이션', width: 130 },
        { field: 'lotNo', headerName: 'Lot번호', width: 130 },
        {
            field: 'expiryDt', headerName: '유통기한', width: 110,
            cellRenderer: (p) => p.value ?? <span className="text-slate-400">미관리</span>,
        },
        {
            field: 'onHandQty', headerName: '보유', width: 90, cellClass: 'ag-right-aligned-cell font-medium',
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'alocQty', headerName: '예약', width: 90,
            headerTooltip: '예약 수량 — 예약분은 보류할 수 없다 (보류는 가용에서만)',
            cellClass: (p) => `ag-right-aligned-cell ${p.value > 0 ? 'text-amber-600 font-bold' : 'text-slate-300'}`,
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'hldQty', headerName: '보류', width: 90,
            headerTooltip: '이미 보류된 수량',
            cellClass: (p) => `ag-right-aligned-cell ${p.value > 0 ? 'text-rose-600 font-bold' : 'text-slate-300'}`,
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'avalQty', headerName: '가용', width: 90,
            headerTooltip: '가용재고 = 보유 - 예약 - 보류. 보류 가능한 상한',
            cellClass: 'ag-right-aligned-cell font-bold text-emerald-600',
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'qty', headerName: '보류수량', width: 100, editable: true,
            headerTooltip: '보류할 수량 — 가용재고가 상한, 부분수량 보류 가능',
            cellClass: 'ag-right-aligned-cell bg-indigo-50 font-bold',
            cellRenderer: (p) => (p.value == null
                ? <span className="text-slate-300 font-normal">—</span>
                : num(p.value)),
        },
        {
            field: 'rsnCd', headerName: '보류사유', width: 130, editable: true,
            headerTooltip: '수량을 입력한 행만 필수. 같은 재고라도 사유가 다르면 보류가 병존한다',
            cellEditor: SelectCellEditor,
            cellEditorParams: { values: rsn.values, labelMap: rsn.nmByCd, placeholder: '사유 선택' },
            cellClass: 'bg-indigo-50',
            cellRenderer: (p) => {
                if (!p.value) {
                    return p.data.qty != null
                        ? <span className="text-rose-500 font-bold">사유 필요</span>
                        : <span className="text-slate-300">—</span>;
                }
                return <span>{rsn.nm(p.value)}</span>;
            },
        },
        {
            field: 'rsnDscr', headerName: '기타 사유', width: 170,
            editable: (p) => p.data.rsnCd === ETC_RSN_CD,
            headerTooltip: '사유가 「기타」일 때만 입력한다',
            cellClass: (p) => (p.data.rsnCd === ETC_RSN_CD ? 'bg-indigo-50' : ''),
            cellRenderer: (p) => p.data.rsnCd === ETC_RSN_CD
                ? (p.value || <span className="text-rose-500 font-bold">내용 필요</span>)
                : <span className="text-slate-300">—</span>,
        },
    ], [rsn]);

    const onCellValueChanged = (e) => {
        // 기본 텍스트 에디터는 문자열을 남긴다 — 빈 값은 null로, 그 외는 숫자로 맞춰 올린다
        const raw = e.data.qty;
        const qty = raw === '' || raw == null ? null : Number(raw);
        setRowData(prev => prev.map(r => (r.invId === e.data.invId ? { ...r, ...e.data, qty } : r)));
    };

    const handleSubmit = () => {
        // 편집 중인 셀은 아직 행에 반영되지 않았다 — 열린 에디터를 닫고 나서 그리드에서 직접 걷는다
        gridRef.current?.api.stopEditing();
        const rows = [];
        gridRef.current?.api.forEachNode(n => rows.push(n.data));
        const targets = rows.filter(isEntered);
        if (targets.length === 0) {
            toast('보류수량을 입력한 행이 없습니다.');
            return;
        }
        // 등록이 전량 롤백이라 걸린 행을 하나씩 알리면 고칠 때마다 다음 행이 새로 걸린다 —
        // 한 번에 다 보여줘서 한 번의 수정으로 다시 시도할 수 있게 한다
        const errors = [];
        for (const r of targets) {
            const where = `${r.prodCd} / ${r.locCd} / ${r.lotNo}`;
            const n = Number(r.qty);
            if (!(n > 0)) {
                errors.push(`${where}: 보류수량은 1 이상이어야 합니다.`);
            } else if (n > r.avalQty) {
                errors.push(`${where}: 가용재고(${num(r.avalQty)})를 초과했습니다.`);
            } else if (!r.rsnCd) {
                errors.push(`${where}: 보류사유를 선택하세요.`);
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

    const doRegister = async (targets) => {
        try {
            const hldNos = await invHldApi.register(targets.map(r => ({
                invId: r.invId,
                qty: Number(r.qty),
                rsnCd: r.rsnCd,
                rsnDscr: r.rsnCd === ETC_RSN_CD ? String(r.rsnDscr).trim() : null,
            })));
            toast.success(`보류 ${hldNos.length}건을 등록했습니다 (${hldNos.join(', ')}).`);
            fetchStock(); // 보류(hld) 반영된 재고로 갱신 + 입력 초기화
        } catch (e) {
            // 실패하면 재조회하지 않는다 — 전량 롤백이라 서버 값은 그대로이고,
            // 입력을 살려둬야 지적된 행만 고쳐서 다시 시도할 수 있다
            toast.error(e.message || '보류 등록에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <PauseCircle size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">재고 보류등록</h2>
                <span className="text-xs text-slate-400 mt-0.5">등록 즉시 가용재고에서 빠진다 (할당·이동 대상 제외) · 실물과 보유수량은 그대로 · 부분수량 보류 가능</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchStock}>
                <SearchText name="prodCd" label="상품 코드" placeholder="PROD-0001" />
                <SearchText name="prodNm" label="상품명" placeholder="상품명 일부" />
                <SearchText name="locCd" label="로케이션" placeholder="DRY-A-01-01" />
                <SearchText name="lotNo" label="Lot번호" placeholder="LOT-260722-001" />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-slate-500 font-medium">보관 재고 {rowData.length}건 (가용 &gt; 0)</span>
                    <span className="text-[11px] text-slate-400">보류수량·보류사유를 행에서 바로 입력한 뒤 등록 — 전체가 한 트랜잭션이라 한 건이라도 실패하면 전량 취소됩니다</span>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-bold ${entered.length > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                            입력 {num(entered.length)}건 · 총 {num(totalQty)}개
                        </span>
                        <button
                            onClick={handleSubmit}
                            className="flex items-center gap-1 px-4 py-2 bg-rose-600 rounded-lg text-sm font-bold text-white hover:bg-rose-700 transition-colors">
                            <PauseCircle size={14} /> 보류 등록
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
                        onCellValueChanged={onCellValueChanged}
                    />
                </div>
            </div>

            {/* 등록 확인 모달 */}
            {confirmTargets && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20"
                     onMouseDown={() => setConfirmTargets(null)}>
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[440px] flex flex-col gap-4"
                         onMouseDown={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-800">보류를 등록하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {confirmTargets.length}건 · 총 <b className="text-rose-600">{num(confirmTargets.reduce((s, r) => s + Number(r.qty), 0))}개</b> — 등록 즉시 <b>가용재고에서 제외</b>되어 할당·이동 대상에서 빠집니다. 실물과 보유수량은 그대로입니다.
                        </p>
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                            {confirmTargets.map(r => (
                                <span key={r.invId} className="text-xs text-slate-500">
                                    {r.prodCd} · <span className="font-mono">{r.locCd}</span> · {r.lotNo} · {rsn.nm(r.rsnCd)} <b>{num(Number(r.qty))}개</b>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConfirmTargets(null)}
                                className="btn-modal-cancel">
                                취소
                            </button>
                            <button
                                onClick={() => { const t = confirmTargets; setConfirmTargets(null); doRegister(t); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700">
                                등록
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
