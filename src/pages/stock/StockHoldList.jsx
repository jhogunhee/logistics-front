import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ListChecks, PlayCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import { invHldApi } from '@/api/invHldApi';
import { useCodes } from '@/hooks/useCodes';
import { ETC_RSN_CD } from '@/constants/rsnCodes';
import { INV_HLD_STATUS_META } from '@/constants/badgeMeta';
import { fmtDt, num } from '@/utils/format';
import SearchBar, { SearchText, SearchSelect, SearchProd, SearchLoc } from '@/components/common/SearchBar';
import SelectCellEditor from '@/components/common/SelectCellEditor';
import { Badge } from '@/components/common/Badge';

const STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(INV_HLD_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];

// 해제 입력 3필드를 행에 붙인다. `_` 접두사는 서버가 준 값이 아니라는 표시다 —
// rlzQty(해제 누계)와 이름이 겹치지 않아야 한다
const toEditableRow = (r) => ({ ...r, _rlzQty: null, _rlzRsnCd: '', _rlzRsnDscr: '' });

// 수량이든 사유든 손댄 HELD 행이 해제 대상이다 — 반쪽 입력은 대상에 넣어 검증에서 걸리게 한다
const isEntered = (r) => r.status === 'HELD' && (r._rlzQty != null || r._rlzRsnCd !== '');

export default function StockHoldList() {
    const hldRsn = useCodes('HLD_RSN');     // 보류사유 (조회 필터 + 그리드 표시)
    const rlzRsn = useCodes('HLD_RLZ_RSN'); // 해제사유 (그리드 편집)
    const [cond, setCond] = useState({ hldNo: '', prodCd: '', locCd: '', rsnCd: '', status: [] });
    const [rowData, setRowData] = useState([]);
    const [confirmTargets, setConfirmTargets] = useState(null);
    const gridRef = useRef(null);

    const entered = useMemo(() => rowData.filter(isEntered), [rowData]);
    const totalQty = entered.reduce((s, r) => s + (Number(r._rlzQty) || 0), 0);

    // 사유코드 → 사유명 매핑이 그리드 표시·편집에 필요해 컬럼 정의를 컴포넌트 안에 둔다
    const columnDefs = useMemo(() => [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        { field: 'hldNo', headerName: '보류번호', width: 145 },
        {
            field: 'status', headerName: '상태', width: 90,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={INV_HLD_STATUS_META} value={p.value} show="label" />,
        },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 160 },
        { field: 'locCd', headerName: '로케이션', width: 125 },
        { field: 'lotNo', headerName: 'Lot번호', width: 140 },
        {
            field: 'rsnCd', headerName: '보류사유', width: 130,
            cellRenderer: (p) => (
                <span className="text-xs">
                    <b className="text-rose-600">{hldRsn.nm(p.value)}</b>
                    {p.data.rsnDscr && <span className="text-slate-400"> — {p.data.rsnDscr}</span>}
                </span>
            ),
        },
        {
            field: 'hldQty', headerName: '보류', width: 85, cellClass: 'ag-right-aligned-cell font-medium',
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'rlzQty', headerName: '해제', width: 85,
            cellClass: (p) => `ag-right-aligned-cell ${p.value > 0 ? 'text-emerald-600 font-bold' : 'text-slate-300'}`,
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'remainingQty', headerName: '잔량', width: 85,
            headerTooltip: '미해제 잔량 = 보류 - 해제누계. 가용재고에서 빠져 있는 수량',
            cellClass: (p) => `ag-right-aligned-cell font-bold ${p.value > 0 ? 'text-rose-600' : 'text-slate-300'}`,
            valueFormatter: (p) => num(p.value),
        },
        {
            field: '_rlzQty', headerName: '해제수량', width: 100,
            editable: (p) => p.data.status === 'HELD',
            headerTooltip: '이번에 해제할 수량 — 잔량이 상한, 부분 해제 가능. 전량 해제된 건은 입력할 수 없다',
            cellClass: (p) => `ag-right-aligned-cell font-bold ${p.data.status === 'HELD' ? 'bg-emerald-50' : ''}`,
            cellRenderer: (p) => {
                if (p.data.status !== 'HELD') return <span className="text-slate-300 font-normal">—</span>;
                return p.value == null ? <span className="text-slate-300 font-normal">—</span> : num(p.value);
            },
        },
        {
            field: '_rlzRsnCd', headerName: '해제사유', width: 130,
            editable: (p) => p.data.status === 'HELD',
            headerTooltip: '해제수량을 입력한 행만 필수. 오등록 취소도 이 경로다 (사유: 오등록)',
            cellEditor: SelectCellEditor,
            cellEditorParams: { values: rlzRsn.values, labelMap: rlzRsn.nmByCd, placeholder: '사유 선택' },
            cellClass: (p) => (p.data.status === 'HELD' ? 'bg-emerald-50' : ''),
            cellRenderer: (p) => {
                if (p.data.status !== 'HELD') return <span className="text-slate-300">—</span>;
                if (!p.value) {
                    return p.data._rlzQty != null
                        ? <span className="text-rose-500 font-bold">사유 필요</span>
                        : <span className="text-slate-300">—</span>;
                }
                return <span>{rlzRsn.nm(p.value)}</span>;
            },
        },
        {
            field: '_rlzRsnDscr', headerName: '기타 사유', width: 170,
            editable: (p) => p.data.status === 'HELD' && p.data._rlzRsnCd === ETC_RSN_CD,
            headerTooltip: '해제사유가 「기타」일 때만 입력한다',
            cellClass: (p) => (p.data._rlzRsnCd === ETC_RSN_CD ? 'bg-emerald-50' : ''),
            cellRenderer: (p) => p.data._rlzRsnCd === ETC_RSN_CD
                ? (p.value || <span className="text-rose-500 font-bold">내용 필요</span>)
                : <span className="text-slate-300">—</span>,
        },
        { field: 'createdAt', headerName: '등록일시', width: 140, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
        { field: 'rlzDt', headerName: '해제일시', width: 140, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
    ], [hldRsn, rlzRsn]);

    const fetchList = async () => {
        const data = await invHldApi.list(cond);
        setRowData(data.map(toEditableRow));
    };

    useEffect(() => {
        invHldApi.list().then(d => setRowData(d.map(toEditableRow)));
    }, []);

    // 해제사유 셀은 _rlzQty를, 기타 사유 셀은 _rlzRsnCd를 보고 그려진다. 그리드는 제 값이 바뀐
    // 셀만 다시 그리므로 수량만 입력한 행의 사유 셀이 갱신되지 않는다 — 행이 갈릴 때마다 강제로
    // 다시 그린다 (보류등록·Lot 속성 정정과 같은 판단)
    useEffect(() => {
        gridRef.current?.api?.refreshCells({ force: true });
    }, [rowData]);

    const onCellValueChanged = (e) => {
        // 기본 텍스트 에디터는 문자열을 남긴다 — 빈 값은 null로, 그 외는 숫자로 맞춰 올린다
        const raw = e.data._rlzQty;
        const _rlzQty = raw === '' || raw == null ? null : Number(raw);
        setRowData(prev => prev.map(r => (r.invHldId === e.data.invHldId ? { ...r, ...e.data, _rlzQty } : r)));
    };

    const handleSubmit = () => {
        // 편집 중인 셀은 아직 행에 반영되지 않았다 — 열린 에디터를 닫고 나서 그리드에서 직접 걷는다
        gridRef.current?.api.stopEditing();
        const rows = [];
        gridRef.current?.api.forEachNode(n => rows.push(n.data));
        const targets = rows.filter(isEntered);
        if (targets.length === 0) {
            toast('해제수량을 입력한 행이 없습니다.');
            return;
        }
        // 걸린 행을 하나씩 알리면 고칠 때마다 다음 행이 새로 걸린다 — 한 번에 다 보여준다
        const errors = [];
        for (const r of targets) {
            const n = Number(r._rlzQty);
            if (!(n > 0)) {
                errors.push(`${r.hldNo}: 해제수량은 1 이상이어야 합니다.`);
            } else if (n > r.remainingQty) {
                errors.push(`${r.hldNo}: 미해제 잔량(${num(r.remainingQty)})을 초과했습니다.`);
            } else if (!r._rlzRsnCd) {
                errors.push(`${r.hldNo}: 해제사유를 선택하세요.`);
            } else if (r._rlzRsnCd === ETC_RSN_CD && !String(r._rlzRsnDscr ?? '').trim()) {
                errors.push(`${r.hldNo}: 사유가 기타일 때는 사유 내용을 입력해야 합니다.`);
            }
        }
        if (errors.length > 0) {
            toast.error(errors.join('\n'), { style: { whiteSpace: 'pre-line' } });
            return;
        }
        setConfirmTargets(targets);
    };

    const doRelease = async (targets) => {
        try {
            await invHldApi.release(targets.map(t => ({
                hldId: t.invHldId,
                qty: Number(t._rlzQty),
                rsnCd: t._rlzRsnCd,
                rsnDscr: t._rlzRsnCd === ETC_RSN_CD ? String(t._rlzRsnDscr).trim() : null,
            })));
            const qtySum = targets.reduce((s, t) => s + Number(t._rlzQty), 0);
            toast.success(`${targets.length}건 · ${num(qtySum)}개를 해제했습니다 (가용재고 복귀).`);
            fetchList(); // 잔량·상태가 움직인 목록으로 갱신 + 입력 초기화
        } catch (e) {
            // 실패하면 재조회하지 않는다 — 전량 롤백이라 서버 값은 그대로이고,
            // 입력을 살려둬야 지적된 행만 고쳐서 다시 시도할 수 있다
            toast.error(e.message || '보류 해제에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <ListChecks size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">재고 보류 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">보류 건 조회와 해제(부분 허용 — 잔량 이내) · 오등록도 해제(사유: 오등록)로 되돌린다</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={() => fetchList()}>
                <SearchText name="hldNo" label="보류번호" placeholder="HD-20260803-001" />
                <SearchProd name="prodCd" />
                <SearchLoc name="locCd" />
                <SearchSelect name="rsnCd" label="보류사유" options={hldRsn.searchOptions} />
                <SearchSelect name="status" label="상태" options={STATUS_OPTIONS} multiple />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-slate-500 font-medium">{num(rowData.length)}건</span>
                    <span className="text-[11px] text-slate-400">해제수량·해제사유를 행에서 바로 입력한 뒤 해제</span>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-bold ${entered.length > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                            입력 {num(entered.length)}건 · 총 {num(totalQty)}개
                        </span>
                        <button
                            onClick={handleSubmit}
                            className="flex items-center gap-1 px-4 py-2 bg-emerald-600 rounded-lg text-sm font-bold text-white hover:bg-emerald-700 transition-colors">
                            <PlayCircle size={14} /> 보류 해제
                        </button>
                    </div>
                </div>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        ref={gridRef}
                        rowData={rowData}
                        columnDefs={columnDefs}
                        getRowId={(p) => String(p.data.invHldId)}
                        rowHeight={34}
                        headerHeight={38}
                        stopEditingWhenCellsLoseFocus={true}
                        onCellValueChanged={onCellValueChanged}
                    />
                </div>
            </div>

            {/* 해제 확인 모달 */}
            {confirmTargets && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20"
                     onMouseDown={() => setConfirmTargets(null)}>
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[480px] flex flex-col gap-4"
                         onMouseDown={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-800">보류를 해제하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {confirmTargets.length}건 · 총 <b className="text-emerald-600">{num(confirmTargets.reduce((s, t) => s + Number(t._rlzQty), 0))}개</b>가 가용재고로 복귀합니다.
                        </p>
                        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                            {confirmTargets.map(t => (
                                <div key={t.invHldId} className="flex flex-col gap-0.5 text-xs bg-slate-50 rounded-lg p-3">
                                    <div className="flex items-baseline gap-2 min-w-0">
                                        <b className="text-slate-700 truncate">{t.hldNo}</b>
                                        <span className="text-slate-400 truncate">{t.prodCd} {t.prodNm}</span>
                                    </div>
                                    <span className="text-slate-500">
                                        <span className="font-mono">{t.locCd}</span> · {t.lotNo} · {rlzRsn.nm(t._rlzRsnCd)}
                                        {t._rlzRsnCd === ETC_RSN_CD && <span className="text-slate-400"> — {t._rlzRsnDscr}</span>}
                                        {' · '}<b className="text-emerald-600">{num(Number(t._rlzQty))}개</b>
                                    </span>
                                    {Number(t._rlzQty) < t.remainingQty && (
                                        <span className="text-amber-600">
                                            부분 해제 — 잔량 {num(t.remainingQty - Number(t._rlzQty))}개는 보류 상태로 남습니다.
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConfirmTargets(null)}
                                className="btn-modal-cancel">
                                취소
                            </button>
                            <button
                                onClick={() => { const t = confirmTargets; setConfirmTargets(null); doRelease(t); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
                                해제
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
