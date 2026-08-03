import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { PauseCircle, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import { invApi } from '@/api/invApi';
import { invHldApi, ETC_RSN_CD } from '@/api/invHldApi';
import { codeApi } from '@/api/codeApi';
import { TEMP_ZONE_META } from '@/api/prodApi';

const num = (v) => (v == null ? '' : Number(v).toLocaleString());

const TempZoneBadge = ({ value }) => {
    const meta = TEMP_ZONE_META[value];
    if (!meta) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${meta.badge}`}>
            {meta.label} {value}
        </span>
    );
};

const COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'prodCd', headerName: '상품 코드', width: 115 },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 180 },
    {
        field: 'tmpZon', headerName: '온도대', width: 100,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <TempZoneBadge value={p.value} />,
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
        field: 'availableQty', headerName: '가용', width: 90,
        headerTooltip: '가용재고 = 보유 - 예약 - 보류. 보류 가능한 상한',
        cellClass: 'ag-right-aligned-cell font-bold text-emerald-600',
        valueFormatter: (p) => num(p.value),
    },
];

export default function StockHoldRegister() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ prodCd: '', prodNm: '', locCd: '', lotNo: '' });
    const [rsnCodes, setRsnCodes] = useState([]); // 보류사유 공통코드 (HLD_RSN)
    const [selected, setSelected] = useState(null);
    const [qty, setQty] = useState('');
    const [rsnCd, setRsnCd] = useState('');
    const [rsnDscr, setRsnDscr] = useState('');
    const [cart, setCart] = useState([]); // 등록 대기 보류 목록
    const [confirmOpen, setConfirmOpen] = useState(false);

    // 보류 대상은 보관 재고뿐이다 (v1 — 스테이징 보류는 적치·출고확정 파급을 수반해 제외)
    const fetchStock = async () => {
        const data = await invApi.list({ ...cond, locTyp: 'STORAGE' });
        setRowData(data.filter(r => r.availableQty > 0));
    };

    useEffect(() => {
        let ignore = false;
        invApi.list({ locTyp: 'STORAGE' }).then(data => { if (!ignore) setRowData(data.filter(r => r.availableQty > 0)); });
        codeApi.list('HLD_RSN').then(codes => { if (!ignore) setRsnCodes(codes); });
        return () => { ignore = true; };
    }, []);

    const rsnOptions = useMemo(() => rsnCodes.map(c => ({ value: c.codeCd, label: c.codeNm })), [rsnCodes]);
    const rsnNm = (cd) => rsnCodes.find(c => c.codeCd === cd)?.codeNm ?? cd;

    // 같은 재고 행을 장바구니에 여러 번 담을 수 있으므로, 남은 가용 = 가용 - 담긴 수량 합
    const cartQtyByInv = useMemo(() => {
        const m = {};
        cart.forEach(c => { m[c.invId] = (m[c.invId] ?? 0) + c.qty; });
        return m;
    }, [cart]);

    const remainingAvailable = (row) => row.availableQty - (cartQtyByInv[row.invId] ?? 0);

    const onSelectionChanged = (e) => {
        const node = e.api.getSelectedNodes()[0];
        if (!node) {
            setSelected(null);
            setQty('');
            return;
        }
        setSelected(node.data);
        setQty(String(remainingAvailable(node.data)));
    };

    const handleAdd = () => {
        if (!selected) {
            toast('보류할 재고를 선택하세요.');
            return;
        }
        const n = Number(qty);
        if (!(n > 0)) {
            toast.error('보류수량은 1 이상이어야 합니다.');
            return;
        }
        const remain = remainingAvailable(selected);
        if (n > remain) {
            toast.error(`가용재고를 초과했습니다 (담은 수량 포함 남은 가용 ${num(remain)}).`);
            return;
        }
        if (!rsnCd) {
            toast.error('보류사유를 선택하세요.');
            return;
        }
        if (rsnCd === ETC_RSN_CD && !rsnDscr.trim()) {
            toast.error('사유가 기타일 때는 사유 내용을 입력해야 합니다.');
            return;
        }
        // 같은 재고 행 + 같은 사유는 서버가 중복 차단한다 — 장바구니에서도 미리 막는다
        if (cart.some(c => c.invId === selected.invId && c.rsnCd === rsnCd)) {
            toast.error('같은 재고에 같은 사유의 보류를 이미 담았습니다 (사유가 다를 때만 병존 가능).');
            return;
        }
        setCart(prev => [...prev, {
            invId: selected.invId,
            prodCd: selected.prodCd,
            prodNm: selected.prodNm,
            locCd: selected.locCd,
            lotNo: selected.lotNo,
            qty: n,
            rsnCd,
            rsnDscr: rsnCd === ETC_RSN_CD ? rsnDscr.trim() : '',
        }]);
        setQty(String(remain - n));
        setRsnDscr('');
    };

    const handleRegister = async () => {
        try {
            const hldNos = await invHldApi.register(cart.map(c => ({ invId: c.invId, qty: c.qty, rsnCd: c.rsnCd, rsnDscr: c.rsnDscr || null })));
            toast.success(`보류 ${hldNos.length}건을 등록했습니다 (${hldNos.join(', ')}).`);
            setCart([]);
            setSelected(null);
            setQty('');
            setRsnCd('');
            setRsnDscr('');
            fetchStock(); // 보류(hld) 반영된 재고로 갱신
        } catch (e) {
            toast.error(e.message || '보류 등록에 실패했습니다.');
        }
    };

    const totalCartQty = cart.reduce((s, c) => s + c.qty, 0);

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <PauseCircle size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">재고 보류등록</h2>
                <span className="text-xs text-slate-400 mt-0.5">등록 즉시 가용재고에서 빠진다 (할당·이동 대상 제외) · 실물과 보유수량은 그대로 · 부분수량 보류 가능</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" onSearch={fetchStock}>
                <SearchItem label="상품 코드">
                    <input
                        type="text"
                        value={cond.prodCd}
                        onChange={(e) => setCond(prev => ({ ...prev, prodCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchStock()}
                        placeholder="PROD-0001"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="상품명">
                    <input
                        type="text"
                        value={cond.prodNm}
                        onChange={(e) => setCond(prev => ({ ...prev, prodNm: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchStock()}
                        placeholder="상품명 일부"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="로케이션">
                    <input
                        type="text"
                        value={cond.locCd}
                        onChange={(e) => setCond(prev => ({ ...prev, locCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchStock()}
                        placeholder="DRY-A-01-01"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="Lot번호">
                    <input
                        type="text"
                        value={cond.lotNo}
                        onChange={(e) => setCond(prev => ({ ...prev, lotNo: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchStock()}
                        placeholder="LOT-260722-001"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <span className="text-xs text-slate-500 font-medium">보관 재고 {rowData.length}건 (가용 &gt; 0)</span>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        rowData={rowData}
                        columnDefs={COLUMN_DEFS}
                        rowHeight={34}
                        headerHeight={38}
                        rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                        onSelectionChanged={onSelectionChanged}
                    />
                </div>

                {/* 담기 입력 영역 */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col gap-3 shrink-0">
                    {!selected ? (
                        <span className="text-xs text-slate-400">위에서 보류할 재고를 선택하세요.</span>
                    ) : (
                        <div className="flex items-end gap-3">
                            <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
                                <span className="font-bold text-slate-700 truncate">{selected.prodCd} {selected.prodNm}</span>
                                <TempZoneBadge value={selected.tmpZon} />
                                <span className="text-xs text-slate-400 shrink-0">
                                    {selected.locCd} · {selected.lotNo} · 남은 가용 {num(remainingAvailable(selected))}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1 w-28 shrink-0">
                                <label className="text-xs font-bold text-slate-500">보류수량</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={qty}
                                    onChange={(e) => setQty(e.target.value)}
                                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                                />
                            </div>
                            <div className="flex flex-col gap-1 w-40 shrink-0">
                                <label className="text-xs font-bold text-slate-500">보류사유</label>
                                <DropdownSelect
                                    value={rsnCd}
                                    onChange={setRsnCd}
                                    options={rsnOptions}
                                    placeholder="사유 선택"
                                />
                            </div>
                            {rsnCd === ETC_RSN_CD && (
                                <div className="flex flex-col gap-1 w-64 shrink-0">
                                    <label className="text-xs font-bold text-slate-500">기타 사유 <span className="text-rose-500">*</span></label>
                                    <input
                                        type="text"
                                        maxLength={200}
                                        value={rsnDscr}
                                        onChange={(e) => setRsnDscr(e.target.value)}
                                        placeholder="사유 내용 입력"
                                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                                    />
                                </div>
                            )}
                            <button
                                onClick={handleAdd}
                                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-colors shrink-0">
                                <Plus size={14} /> 담기
                            </button>
                        </div>
                    )}

                    {/* 등록 대기 보류 목록 */}
                    {cart.length > 0 && (
                        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500">등록 대기 {cart.length}건 · 총 {num(totalCartQty)}개</span>
                                <span className="text-[11px] text-slate-400">등록 시 전체가 한 트랜잭션 — 한 건이라도 실패하면 전량 취소됩니다</span>
                                <button
                                    onClick={() => setConfirmOpen(true)}
                                    className="ml-auto flex items-center gap-1 px-4 py-2 bg-rose-600 rounded-lg text-sm font-bold text-white hover:bg-rose-700 transition-colors">
                                    <PauseCircle size={14} /> 보류 등록
                                </button>
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[11px] text-slate-400 font-bold text-left border-b border-slate-100">
                                        <th className="py-1.5 pr-2">상품</th>
                                        <th className="py-1.5 pr-2">로케이션</th>
                                        <th className="py-1.5 pr-2">Lot번호</th>
                                        <th className="py-1.5 pr-2">사유</th>
                                        <th className="py-1.5 pr-2 text-right">수량</th>
                                        <th className="py-1.5 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cart.map((c, i) => (
                                        <tr key={i} className="border-b border-slate-50 last:border-0">
                                            <td className="py-1.5 pr-2 text-slate-700">{c.prodCd} <span className="text-slate-400">{c.prodNm}</span></td>
                                            <td className="py-1.5 pr-2 font-mono text-xs text-slate-500">{c.locCd}</td>
                                            <td className="py-1.5 pr-2 font-mono text-xs text-slate-500">{c.lotNo}</td>
                                            <td className="py-1.5 pr-2 text-xs">
                                                <b className="text-rose-600">{rsnNm(c.rsnCd)}</b>
                                                {c.rsnDscr && <span className="text-slate-400"> — {c.rsnDscr}</span>}
                                            </td>
                                            <td className="py-1.5 pr-2 text-right font-bold">{num(c.qty)}</td>
                                            <td className="py-1.5 text-center">
                                                <button
                                                    onClick={() => setCart(prev => prev.filter((_, j) => j !== i))}
                                                    className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50"
                                                    title="목록에서 제거">
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* 등록 확인 모달 */}
            {confirmOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[440px] flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">보류를 등록하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {cart.length}건 · 총 <b className="text-rose-600">{num(totalCartQty)}개</b> — 등록 즉시 <b>가용재고에서 제외</b>되어 할당·이동 대상에서 빠집니다. 실물과 보유수량은 그대로입니다.
                        </p>
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                            {cart.map((c, i) => (
                                <span key={i} className="text-xs text-slate-500">
                                    {c.prodCd} · <span className="font-mono">{c.locCd}</span> · {c.lotNo} · {rsnNm(c.rsnCd)} <b>{num(c.qty)}개</b>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConfirmOpen(false)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                취소
                            </button>
                            <button
                                onClick={() => { handleRegister(); setConfirmOpen(false); }}
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
