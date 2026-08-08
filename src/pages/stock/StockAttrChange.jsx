import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Tags, Save, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchText, SearchDateRange } from '@/components/common/SearchBar';
import SelectCellEditor from '@/components/common/SelectCellEditor';
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

/**
 * 조회 결과를 편집 가능한 행으로 만든다. 정정 전 값(_mfgDt0·_expiryDt0)을 행에 같이 들고 있어야
 * 「무엇이 바뀐 행인가」를 셀 색과 저장 대상 판정 양쪽에서 같은 기준으로 볼 수 있다.
 * 날짜는 null 대신 ''로 맞춘다 — 날짜 에디터가 null을 그대로 받으면 값이 없는 채로 열린다.
 */
const toEditableRow = (r) => ({
    ...r,
    mfgDt: r.mfgDt ?? '',
    expiryDt: r.expiryDt ?? '',
    _mfgDt0: r.mfgDt ?? '',
    _expiryDt0: r.expiryDt ?? '',
    rsnCd: '',
    rsnDscr: '',
});

const isChanged = (r) => r.mfgDt !== r._mfgDt0 || r.expiryDt !== r._expiryDt0;

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
    const [confirmTargets, setConfirmTargets] = useState(null);
    const gridRef = useRef(null);

    const fetchTargets = async (inStock = onlyInStock) => {
        const data = await lotAttrChngApi.listTargets({ ...cond, onlyInStock: inStock || undefined });
        setRowData(data.map(toEditableRow));
    };

    useEffect(() => {
        lotAttrChngApi.listTargets({ onlyInStock: true }).then(d => setRowData(d.map(toEditableRow)));
        codeApi.list(LOT_ATTR_RSN_GRP).then(setRsnCodes);
    }, []);

    // 이 화면의 셀은 제 값이 아니라 다른 값을 보고 칠해진다 — 날짜 셀은 정정 전 값(_mfgDt0·_expiryDt0)을,
    // 사유 셀은 isChanged를, 기타 사유 셀은 rsnCd를 본다. 그런데 그리드는 제 값이 바뀐 셀만 다시 그리니
    // 「값은 그대로인데 칠할 모습만 달라진」 경우를 놓친다 — 저장 후 재조회하면 서버가 돌려준 값도 새
    // _mfgDt0도 방금 정정한 값이라, 셀 값이 안 바뀌어 앰버 강조가 남는 것이 그 예다.
    // 그래서 행이 갈릴 때마다 강제로 다시 그린다.
    useEffect(() => {
        gridRef.current?.api?.refreshCells({ force: true });
    }, [rowData]);

    const rsnNmByCd = useMemo(
        () => Object.fromEntries(rsnCodes.map(c => [c.codeCd, c.codeNm])),
        [rsnCodes],
    );

    const changedCnt = useMemo(() => rowData.filter(isChanged).length, [rowData]);

    const columnDefs = useMemo(() => [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 150 },
        { field: 'lotNo', headerName: 'Lot번호', width: 140 },
        {
            field: 'receiptDt', headerName: '입고일자', width: 110, cellClass: 'text-slate-500',
            headerTooltip: '정정 대상이 아니다 — 배치 재사용 키이자 Lot번호의 근거라 바꾸면 번호와 어긋난다',
        },
        {
            field: 'shelfLifeDays', headerName: '유통기한일수', width: 105,
            headerTooltip: '제조일자를 바꾸면 이 일수를 더한 값을 유통기한으로 제안한다 (그대로 덮어쓸 수 있다)',
            cellClass: 'ag-right-aligned-cell text-slate-500',
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'mfgDt', headerName: '제조일자', width: 115, editable: true,
            // dateString 명시 필수 — 빈 값이 섞여 있어 타입 추론이 안 되면 날짜 파서가 없어 에디터가 죽는다
            cellDataType: 'dateString',
            cellEditor: 'agDateStringCellEditor',
            // 달력 상한 = 입고일자 (제조일자는 입고보다 미래일 수 없다 — 저장 검증과 같은 규칙)
            cellEditorParams: (p) => ({ max: p.data.receiptDt || undefined }),
            cellClass: (p) => `bg-indigo-50 ${p.data.mfgDt !== p.data._mfgDt0 ? 'text-amber-600 font-bold' : 'font-medium'}`,
        },
        {
            field: 'expiryDt', headerName: '유통기한', width: 115, editable: true,
            cellDataType: 'dateString',
            cellEditor: 'agDateStringCellEditor',
            cellEditorParams: (p) => ({ min: p.data.mfgDt || undefined }),
            cellClass: (p) => `bg-indigo-50 font-bold ${p.data.expiryDt !== p.data._expiryDt0 ? 'text-amber-600' : 'text-indigo-700'}`,
        },
        {
            field: 'rsnCd', headerName: '정정사유', width: 130, editable: true,
            headerTooltip: '날짜를 바꾼 행만 필수. 정정 1건마다 사유가 따로 남는다',
            cellEditor: SelectCellEditor,
            cellEditorParams: { values: rsnCodes.map(c => c.codeCd), labelMap: rsnNmByCd, placeholder: '사유 선택' },
            cellClass: 'bg-indigo-50',
            cellRenderer: (p) => {
                if (!p.value) {
                    return isChanged(p.data)
                        ? <span className="text-rose-500 font-bold">사유 필요</span>
                        : <span className="text-slate-300">—</span>;
                }
                return <span>{rsnNmByCd[p.value] ?? p.value}</span>;
            },
        },
        {
            field: 'rsnDscr', headerName: '기타 사유', width: 170,
            editable: (p) => p.data.rsnCd === ETC_RSN_CD,
            headerTooltip: '사유가 「기타」일 때만 입력한다 (그 외 코드에서는 서버가 무시)',
            cellClass: (p) => (p.data.rsnCd === ETC_RSN_CD ? 'bg-indigo-50' : ''),
            cellRenderer: (p) => p.data.rsnCd === ETC_RSN_CD
                ? (p.value || <span className="text-rose-500 font-bold">내용 필요</span>)
                : <span className="text-slate-300">—</span>,
        },
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
    ], [rsnCodes, rsnNmByCd]);

    /**
     * 제조일자를 바꾸면 유통기한 기본값(제조일자 + 유통기한일수)을 제안한다.
     * 강제가 아니다 — 벤더 인쇄 유통기한과 계산값이 다른 것이 이 화면의 주 사용처라
     * 사용자가 그대로 덮어쓸 수 있다 (서버도 expiry >= mfg만 본다).
     */
    const onCellValueChanged = (e) => {
        if (e.colDef.field === 'mfgDt' && e.newValue && e.data.shelfLifeDays != null) {
            e.node.setDataValue('expiryDt', addDays(e.newValue, e.data.shelfLifeDays));
        }
        // setDataValue가 e.data를 먼저 고쳐 두므로, 아래 한 줄이 두 날짜를 함께 반영한다.
        // setDataValue는 expiryDt로 이 핸들러를 한 번 더 부르지만 그 중첩 호출에 반영을 맡기면 안 된다 —
        // 제안값이 기존 유통기한과 같으면 그리드가 이벤트를 내지 않아 제조일자 변경까지 함께 누락된다.
        // 이 setRowData가 rowData를 갈아 위 useEffect를 태우고, 거기서 셀을 「강제로 다시 그린다」.
        // 사유 셀은 제 값(rsnCd)이 아니라 isChanged를 보고 「사유 필요」를 띄우므로, 그렇게 태우지 않으면
        // 날짜를 고쳐도 다시 그려지지 않는다.
        setRowData(prev => prev.map(r => (r.lotId === e.data.lotId ? { ...r, ...e.data } : r)));
    };

    const handleSubmit = () => {
        // 편집 중인 셀은 아직 행에 반영되지 않았다 — 열린 에디터를 닫고 나서 그리드에서 직접 걷는다
        gridRef.current?.api.stopEditing();
        const rows = [];
        gridRef.current?.api.forEachNode(n => rows.push(n.data));
        const targets = rows.filter(isChanged);
        if (targets.length === 0) {
            toast('제조일자·유통기한을 바꾼 행이 없습니다.');
            return;
        }
        // 저장이 전량 롤백이라 걸린 행을 하나씩 알리면 고칠 때마다 다음 행이 새로 걸린다 —
        // 한 번에 다 보여줘서 한 번의 수정으로 다시 시도할 수 있게 한다
        const errors = [];
        for (const r of targets) {
            const where = `${r.prodCd} / ${r.lotNo}`;
            if (!r.mfgDt || !r.expiryDt) {
                errors.push(`${where}: 제조일자와 유통기한은 모두 필수입니다.`);
            } else if (r.receiptDt && r.mfgDt > r.receiptDt) {
                errors.push(`${where}: 제조일자가 입고일자(${r.receiptDt})보다 미래일 수 없습니다.`);
            } else if (r.expiryDt < r.mfgDt) {
                errors.push(`${where}: 유통기한이 제조일자보다 이전일 수 없습니다.`);
            } else if (!r.rsnCd) {
                errors.push(`${where}: 정정사유를 선택하세요.`);
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

    /** 고친 행들을 한 번에 보낸다 — 서버가 전량 롤백하므로 부분 성공은 없다 */
    const doSave = async (targets) => {
        try {
            await lotAttrChngApi.change(targets.map(r => ({
                lotId: r.lotId,
                mfgDt: r.mfgDt,
                expiryDt: r.expiryDt,
                rsnCd: r.rsnCd,
                rsnDscr: r.rsnCd === ETC_RSN_CD ? String(r.rsnDscr).trim() : null,
            })));
            toast.success(`${targets.length}건의 Lot 속성을 정정했습니다.`);
            fetchTargets();
        } catch (e) {
            // 실패하면 재조회하지 않는다 — 전량 롤백이라 서버 값은 그대로이고,
            // 입력을 살려둬야 지적된 행만 고쳐서 다시 시도할 수 있다
            toast.error(e.message || '속성 정정에 실패했습니다.');
        }
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
                <div className="flex items-center gap-3 flex-wrap">
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
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-bold ${changedCnt > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            변경 {num(changedCnt)}건
                        </span>
                        <button
                            onClick={handleSubmit}
                            className="flex items-center gap-1 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-colors">
                            <Save size={14} /> 정정
                        </button>
                    </div>
                </div>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        ref={gridRef}
                        rowData={rowData}
                        columnDefs={columnDefs}
                        getRowId={(p) => String(p.data.lotId)}
                        rowHeight={34}
                        headerHeight={38}
                        stopEditingWhenCellsLoseFocus={true}
                        onCellValueChanged={onCellValueChanged}
                    />
                </div>
            </div>

            {/* 정정 확인 모달 */}
            {confirmTargets && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20"
                     onMouseDown={() => setConfirmTargets(null)}>
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[560px] flex flex-col gap-4"
                         onMouseDown={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-800">
                            Lot 속성 {confirmTargets.length}건을 정정하시겠습니까?
                        </h3>
                        <p className="text-sm text-slate-500">
                            수량은 변하지 않고, <b>취소 경로가 없어</b> 되돌리려면 반대 방향 정정을 다시 해야 합니다.
                        </p>
                        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                            {confirmTargets.map(r => (
                                <div key={r.lotId} className="flex flex-col gap-1 text-xs bg-slate-50 rounded-lg p-3">
                                    <div className="flex items-baseline gap-2 min-w-0">
                                        <b className="text-slate-700 truncate">{r.lotNo}</b>
                                        <span className="text-slate-400 truncate">{r.prodCd} {r.prodNm}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="w-16 text-slate-400 font-bold">제조일자</span>
                                        <span className="text-slate-500">{r._mfgDt0 || '-'}</span>
                                        <span className="text-slate-300">→</span>
                                        <b className={r.mfgDt !== r._mfgDt0 ? 'text-amber-600' : 'text-slate-500'}>{r.mfgDt}</b>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="w-16 text-slate-400 font-bold">유통기한</span>
                                        <span className="text-slate-500">{r._expiryDt0 || '-'}</span>
                                        <span className="text-slate-300">→</span>
                                        <b className={r.expiryDt !== r._expiryDt0 ? 'text-amber-600' : 'text-slate-500'}>{r.expiryDt}</b>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="w-16 text-slate-400 font-bold">사유</span>
                                        <b className="text-slate-600">{rsnNmByCd[r.rsnCd] ?? r.rsnCd}</b>
                                        {r.rsnCd === ETC_RSN_CD && <span className="text-slate-400 truncate">— {r.rsnDscr}</span>}
                                    </div>
                                    {/* 영향 범위 — Lot 단위 정정이라 로케이션이 달라도 전부에 일괄 반영된다 */}
                                    <div className="flex items-center gap-1.5 text-slate-500">
                                        <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                                        재고 <b className="text-slate-700">{num(r.invRowCnt)}행 · 보유 {num(r.onHandQty)}개</b>에 일괄 반영
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setConfirmTargets(null)} className="btn-modal-cancel">
                                취소
                            </button>
                            <button
                                onClick={() => { const t = confirmTargets; setConfirmTargets(null); doSave(t); }}
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
