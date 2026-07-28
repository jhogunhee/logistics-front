import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Barcode, Download, Plus, Save, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import { prodApi, TEMP_ZONE_META } from '@/api/prodApi';
import { codeApi, toSearchOptions } from '@/api/codeApi';

// ISO 일시("2026-07-16T14:03:21...") → "2026-07-16"
const formatDate = (v) => (v ? v.replace('T', ' ').slice(0, 11) : '');

const TempZoneBadge = ({ value }) => {
    const meta = TEMP_ZONE_META[value];
    if (!meta) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${meta.badge}`}>
            {meta.label} {value}
        </span>
    );
};

export default function ProdMaster() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ prodCd: '', prodNm: '', tmpZon: '' });
    const [tempZoneOptions, setTempZoneOptions] = useState([{ value: '', label: '전체' }]);
    const [tempZoneCodes, setTempZoneCodes] = useState([]); // 공통코드(TEMP_ZONE)의 코드값 목록
    const [rowCount, setRowCount] = useState(0); // 행추가분은 rowData 상태에 없으므로 건수는 그리드 기준으로 센다
    const [saveConfirm, setSaveConfirm] = useState(null); // 저장 확인 모달에 넘길 대상 행들 (null이면 닫힘)
    const gridRef = useRef(null); // 그리드 api 호출용 (applyTransaction 등)
    const fileInputRef = useRef(null); // 엑셀 업로드 파일 선택창

    // 삭제(D) 표시된 행은 편집을 막는다
    const notDeleted = (p) => p.data._status !== 'D';

    const STATUS_META = {
        C: { label: '신규', cls: 'text-blue-500' },
        U: { label: '수정', cls: 'text-amber-500' },
        D: { label: '삭제', cls: 'text-red-500' },
    };

    // 온도대 편집기 목록은 공통코드 상태를 직접 참조한다
    const columnDefs = [
        {
            headerName: 'No.', width: 60, editable: false,
            valueGetter: (p) => p.node.rowIndex + 1,
            cellClass: 'text-slate-400',
        },
        {
            field: 'prodCd', headerName: '상품 코드', width: 100, editable: false,
            cellRenderer: (p) => p.value || <span className="text-slate-400">(저장 시 채번)</span>,
        },
        { field: 'prodNm', headerName: '상품명', minWidth: 200, editable: notDeleted },
        {
            field: 'tmpZon', headerName: '온도대', width: 100, editable: notDeleted,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: tempZoneCodes },
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <TempZoneBadge value={p.value} />,
        },
        {
            field: 'shelfLifeDays', headerName: '유통기한(일)', width: 120, editable: notDeleted,
            cellClass: 'ag-right-aligned-cell',
            cellRenderer: (p) => (p.value == null || p.value === '')
                ? <span className="text-slate-400">미관리</span>
                : p.value,
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
        { field: 'createdBy', headerName: '등록자', width: 110, editable: false },
        {
            field: 'createdAt', headerName: '등록일자', width: 110, editable: false,
            valueFormatter: (p) => formatDate(p.value),
        },
        { field: 'updatedBy', headerName: '수정자', width: 110, editable: false },
        {
            field: 'updatedAt', headerName: '수정일자', width: 110, editable: false,
            valueFormatter: (p) => formatDate(p.value),
        },
    ];

    const fetchList = async () => {
        const data = await prodApi.list(cond);
        setRowData(data);
    };

    // 최초 1회 조회 (이후엔 조회 버튼으로 재조회) + 온도대 공통코드 조회
    useEffect(() => {
        let ignore = false;
        prodApi.list().then(data => { if (!ignore) setRowData(data); });
        codeApi.list('TEMP_ZONE').then(codes => {
            if (!ignore) {
                setTempZoneOptions(toSearchOptions(codes));
                setTempZoneCodes(codes.map(c => c.codeCd));
            }
        });
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
            add: [{ prodCd: '', prodNm: '', tmpZon: 'DRY', shelfLifeDays: null, _status: 'C' }],
        });
        const rowIndex = res.add[0].rowIndex;
        api.ensureIndexVisible(rowIndex, 'bottom');
        api.startEditingCell({ rowIndex, colKey: 'prodNm' });
    };

    // ── 삭제 ────────────────────────────────────────────────
    // 신규(C) 행은 그리드에서 바로 제거, 기존 행은 D로 표시해 저장 시 서버에 반영한다 (재조회하면 원복)
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

    // ── 엑셀 양식 다운로드 ───────────────────────────────────
    // 업로드가 읽는 헤더 그대로 예시 행을 담아 내려준다 (예시 행은 업로드 후 그리드에서 지우면 됨).
    // 두 번째 시트에 온도대 코드표를 넣어 입력 가능한 값을 안내한다 (업로드는 첫 시트만 읽음).
    const handleTemplateDownload = () => {
        const sheet = XLSX.utils.json_to_sheet([
            { '상품명': '신라면 멀티팩 (예시)', '온도대': 'DRY', '유통기한(일)': 180 },
            { '상품명': '서울우유 1L (예시)', '온도대': 'CHL', '유통기한(일)': 14 },
            { '상품명': '왕교자 만두 1kg (예시)', '온도대': 'FRZ', '유통기한(일)': 365 },
            { '상품명': '일회용 종이컵 1000입 (예시 - 유통기한 미관리는 빈 칸)', '온도대': 'DRY', '유통기한(일)': null },
        ]);
        sheet['!cols'] = [{ wch: 45 }, { wch: 10 }, { wch: 12 }]; // 열 너비

        // 온도대 코드표 시트 (TEMP_ZONE_META 기준이라 코드가 늘어나면 같이 반영됨)
        const codeSheet = XLSX.utils.json_to_sheet(
            Object.entries(TEMP_ZONE_META).map(([cd, meta]) => ({
                '온도대 코드': cd, '이름': meta.label, '비고': '코드/이름 둘 다 입력 가능',
            }))
        );
        codeSheet['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 24 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, '상품');
        XLSX.utils.book_append_sheet(workbook, codeSheet, '온도대 코드');
        XLSX.writeFile(workbook, 'prod_upload_template.xlsx');
    };

    // ── 엑셀 업로드 ─────────────────────────────────────────
    // 첫 시트의 [상품명 | 온도대 | 유통기한(일)] 컬럼을 읽어 신규(C) 행으로 추가한다.
    // 온도대는 코드(DRY)와 이름(상온) 모두 허용, 유통기한 빈 칸은 미관리(null).
    const handleExcelUpload = async (e) => {
        const file = e.target.files[0];
        e.target.value = ''; // 같은 파일을 다시 선택해도 change 이벤트가 오도록 초기화
        if (!file) return;

        const workbook = XLSX.read(await file.arrayBuffer());
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });

        const nameToCode = Object.fromEntries(
            Object.entries(TEMP_ZONE_META).map(([cd, meta]) => [meta.label, cd])
        );
        const rows = [];
        const badLines = [];
        raw.forEach((r, i) => {
            const prodNm = String(r['상품명'] ?? '').trim();
            const tempRaw = String(r['온도대'] ?? '').trim();
            const tmpZon = tempZoneCodes.includes(tempRaw.toUpperCase())
                ? tempRaw.toUpperCase()
                : nameToCode[tempRaw];
            if (!prodNm || !tmpZon) {
                badLines.push(i + 2); // 엑셀 행 번호 (헤더 1행 + 1-base)
                return;
            }
            const shelf = r['유통기한(일)'];
            rows.push({
                prodCd: '', prodNm, tmpZon,
                shelfLifeDays: (shelf == null || shelf === '') ? null : Number(shelf),
                _status: 'C',
            });
        });

        if (badLines.length > 0) {
            toast.error(`상품명/온도대가 잘못된 행이 있습니다 (엑셀 ${badLines.join(', ')}행)`);
            return;
        }
        if (rows.length === 0) {
            toast('추가할 데이터가 없습니다.');
            return;
        }
        gridRef.current.api.applyTransaction({ add: rows });
        toast.success(`${rows.length}건을 신규 행으로 추가했습니다. 저장 버튼으로 반영하세요.`);
    };

    // ── 저장 ────────────────────────────────────────────────
    const handleSave = async () => {
        // 행추가분은 rowData 상태에 없으므로 그리드에서 전체 행을 수집한다
        const rows = [];
        gridRef.current.api.forEachNode(node => rows.push(node.data));
        const dirty = rows.filter(r => r._status);
        if (dirty.length === 0) {
            toast('변경된 내용이 없습니다.');
            return;
        }
        // 검증 (상품 코드는 서버 채번, 삭제 행은 id만 쓰므로 검증 대상 아님)
        for (const r of dirty.filter(r => r._status !== 'D')) {
            if (!r.prodNm.trim()) {
                toast.error('상품명은 필수입니다.');
                return;
            }
            // 빈 값 = 유통기한 미관리(공산품 등). 값이 있으면 1 이상이어야 한다.
            const hasShelfLife = r.shelfLifeDays != null && String(r.shelfLifeDays).trim() !== '';
            if (hasShelfLife && !(Number(r.shelfLifeDays) > 0)) {
                toast.error(`유통기한(일)은 비워두거나(미관리) 1 이상이어야 합니다: ${r.prodNm}`);
                return;
            }
        }
        setSaveConfirm(dirty); // 가운데 확인 모달을 띄운다
    };

    const doSave = async (dirty) => {
        try {
            // 빈 문자열은 null(미관리)로 정규화해서 전송
            const payload = dirty.map(r => ({
                ...r,
                shelfLifeDays: (r.shelfLifeDays == null || String(r.shelfLifeDays).trim() === '')
                    ? null : Number(r.shelfLifeDays),
            }));
            await prodApi.saveAll(payload);
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
                <Barcode size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">상품 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">상품 마스터 · 온도대/유통기한 정책</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" onSearch={fetchList}>
                <SearchItem label="상품 코드">
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
                <SearchItem label="온도대">
                    <DropdownSelect
                        value={cond.tmpZon}
                        onChange={(v) => setCond(prev => ({ ...prev, tmpZon: v }))}
                        options={tempZoneOptions}
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
