import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ListChecks, PlayCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchText, SearchSelect } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import { invHldApi } from '@/api/invHldApi';
import { ETC_RSN_CD } from '@/constants/rsnCodes';
import { INV_HLD_STATUS_META } from '@/constants/badgeMeta';
import { codeApi } from '@/api/codeApi';
import { toSearchOptions } from '@/constants/codeOptions';
import { Badge } from '@/components/common/Badge';
import { fmtDt, num } from '@/utils/format';


const STATUS_OPTIONS = [
    { value: '', label: '전체' },
    ...Object.entries(INV_HLD_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];

export default function StockHoldList() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ hldNo: '', prodCd: '', locCd: '', rsnCd: '', status: '' });
    const [rsnCodes, setRsnCodes] = useState([]);       // 보류사유 (조회 필터 + 그리드 표시)
    const [rlzRsnCodes, setRlzRsnCodes] = useState([]); // 해제사유 (해제 입력)
    const [selected, setSelected] = useState(null);
    const [qty, setQty] = useState('');
    const [rlzRsnCd, setRlzRsnCd] = useState('');
    const [rlzRsnDscr, setRlzRsnDscr] = useState('');
    const [releaseTarget, setReleaseTarget] = useState(null); // 해제 확인 모달 대상
    const gridRef = useRef(null);
    const pendingSelectRef = useRef(null); // 재조회 후 같은 건을 다시 선택 (부분 해제 시 유지)

    const rsnNm = (cd) => rsnCodes.find(c => c.codeCd === cd)?.codeNm ?? cd;

    // 사유코드 → 사유명 매핑이 그리드 표시에 필요해 컬럼 정의를 컴포넌트 안에 둔다
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
        { field: 'lotNo', headerName: 'Lot번호', width: 130 },
        {
            field: 'rsnCd', headerName: '보류사유', width: 130,
            cellRenderer: (p) => (
                <span className="text-xs">
                    <b className="text-rose-600">{rsnNm(p.value)}</b>
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
        { field: 'createdAt', headerName: '등록일시', width: 140, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
        { field: 'rlzDt', headerName: '해제일시', width: 140, valueFormatter: (p) => fmtDt(p.value), cellClass: 'text-slate-500' },
    ], [rsnCodes]);

    const fetchList = async (keepSelection = false) => {
        if (keepSelection) {
            pendingSelectRef.current = selected ? selected.invHldId : null;
        } else {
            setSelected(null);
            setQty('');
        }
        const data = await invHldApi.list(cond);
        setRowData(data);
    };

    const onModelUpdated = (p) => {
        if (pendingSelectRef.current == null) return;
        const hldId = pendingSelectRef.current;
        pendingSelectRef.current = null;
        p.api.forEachNode(n => { if (n.data.invHldId === hldId) n.setSelected(true); });
    };

    useEffect(() => {
        invHldApi.list().then(setRowData);
        codeApi.list('HLD_RSN').then(setRsnCodes);
        codeApi.list('HLD_RLZ_RSN').then(setRlzRsnCodes);
    }, []);

    const rlzRsnOptions = useMemo(() => rlzRsnCodes.map(c => ({ value: c.codeCd, label: c.codeNm })), [rlzRsnCodes]);
    const rlzRsnNm = (cd) => rlzRsnCodes.find(c => c.codeCd === cd)?.codeNm ?? cd;

    const onSelectionChanged = (e) => {
        const node = e.api.getSelectedNodes()[0];
        if (!node) {
            setSelected(null);
            setQty('');
            return;
        }
        setSelected(node.data);
        setQty(String(node.data.remainingQty));
    };

    const handleReleaseClick = () => {
        const n = Number(qty);
        if (!(n > 0)) {
            toast.error('해제수량은 1 이상이어야 합니다.');
            return;
        }
        if (n > selected.remainingQty) {
            toast.error(`미해제 잔량을 초과했습니다 (잔량 ${num(selected.remainingQty)}).`);
            return;
        }
        if (!rlzRsnCd) {
            toast.error('해제사유를 선택하세요.');
            return;
        }
        if (rlzRsnCd === ETC_RSN_CD && !rlzRsnDscr.trim()) {
            toast.error('사유가 기타일 때는 사유 내용을 입력해야 합니다.');
            return;
        }
        setReleaseTarget({ ...selected, qty: n, rlzRsnCd, rlzRsnDscr: rlzRsnCd === ETC_RSN_CD ? rlzRsnDscr.trim() : '' });
    };

    const doRelease = async (target) => {
        try {
            await invHldApi.release(target.invHldId, { qty: target.qty, rsnCd: target.rlzRsnCd, rsnDscr: target.rlzRsnDscr || null });
            toast.success(`${target.hldNo} — ${num(target.qty)}개를 해제했습니다 (가용재고 복귀).`);
            setRlzRsnCd('');
            setRlzRsnDscr('');
            fetchList(target.qty < target.remainingQty); // 잔량이 남으면 같은 건 선택 유지
        } catch (e) {
            toast.error(e.message || '보류 해제에 실패했습니다.');
        }
    };

    const actionable = selected?.status === 'HELD';

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
                <SearchText name="prodCd" label="상품 코드" placeholder="PROD-0001" />
                <SearchText name="locCd" label="로케이션" placeholder="DRY-A-01-01" />
                <SearchSelect name="rsnCd" label="보류사유" options={toSearchOptions(rsnCodes)} />
                <SearchSelect name="status" label="상태" options={STATUS_OPTIONS} />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <span className="text-xs text-slate-500 font-medium">{rowData.length}건</span>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        ref={gridRef}
                        rowData={rowData}
                        columnDefs={columnDefs}
                        rowHeight={34}
                        headerHeight={38}
                        rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                        onSelectionChanged={onSelectionChanged}
                        onModelUpdated={onModelUpdated}
                    />
                </div>

                {/* 해제 실행 영역 */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col gap-3 shrink-0">
                    {!selected ? (
                        <span className="text-xs text-slate-400">위에서 보류 건을 선택하세요.</span>
                    ) : !actionable ? (
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-bold text-slate-700">{selected.hldNo}</span>
                            <Badge meta={INV_HLD_STATUS_META} value={selected.status} show="label" />
                            <span className="text-xs text-slate-400">전량 해제된 건입니다 — 다시 보류하려면 보류등록 탭에서 새로 등록하세요.</span>
                        </div>
                    ) : (
                        <div className="flex items-end gap-3">
                            <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
                                <span className="font-bold text-slate-700 truncate">{selected.hldNo}</span>
                                <span className="text-xs text-slate-400 shrink-0">
                                    {selected.prodCd} · <span className="font-mono">{selected.locCd}</span> · {selected.lotNo} · {rsnNm(selected.rsnCd)} · 잔량 {num(selected.remainingQty)}개
                                </span>
                            </div>
                            <div className="flex flex-col gap-1 w-28 shrink-0">
                                <label className="text-xs font-bold text-slate-500">해제수량</label>
                                <input
                                    type="number"
                                    min="1"
                                    max={selected.remainingQty}
                                    value={qty}
                                    onChange={(e) => setQty(e.target.value)}
                                    className="input-num"
                                />
                            </div>
                            <div className="flex flex-col gap-1 w-40 shrink-0">
                                <label className="text-xs font-bold text-slate-500">해제사유</label>
                                <DropdownSelect
                                    value={rlzRsnCd}
                                    onChange={setRlzRsnCd}
                                    options={rlzRsnOptions}
                                    placeholder="사유 선택"
                                />
                            </div>
                            {rlzRsnCd === ETC_RSN_CD && (
                                <div className="flex flex-col gap-1 w-64 shrink-0">
                                    <label className="text-xs font-bold text-slate-500">기타 사유 <span className="text-rose-500">*</span></label>
                                    <input
                                        type="text"
                                        maxLength={200}
                                        value={rlzRsnDscr}
                                        onChange={(e) => setRlzRsnDscr(e.target.value)}
                                        placeholder="사유 내용 입력"
                                        className="input-base"
                                    />
                                </div>
                            )}
                            <button
                                onClick={handleReleaseClick}
                                className="flex items-center gap-1 px-4 py-2 bg-emerald-600 rounded-lg text-sm font-bold text-white hover:bg-emerald-700 transition-colors shrink-0">
                                <PlayCircle size={14} /> 보류 해제
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* 해제 확인 모달 */}
            {releaseTarget && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">보류를 해제하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {releaseTarget.prodCd} {releaseTarget.prodNm} · <b className="text-emerald-600">{num(releaseTarget.qty)}개</b>가 가용재고로 복귀합니다.
                        </p>
                        <p className="text-xs text-slate-400">
                            해제사유: <b>{rlzRsnNm(releaseTarget.rlzRsnCd)}</b>{releaseTarget.rlzRsnDscr && ` — ${releaseTarget.rlzRsnDscr}`}
                        </p>
                        {releaseTarget.qty < releaseTarget.remainingQty && (
                            <p className="text-xs text-amber-600">부분 해제 — 잔량 {num(releaseTarget.remainingQty - releaseTarget.qty)}개는 보류 상태로 남습니다.</p>
                        )}
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setReleaseTarget(null)}
                                className="btn-modal-cancel">
                                취소
                            </button>
                            <button
                                onClick={() => { doRelease(releaseTarget); setReleaseTarget(null); }}
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
