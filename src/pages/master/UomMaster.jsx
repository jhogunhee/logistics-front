import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Download, Plus, Ruler, Save, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import SelectCellEditor from '@/components/common/SelectCellEditor';
import { prodUomApi } from '@/api/prodUomApi';
import { prodApi } from '@/api/prodApi';
import { codeApi, toSearchOptions } from '@/api/codeApi';

// ISO 일시("2026-07-16T14:03:21...") → "2026-07-16"
const formatDate = (v) => (v ? v.replace('T', ' ').slice(0, 11) : '');

// 단위 코드 목록의 주인은 공통코드 UOM 그룹이다 (온도대·보관유형과 같은 API를 쓴다)
const GRP_CD = 'UOM';

/**
 * 입고단위·출고단위 지정 라디오.
 *
 * 체크박스가 아니라 라디오인 이유는 상품이 입고단위·출고단위를 각각 <b>한 칸씩</b> 갖기 때문이다
 * (`prod.inb_uom_cd` · `outb_uom_cd`, 둘 다 NOT NULL). 그래서 상품 안에서 하나만 켜지고,
 * 끄는 조작은 없다 — 다른 포장으로 옮기는 것만 된다.
 *
 * 입고와 출고는 서로 독립이라 같은 행이 둘 다 켜질 수 있다. 낱개로 받아 낱개로 내보내는
 * 상품(대부분)이 EA 행에 둘 다 붙은 모습이 정상이다.
 */
const RoleRadio = ({ node, field, onPick }) => {
    const on = !!node.data[field];
    const disabled = node.data._status === 'D';
    return (
        <input
            type="radio"
            checked={on}
            disabled={disabled}
            onChange={() => onPick(node, field)}
            className="w-4 h-4 accent-indigo-600 disabled:opacity-40"
        />
    );
};

export default function UomMaster() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ prodCd: '', prodNm: '', uomCd: '' });
    const [uomCodes, setUomCodes] = useState([]);        // 공통코드 UOM — 그리드 콤보 편집기용
    const [uomOptions, setUomOptions] = useState([{ value: '', label: '전체' }]); // 검색 콤보용
    const [prods, setProds] = useState([]);              // 상품 목록 — 신규 행의 상품 선택용
    const [rowCount, setRowCount] = useState(0); // 행추가분은 rowData 상태에 없으므로 건수는 그리드 기준으로 센다
    const [saveConfirm, setSaveConfirm] = useState(null); // 저장 확인 모달에 넘길 대상 행들 (null이면 닫힘)
    const gridRef = useRef(null); // 그리드 api 호출용 (applyTransaction 등)
    const fileInputRef = useRef(null); // 엑셀 업로드 파일 선택창

    // 삭제(D) 표시된 행은 편집을 막는다
    const notDeleted = (p) => p.data._status !== 'D';
    // 상품과 단위는 (상품, 단위) 유일키를 이루므로 등록 후 변경 불가 — 신규(C) 행에서만 고른다
    const isNew = (p) => p.data._status === 'C';

    const STATUS_META = {
        C: { label: '신규', cls: 'text-blue-500' },
        U: { label: '수정', cls: 'text-amber-500' },
        D: { label: '삭제', cls: 'text-red-500' },
    };

    const prodByCd = useMemo(
        () => Object.fromEntries(prods.map(p => [p.prodCd, p])),
        [prods]
    );
    const uomNmByCd = useMemo(
        () => Object.fromEntries(uomCodes.map(c => [c.codeCd, c.codeNm])),
        [uomCodes]
    );

    /**
     * 입고/출고단위 지정. 같은 상품의 다른 행을 끄고 이 행만 켠다.
     *
     * 라디오 컬럼은 field가 없어(파생 표시라 컬럼에 매어두지 않았다) setDataValue를 못 쓴다 —
     * data를 직접 고치고 refreshCells로 다시 그린다. 행 상태(U)는 _status 컬럼이 있어 그대로 쓴다.
     *
     * 신규(C) 행은 아직 prodId가 없어 상품코드로 id를 찾아 묶는다 — 저장 시 payload가 쓰는 기준과 같다.
     */
    const assignRole = (node, field) => {
        const api = gridRef.current.api;
        const keyOf = (d) => d.prodId ?? prodByCd[d.prodCd]?.prodId ?? null;
        const key = keyOf(node.data);
        if (key == null) {
            toast('상품을 먼저 고르세요.');
            return;
        }

        const changed = [];
        api.forEachNode(n => {
            if (n.data._status === 'D' || keyOf(n.data) !== key) return;
            const next = n === node;
            if (!!n.data[field] === next) return; // 안 바뀌는 행은 U로 표시하지 않는다
            n.data[field] = next;
            if (n.data._status !== 'C') {
                n.setDataValue('_status', 'U');
            }
            changed.push(n);
        });
        if (changed.length > 0) {
            api.refreshCells({ rowNodes: changed, force: true });
        }
    };

    const columnDefs = [
        {
            headerName: 'No.', width: 60, editable: false,
            valueGetter: (p) => p.node.rowIndex + 1,
            cellClass: 'text-slate-400',
        },
        {
            field: 'prodCd', headerName: '상품코드', width: 120,
            editable: isNew,
            cellEditor: SelectCellEditor,
            cellEditorParams: {
                values: prods.map(p => p.prodCd),
                labelMap: Object.fromEntries(prods.map(p => [p.prodCd, p.prodNm])),
                placeholder: '상품 선택',
            },
            headerTooltip: '(상품, 단위) 조합이 한 행입니다. 등록 후에는 상품을 바꿀 수 없습니다',
            cellRenderer: (p) => p.value || <span className="text-slate-400">(선택)</span>,
        },
        {
            // 상품명은 상품코드에서 파생 — 신규 행도 코드를 고르면 바로 채워진다
            headerName: '상품명', minWidth: 200, editable: false,
            valueGetter: (p) => p.data.prodNm ?? prodByCd[p.data.prodCd]?.prodNm ?? '',
        },
        {
            field: 'uomCd', headerName: '단위', width: 110,
            editable: isNew,
            cellEditor: SelectCellEditor,
            cellEditorParams: {
                values: uomCodes.map(c => c.codeCd),
                labelMap: uomNmByCd,
                placeholder: '단위 선택',
            },
            headerTooltip: '공통코드 UOM 그룹에서 가져옵니다. 등록 후에는 바꿀 수 없습니다',
            valueFormatter: (p) => (p.value ? `${p.value} ${uomNmByCd[p.value] ?? ''}`.trim() : ''),
        },
        {
            field: 'eaQty', headerName: '낱개수량', width: 110, editable: notDeleted,
            type: 'numericColumn',
            cellEditor: 'agNumberCellEditor',
            headerTooltip: '이 단위 1개가 낱개 몇 개인가 (예: BOX 1개 = 24). 낱개 그 자체면 1',
        },
        {
            field: 'wgt', headerName: '중량(kg)', width: 110, editable: notDeleted,
            type: 'numericColumn',
            cellEditor: 'agNumberCellEditor',
            headerTooltip: '포장재 무게를 포함한 실측 중량. 재지 않았으면 비워둡니다',
            cellRenderer: (p) => (p.value == null || p.value === '')
                ? <span className="text-slate-400">미측정</span>
                : p.value,
        },
        {
            headerName: '입고단위', width: 90, editable: false,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            headerTooltip: '벤더에게 발주하고 납품받는 단위. 상품마다 하나만 고를 수 있습니다',
            cellRenderer: (p) => <RoleRadio node={p.node} field="inbUom" onPick={assignRole} />,
        },
        {
            headerName: '출고단위', width: 90, editable: false,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            headerTooltip: '재고 저장 단위이기도 합니다. 상품마다 하나만 고를 수 있습니다',
            cellRenderer: (p) => <RoleRadio node={p.node} field="outbUom" onPick={assignRole} />,
        },
        {
            field: '_status', headerName: '상태', width: 70,
            cellRenderer: (p) => {
                const meta = STATUS_META[p.value];
                return meta
                    ? <span className={`text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>
                    : null;
            },
        },
        { field: 'createdBy', headerName: '등록자', width: 90, editable: false },
        {
            field: 'createdAt', headerName: '등록일자', width: 110, editable: false,
            valueFormatter: (p) => formatDate(p.value),
        },
        { field: 'updatedBy', headerName: '수정자', width: 90, editable: false },
        {
            field: 'updatedAt', headerName: '수정일자', width: 110, editable: false,
            valueFormatter: (p) => formatDate(p.value),
        },
    ];

    const fetchList = async () => {
        const data = await prodUomApi.list(cond);
        setRowData(data);
    };

    // 최초 1회 조회 (이후엔 조회 버튼으로 재조회) + 콤보 목록 2종
    useEffect(() => {
        let ignore = false;
        prodUomApi.list().then(data => { if (!ignore) setRowData(data); });
        codeApi.list(GRP_CD).then(codes => {
            if (ignore) return;
            setUomCodes(codes);
            setUomOptions(toSearchOptions(codes));
        });
        prodApi.list().then(data => { if (!ignore) setProds(data); });
        return () => { ignore = true; };
    }, []);

    // 셀 수정 시 행 상태를 U(수정)로 표시 (신규 C는 유지)
    const onCellValueChanged = (params) => {
        if (params.column.getColId() === '_status') return; // 상태 컬럼 자체의 변경(삭제 표시 등)은 무시
        if (params.data._status !== 'C') {
            params.node.setDataValue('_status', 'U');
        }
    };

    // ── 행 추가 ──────────────────────────────────────────────
    // applyTransaction은 동기라 추가된 행 노드를 바로 돌려주므로 곧장 편집을 시작할 수 있다
    const handleAddRow = () => {
        const api = gridRef.current.api;
        const res = api.applyTransaction({
            add: [{ prodCd: '', uomCd: '', eaQty: 1, wgt: null, _status: 'C' }],
        });
        const rowIndex = res.add[0].rowIndex;
        api.ensureIndexVisible(rowIndex, 'bottom');
        api.startEditingCell({ rowIndex, colKey: 'prodCd' });
    };

    // ── 엑셀 양식 다운로드 ───────────────────────────────────
    // 업로드가 읽는 헤더 그대로 예시 행을 담아 내려준다 (예시 행은 업로드 후 그리드에서 지우면 됨).
    // 두 번째 시트에 코드표를 넣어 입력 가능한 값을 안내한다 (업로드는 첫 시트만 읽음).
    //
    // 입고단위·출고단위는 양식에 두지 않는다 — 상품마다 하나씩이라 엑셀에서 여러 행에 표시하면
    // 어느 행이 이기는지 정할 수 없다. 포장을 올린 뒤 그리드 라디오로 지정한다.
    const handleTemplateDownload = () => {
        const sheet = XLSX.utils.json_to_sheet([
            { '상품코드': 'PROD-0001 (예시)', '단위': 'BOX', '낱개수량': 24, '중량(kg)': 9.12 },
            { '상품코드': 'PROD-0001 (예시)', '단위': 'PLT', '낱개수량': 576, '중량(kg)': 240 },
            { '상품코드': 'PROD-0002 (예시 - 중량 미측정은 빈 칸)', '단위': 'PACK', '낱개수량': 5, '중량(kg)': null },
        ]);
        sheet['!cols'] = [{ wch: 38 }, { wch: 10 }, { wch: 10 }, { wch: 12 }]; // 열 너비

        const codeSheet = XLSX.utils.json_to_sheet([
            ...prods.map(p => ({ '구분': '상품', '코드': p.prodCd, '이름': p.prodNm })),
            ...uomCodes.map(c => ({ '구분': '단위', '코드': c.codeCd, '이름': c.codeNm })),
        ]);
        codeSheet['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 30 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, '단위');
        XLSX.utils.book_append_sheet(workbook, codeSheet, '코드표');
        XLSX.writeFile(workbook, 'prod_uom_upload_template.xlsx');
    };

    // ── 엑셀 업로드 ─────────────────────────────────────────
    // 첫 시트의 [상품코드 | 단위 | 낱개수량 | 중량(kg)] 컬럼을 읽어 신규(C) 행으로 추가한다.
    // 상품코드·단위는 실재하는 코드여야 한다 — (상품, 단위)가 유일키라 오타를 신규 행으로 담으면
    // 저장 시점에야 서버가 튕겨서 어느 줄이 문제인지 되짚기 어렵다.
    const handleExcelUpload = async (e) => {
        const file = e.target.files[0];
        e.target.value = ''; // 같은 파일을 다시 선택해도 change 이벤트가 오도록 초기화
        if (!file) return;

        const workbook = XLSX.read(await file.arrayBuffer());
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });

        const codeSet = new Set(uomCodes.map(c => c.codeCd));
        const rows = [];
        const badLines = [];
        raw.forEach((r, i) => {
            const prodCd = String(r['상품코드'] ?? '').trim().toUpperCase();
            const uomCd = String(r['단위'] ?? '').trim().toUpperCase();
            const eaQty = r['낱개수량'];
            if (!prodByCd[prodCd] || !codeSet.has(uomCd) || !(Number(eaQty) >= 1)) {
                badLines.push(i + 2); // 엑셀 행 번호 (헤더 1행 + 1-base)
                return;
            }
            const wgt = r['중량(kg)'];
            rows.push({
                prodCd,
                prodId: prodByCd[prodCd].prodId,
                uomCd,
                eaQty: Number(eaQty),
                wgt: (wgt == null || String(wgt).trim() === '') ? null : Number(wgt),
                _status: 'C',
            });
        });

        if (badLines.length > 0) {
            toast.error(`상품코드/단위/낱개수량이 잘못된 행이 있습니다 (엑셀 ${badLines.join(', ')}행)`);
            return;
        }
        if (rows.length === 0) {
            toast('추가할 데이터가 없습니다.');
            return;
        }
        gridRef.current.api.applyTransaction({ add: rows });
        toast.success(`${rows.length}건을 신규 행으로 추가했습니다. 저장 버튼으로 반영하세요.`);
    };

    // ── 삭제 ────────────────────────────────────────────────
    // 신규(C) 행은 그리드에서 바로 제거, 기존 행은 D로 표시해 저장 시 서버에 반영한다 (재조회하면 원복).
    // 입고/출고단위로 쓰이는 포장인지는 서버가 최종 판단한다.
    const handleDeleteRows = () => {
        const api = gridRef.current.api;
        const selected = api.getSelectedNodes();
        if (selected.length === 0) {
            toast('삭제할 행을 선택하세요.');
            return;
        }
        const newRows = selected.filter(n => n.data._status === 'C').map(n => n.data);
        if (newRows.length > 0) {
            api.applyTransaction({ remove: newRows });
        }
        const marked = selected.filter(n => n.data._status !== 'C');
        marked.forEach(n => n.setDataValue('_status', 'D'));
        api.deselectAll();

        const parts = [];
        if (newRows.length > 0) parts.push(`신규 ${newRows.length}건은 바로 제거했습니다`);
        if (marked.length > 0) parts.push(`기존 ${marked.length}건은 저장 시 삭제됩니다`);
        toast(parts.join(', '));
    };

    // ── 저장 ────────────────────────────────────────────────
    const handleSave = () => {
        // 행추가분은 rowData 상태에 없으므로 그리드에서 전체 행을 수집한다
        const rows = [];
        gridRef.current.api.forEachNode(node => rows.push(node.data));
        const dirty = rows.filter(r => r._status);
        if (dirty.length === 0) {
            toast('변경된 내용이 없습니다.');
            return;
        }
        // 검증 (삭제 행은 id만 쓰므로 검증 대상 아님)
        const editable = dirty.filter(r => r._status !== 'D');
        for (const r of editable) {
            if (!String(r.prodCd ?? '').trim()) {
                toast.error('상품은 필수입니다.');
                return;
            }
            if (!String(r.uomCd ?? '').trim()) {
                toast.error(`단위는 필수입니다: ${r.prodCd}`);
                return;
            }
            if (!(Number(r.eaQty) >= 1)) {
                toast.error(`낱개수량은 1 이상이어야 합니다: ${r.prodCd} / ${r.uomCd}`);
                return;
            }
            const hasWgt = r.wgt != null && String(r.wgt).trim() !== '';
            if (hasWgt && !(Number(r.wgt) > 0)) {
                toast.error(`중량은 비워두거나(미측정) 0보다 커야 합니다: ${r.prodCd} / ${r.uomCd}`);
                return;
            }
        }
        // 신규 행끼리의 (상품, 단위) 중복은 서버가 건건이 INSERT하며 잡기 전에 여기서 먼저 막는다
        const keys = editable.filter(r => r._status === 'C').map(r => `${r.prodCd}/${r.uomCd}`);
        const dup = keys.find((k, i) => keys.indexOf(k) !== i);
        if (dup) {
            toast.error(`같은 상품에 같은 단위가 중복됩니다: ${dup}`);
            return;
        }
        setSaveConfirm(dirty); // 가운데 확인 모달을 띄운다
    };

    const doSave = async (dirty) => {
        try {
            // 서버는 상품을 id로 받는다 — 그리드가 고른 상품코드를 여기서 id로 바꾼다
            const payload = dirty.map(r => ({
                _status: r._status,
                prodUomId: r.prodUomId,
                prodId: r.prodId ?? prodByCd[r.prodCd]?.prodId,
                uomCd: r.uomCd,
                eaQty: r.eaQty == null || r.eaQty === '' ? null : Number(r.eaQty),
                wgt: r.wgt == null || String(r.wgt).trim() === '' ? null : Number(r.wgt),
                // 서버는 true인 행만 본다 — 상품이 단위를 한 칸씩만 갖기 때문에
                // 새 포장을 지정하면 이전 포장은 저절로 풀린다
                inbUom: !!r.inbUom,
                outbUom: !!r.outbUom,
            }));
            await prodUomApi.saveAll(payload);
            toast.success(`${dirty.length}건 저장했습니다.`);
            fetchList();
        } catch (e) {
            toast.error(e.message || '저장에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Ruler size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">단위 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">상품별 포장 · 낱개수량 · 중량</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" onSearch={fetchList}>
                <SearchItem label="상품코드">
                    <input
                        type="text"
                        value={cond.prodCd}
                        onChange={(e) => setCond(prev => ({ ...prev, prodCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="PROD-0001"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="상품명">
                    <input
                        type="text"
                        value={cond.prodNm}
                        onChange={(e) => setCond(prev => ({ ...prev, prodNm: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="상품명 검색"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="단위">
                    <DropdownSelect
                        value={cond.uomCd}
                        onChange={(v) => setCond(prev => ({ ...prev, uomCd: v }))}
                        options={uomOptions}
                        placeholder="전체"
                    />
                </SearchItem>
            </SearchBar>

            {/* 그리드 툴바 */}
            <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{rowCount}건</span>
                <div className="flex gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={handleExcelUpload}
                    />
                    <button
                        onClick={handleTemplateDownload}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                        <Download size={13} /> 엑셀 양식
                    </button>
                    <button
                        onClick={() => fileInputRef.current.click()}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                        <Upload size={13} /> 엑셀 업로드
                    </button>
                    <button
                        onClick={handleDeleteRows}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-red-300 hover:text-red-600 transition-colors">
                        <Trash2 size={13} /> 삭제
                    </button>
                    <button
                        onClick={handleAddRow}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                        <Plus size={13} /> 행추가
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700 transition-colors">
                        <Save size={13} /> 저장
                    </button>
                </div>
            </div>

            {/* 저장 확인 모달 */}
            {saveConfirm && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">저장하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            신규 <b className="text-blue-500">{saveConfirm.filter(r => r._status === 'C').length}</b>건 ·
                            수정 <b className="text-amber-500">{saveConfirm.filter(r => r._status === 'U').length}</b>건 ·
                            삭제 <b className="text-red-500">{saveConfirm.filter(r => r._status === 'D').length}</b>건
                        </p>
                        <p className="text-xs text-slate-400">
                            상품의 입고단위·출고단위로 쓰이는 포장은 삭제되지 않습니다 — 상품 화면에서 단위를 먼저 옮기세요.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setSaveConfirm(null)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                취소
                            </button>
                            <button
                                onClick={() => { doSave(saveConfirm); setSaveConfirm(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                                저장
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 그리드 — 고정 높이 대신 남은 화면 공간을 채운다 */}
            <div className="w-full flex-1 min-h-0">
                <AgGridReact
                    ref={gridRef}
                    rowData={rowData}
                    columnDefs={columnDefs}
                    rowSelection={{ mode: 'multiRow' }}
                    rowClassRules={{
                        'line-through': (p) => p.data._status === 'D',
                        'opacity-40': (p) => p.data._status === 'D',
                    }}
                    stopEditingWhenCellsLoseFocus={true}
                    onCellValueChanged={onCellValueChanged}
                    onModelUpdated={(p) => setRowCount(p.api.getDisplayedRowCount())}
                />
            </div>
        </div>
    );
}
