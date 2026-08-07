import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Tags, Save, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchText, SearchDateRange } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import { lotAttrChngApi } from '@/api/lotAttrChngApi';
import { codeApi } from '@/api/codeApi';
import { ETC_RSN_CD, LOT_ATTR_RSN_GRP } from '@/constants/rsnCodes';
import { num } from '@/utils/format';

/**
 * "YYYY-MM-DD" + n일. toISOString()을 쓰지 않는 이유는 그게 UTC로 변환하기 때문이다
 * (utils/format.js의 ymd와 같은 판단) — 로컬 연·월·일로 조립한다.
 */
const addDays = (dateStr, n) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    const p = (v) => String(v).padStart(2, '0');
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

const COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'prodCd', headerName: '상품 코드', width: 115 },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 160 },
    { field: 'lotNo', headerName: 'Lot번호', width: 140 },
    {
        field: 'receiptDt', headerName: '입고일자', width: 110, cellClass: 'text-slate-500',
        headerTooltip: '정정 대상이 아니다 — 배치 재사용 키이자 Lot번호의 근거라 바꾸면 번호와 어긋난다',
    },
    { field: 'mfgDt', headerName: '제조일자', width: 110, cellClass: 'font-medium' },
    { field: 'expiryDt', headerName: '유통기한', width: 110, cellClass: 'font-bold text-indigo-700' },
    {
        field: 'invRowCnt', headerName: '재고 행', width: 90,
        headerTooltip: '이 Lot을 쓰는 재고 행 수 — 정정은 로케이션이 달라도 전부에 일괄 반영된다',
        cellClass: (p) => `ag-right-aligned-cell ${p.value > 0 ? 'text-slate-700' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
    {
        field: 'onHandQty', headerName: '보유 합계', width: 100,
        cellClass: (p) => `ag-right-aligned-cell font-bold ${p.value > 0 ? 'text-emerald-600' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
];

/**
 * Lot 속성 정정. 재고는 움직이지 않고 lot 행만 갱신되며, 정정의 원장은 lot_attr_chng 1행이다.
 *
 * 정정 즉시 FEFO 정렬과 점포 잔여수명 필터가 새 값을 보지만, **이미 생성된 할당은 건드리지 않는다**
 * (재검증·재할당 없음 — 이후 할당부터 반영). 되돌리려면 반대 방향 정정을 한 번 더 한다.
 */
export default function StockAttrChange() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ prodCd: '', prodNm: '', lotNo: '', expiryFrom: '', expiryTo: '' });
    const [onlyInStock, setOnlyInStock] = useState(true);
    const [rsnCodes, setRsnCodes] = useState([]);
    const [selected, setSelected] = useState(null);
    const [mfgDt, setMfgDt] = useState('');
    const [expiryDt, setExpiryDt] = useState('');
    const [rsnCd, setRsnCd] = useState('');
    const [rsnDscr, setRsnDscr] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);

    const fetchTargets = async (inStock = onlyInStock) => {
        setRowData(await lotAttrChngApi.listTargets({ ...cond, onlyInStock: inStock || undefined }));
    };

    useEffect(() => {
        lotAttrChngApi.listTargets({ onlyInStock: true }).then(setRowData);
        codeApi.list(LOT_ATTR_RSN_GRP).then(setRsnCodes);
    }, []);

    const rsnOptions = useMemo(() => rsnCodes.map(c => ({ value: c.codeCd, label: c.codeNm })), [rsnCodes]);
    const rsnNm = (cd) => rsnCodes.find(c => c.codeCd === cd)?.codeNm ?? cd;

    const onSelectionChanged = (e) => {
        const node = e.api.getSelectedNodes()[0];
        setSelected(node ? node.data : null);
        setMfgDt(node ? (node.data.mfgDt ?? '') : '');
        setExpiryDt(node ? (node.data.expiryDt ?? '') : '');
        setRsnDscr('');
    };

    /**
     * 제조일자를 바꾸면 유통기한 기본값(제조일자 + 유통기한일수)을 제안한다.
     * 강제가 아니다 — 벤더 인쇄 유통기한과 계산값이 다른 것이 이 화면의 주 사용처라
     * 사용자가 그대로 덮어쓸 수 있다 (서버도 expiry >= mfg만 본다).
     */
    const handleMfgChange = (v) => {
        setMfgDt(v);
        if (v && selected?.shelfLifeDays != null) setExpiryDt(addDays(v, selected.shelfLifeDays));
    };

    const dirty = selected && (mfgDt !== (selected.mfgDt ?? '') || expiryDt !== (selected.expiryDt ?? ''));

    const validate = () => {
        if (!selected) return '정정할 Lot을 선택하세요.';
        if (!mfgDt || !expiryDt) return '제조일자와 유통기한은 모두 필수입니다.';
        if (selected.receiptDt && mfgDt > selected.receiptDt) {
            return `제조일자가 입고일자보다 미래일 수 없습니다 (입고 ${selected.receiptDt}).`;
        }
        if (expiryDt < mfgDt) return '유통기한이 제조일자보다 이전일 수 없습니다.';
        if (!dirty) return '변경 전후 값이 같습니다 — 정정할 내용이 없습니다.';
        if (!rsnCd) return '정정사유를 선택하세요.';
        if (rsnCd === ETC_RSN_CD && !rsnDscr.trim()) return '사유가 기타일 때는 사유 내용을 입력해야 합니다.';
        return null;
    };

    const handleSave = async () => {
        try {
            await lotAttrChngApi.change(selected.lotId, {
                mfgDt, expiryDt, rsnCd,
                rsnDscr: rsnCd === ETC_RSN_CD ? rsnDscr.trim() : null,
            });
            // 성공 응답을 받고 나서 초기화·재조회한다 — 먼저 비우면 저장 실패 시 입력이 사라진다
            toast.success(`${selected.lotNo} 속성을 정정했습니다.`);
            setSelected(null);
            setMfgDt('');
            setExpiryDt('');
            setRsnCd('');
            setRsnDscr('');
            fetchTargets();
        } catch (e) {
            toast.error(e.message || '속성 정정에 실패했습니다.');
        }
    };

    const handleSubmit = () => {
        const err = validate();
        if (err) {
            toast.error(err);
            return;
        }
        setConfirmOpen(true);
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Tags size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">Lot 속성 정정</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    제조일자·유통기한 오입력 정정 · 재고 수량은 변하지 않는다 · 정정 즉시 이후 FEFO 할당에 반영(기존 할당은 불변)
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={() => fetchTargets()}>
                <SearchText name="prodCd" label="상품 코드" placeholder="PROD-0001" />
                <SearchText name="prodNm" label="상품명" placeholder="상품명 일부" />
                <SearchText name="lotNo" label="Lot번호" placeholder="LOT-260722-001" />
                <SearchDateRange from="expiryFrom" to="expiryTo" label="유통기한" />
            </SearchBar>

            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 font-medium">
                        유통기한 관리 상품의 Lot {rowData.length}건
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={onlyInStock}
                            onChange={(e) => { setOnlyInStock(e.target.checked); fetchTargets(e.target.checked); }}
                            className="accent-indigo-600"
                        />
                        재고 있는 Lot만
                    </label>
                    <span className="text-[11px] text-slate-400">
                        유통기한 미관리 상품의 Lot은 두 날짜가 항상 비어 있는 것이 정의라 목록에 없습니다
                    </span>
                </div>
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

                {/* 정정 입력 영역 */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col gap-3 shrink-0">
                    {!selected ? (
                        <span className="text-xs text-slate-400">위에서 정정할 Lot을 선택하세요.</span>
                    ) : (
                        <>
                            <div className="flex items-end gap-3 flex-wrap">
                                <div className="flex items-center gap-2 text-sm min-w-0">
                                    <span className="font-bold text-slate-700 truncate">{selected.prodCd} {selected.prodNm}</span>
                                    <span className="text-xs text-slate-400 shrink-0">
                                        {selected.lotNo} · 입고 {selected.receiptDt ?? '-'} · 유통기한일수 {num(selected.shelfLifeDays)}일
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1 w-40 shrink-0">
                                    <label className="text-xs font-bold text-slate-500">
                                        제조일자 {mfgDt !== (selected.mfgDt ?? '') && <span className="text-amber-600">변경</span>}
                                    </label>
                                    <input
                                        type="date"
                                        value={mfgDt}
                                        max={selected.receiptDt ?? undefined}
                                        onChange={(e) => handleMfgChange(e.target.value)}
                                        className="input-base"
                                    />
                                </div>
                                <div className="flex flex-col gap-1 w-40 shrink-0">
                                    <label className="text-xs font-bold text-slate-500">
                                        유통기한 {expiryDt !== (selected.expiryDt ?? '') && <span className="text-amber-600">변경</span>}
                                    </label>
                                    <input
                                        type="date"
                                        value={expiryDt}
                                        min={mfgDt || undefined}
                                        onChange={(e) => setExpiryDt(e.target.value)}
                                        className="input-base"
                                    />
                                </div>
                                <div className="flex flex-col gap-1 w-44 shrink-0">
                                    <label className="text-xs font-bold text-slate-500">정정사유</label>
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
                                            className="input-base"
                                        />
                                    </div>
                                )}
                                <button
                                    onClick={handleSubmit}
                                    className="flex items-center gap-1 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-colors shrink-0">
                                    <Save size={14} /> 정정
                                </button>
                            </div>

                            {/* 영향 범위 — Lot 단위 정정이라 로케이션이 달라도 전부에 일괄 반영된다 */}
                            <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-xs">
                                <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                                <span className="text-slate-500">
                                    이 Lot을 쓰는 재고 <b className="text-slate-700">{num(selected.invRowCnt)}행 · 보유 {num(selected.onHandQty)}개</b>에
                                    일괄 반영됩니다 (로케이션이 달라도 전부). 수량은 변하지 않습니다.
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 정정 확인 모달 */}
            {confirmOpen && selected && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[480px] flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">Lot 속성을 정정하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            <b className="text-slate-700">{selected.lotNo}</b> ({selected.prodCd} {selected.prodNm}) —
                            재고 <b>{num(selected.invRowCnt)}행 · 보유 {num(selected.onHandQty)}개</b>에 일괄 반영됩니다.
                            수량은 변하지 않고, <b>취소 경로가 없어</b> 되돌리려면 반대 방향 정정을 다시 해야 합니다.
                        </p>
                        <div className="flex flex-col gap-1 text-xs bg-slate-50 rounded-lg p-3">
                            <div className="flex gap-2">
                                <span className="w-16 text-slate-400 font-bold">제조일자</span>
                                <span className="text-slate-500">{selected.mfgDt ?? '-'}</span>
                                <span className="text-slate-300">→</span>
                                <b className={mfgDt !== (selected.mfgDt ?? '') ? 'text-amber-600' : 'text-slate-500'}>{mfgDt}</b>
                            </div>
                            <div className="flex gap-2">
                                <span className="w-16 text-slate-400 font-bold">유통기한</span>
                                <span className="text-slate-500">{selected.expiryDt ?? '-'}</span>
                                <span className="text-slate-300">→</span>
                                <b className={expiryDt !== (selected.expiryDt ?? '') ? 'text-amber-600' : 'text-slate-500'}>{expiryDt}</b>
                            </div>
                            <div className="flex gap-2">
                                <span className="w-16 text-slate-400 font-bold">사유</span>
                                <b className="text-slate-600">{rsnNm(rsnCd)}</b>
                                {rsnCd === ETC_RSN_CD && <span className="text-slate-400">— {rsnDscr}</span>}
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setConfirmOpen(false)} className="btn-modal-cancel">
                                취소
                            </button>
                            <button
                                onClick={() => { setConfirmOpen(false); handleSave(); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                                정정
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
