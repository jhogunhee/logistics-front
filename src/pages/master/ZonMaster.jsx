import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Download, LayoutGrid, Plus, Save, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import { zonApi, STRG_TYP_META, BIZ_DVSN_META } from '@/api/zonApi';
import { TEMP_ZONE_META } from '@/api/prodApi';
import { codeApi, toSearchOptions } from '@/api/codeApi';
import { RowStatusCell } from '@/components/common/Badge';
import { fmtDe } from '@/utils/format';
import ConfirmModal from '@/components/common/ConfirmModal';


const Badge = ({ meta, value, withCode }) => {
    const m = meta[value];
    if (!m) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${m.badge}`}>
            {m.label}{withCode ? ` ${value}` : ''}
        </span>
    );
};

export default function ZonMaster() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ zonCd: '', tmpZon: '', bizDvsn: '' });
    const [tmpZonOptions, setTmpZonOptions] = useState([{ value: '', label: '전체' }]);
    const [bizDvsnOptions, setBizDvsnOptions] = useState([{ value: '', label: '전체' }]);
    const [tmpZonCodes, setTmpZonCodes] = useState([]); // 공통코드(TEMP_ZONE)의 코드값 목록
    const [strgTypCodes, setStrgTypCodes] = useState([]); // 공통코드(STRG_TYP)의 코드값 목록
    const [bizDvsnCodes, setBizDvsnCodes] = useState([]); // 공통코드(BIZ_DVSN)의 코드값 목록
    const [rowCount, setRowCount] = useState(0); // 행추가분은 rowData 상태에 없으므로 건수는 그리드 기준으로 센다
    const [saveConfirm, setSaveConfirm] = useState(null); // 저장 확인 모달에 넘길 대상 행들 (null이면 닫힘)
    const gridRef = useRef(null); // 그리드 api 호출용 (applyTransaction 등)
    const fileInputRef = useRef(null); // 엑셀 업로드 파일 선택창

    // 삭제(D) 표시된 행은 편집을 막는다
    const notDeleted = (p) => p.data._status !== 'D';


    // 온도구분/보관유형/업무구분 편집기 목록은 공통코드 상태를 직접 참조한다
    const columnDefs = [
        {
            headerName: 'No.', width: 60, editable: false,
            valueGetter: (p) => p.node.rowIndex + 1,
            cellClass: 'text-slate-400',
        },
        {
            // 존코드는 하위 로케이션이 문자열로 참조하는 업무 식별자라 수정 불가 — 신규(C) 행에서만 입력받는다
            field: 'zonCd', headerName: '존코드', width: 120,
            editable: (p) => p.data._status === 'C',
            headerTooltip: '하위 로케이션이 이 코드로 존을 참조하므로 등록 후에는 변경할 수 없습니다',
        },
        { field: 'zonNm', headerName: '존명', width: 160, editable: notDeleted },
        {
            field: 'tmpZon', headerName: '온도구분', width: 110, editable: notDeleted,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: tmpZonCodes },
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} withCode />,
        },
        {
            field: 'strgTyp', headerName: '보관유형', width: 100, editable: notDeleted,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: strgTypCodes },
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={STRG_TYP_META} value={p.value} />,
        },
        {
            field: 'bizDvsn', headerName: '업무구분', width: 110, editable: notDeleted,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: bizDvsnCodes },
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={BIZ_DVSN_META} value={p.value} />,
        },
        {
            field: '_status', headerName: '상태', width: 70,
            cellRenderer: (p) => <RowStatusCell value={p.value} />,
        },
        { field: 'createdBy', headerName: '등록자', width: 90, editable: false },
        {
            field: 'createdAt', headerName: '등록일자', width: 110, editable: false,
            valueFormatter: (p) => fmtDe(p.value),
        },
        { field: 'updatedBy', headerName: '수정자', width: 90, editable: false },
        {
            field: 'updatedAt', headerName: '수정일자', width: 110, editable: false,
            valueFormatter: (p) => fmtDe(p.value),
        },
    ];

    const fetchList = async () => {
        const data = await zonApi.list(cond);
        setRowData(data);
    };

    // 최초 1회 조회 (이후엔 조회 버튼으로 재조회) + 세 구분의 공통코드 조회
    useEffect(() => {
        let ignore = false;
        zonApi.list().then(data => { if (!ignore) setRowData(data); });
        codeApi.list('TEMP_ZONE').then(codes => {
            if (!ignore) {
                setTmpZonOptions(toSearchOptions(codes));
                setTmpZonCodes(codes.map(c => c.codeCd));
            }
        });
        codeApi.list('STRG_TYP').then(codes => {
            if (!ignore) setStrgTypCodes(codes.map(c => c.codeCd));
        });
        codeApi.list('BIZ_DVSN').then(codes => {
            if (!ignore) {
                setBizDvsnOptions(toSearchOptions(codes));
                setBizDvsnCodes(codes.map(c => c.codeCd));
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
            add: [{ zonCd: '', zonNm: '', tmpZon: 'DRY', strgTyp: 'RACK', bizDvsn: 'STRG', _status: 'C' }],
        });
        const rowIndex = res.add[0].rowIndex;
        api.ensureIndexVisible(rowIndex, 'bottom');
        api.startEditingCell({ rowIndex, colKey: 'zonCd' });
    };

    // ── 삭제 ────────────────────────────────────────────────
    // 신규(C) 행은 그리드에서 바로 제거, 기존 행은 D로 표시해 저장 시 서버에 반영한다 (재조회하면 원복).
    // 하위 로케이션이 있는 존인지는 서버가 판단한다 (프론트는 로케이션 목록을 들고 있지 않다).
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
    // 두 번째 시트에 코드표를 넣어 입력 가능한 값을 안내한다 (업로드는 첫 시트만 읽음).
    const handleTemplateDownload = () => {
        const sheet = XLSX.utils.json_to_sheet([
            { '존코드': 'DRY-B (예시)', '존명': '상온 B동', '온도구분': 'DRY', '보관유형': 'RACK', '업무구분': 'STRG' },
            { '존코드': 'PICK-1 (예시)', '존명': '피킹존 1', '온도구분': 'CHL', '보관유형': 'FLAT', '업무구분': 'PIKNG' },
            { '존코드': 'RTN (예시)', '존명': '반품존', '온도구분': 'DRY', '보관유형': '가상', '업무구분': '반품' },
        ]);
        sheet['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 12 }]; // 열 너비

        const codeSheet = XLSX.utils.json_to_sheet([
            ...tmpZonCodes.map(cd => ({ '구분': '온도구분', '코드': cd, '이름': TEMP_ZONE_META[cd]?.label ?? '' })),
            ...strgTypCodes.map(cd => ({ '구분': '보관유형', '코드': cd, '이름': STRG_TYP_META[cd]?.label ?? '' })),
            ...bizDvsnCodes.map(cd => ({ '구분': '업무구분', '코드': cd, '이름': BIZ_DVSN_META[cd]?.label ?? '' })),
        ]);
        codeSheet['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 12 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, '존');
        XLSX.utils.book_append_sheet(workbook, codeSheet, '코드표');
        XLSX.writeFile(workbook, 'zon_upload_template.xlsx');
    };

    // ── 엑셀 업로드 ─────────────────────────────────────────
    // 첫 시트의 [존코드 | 존명 | 온도구분 | 보관유형 | 업무구분] 컬럼을 읽어 신규(C) 행으로 추가한다.
    // 세 구분 모두 코드(DRY/RACK/STRG)와 이름(상온/랙/보관) 양쪽을 허용한다.
    const handleExcelUpload = async (e) => {
        const file = e.target.files[0];
        e.target.value = ''; // 같은 파일을 다시 선택해도 change 이벤트가 오도록 초기화
        if (!file) return;

        const workbook = XLSX.read(await file.arrayBuffer());
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });

        // 코드값 또는 표시명 → 코드값. 코드표에 없으면 undefined
        const resolve = (input, codes, meta) => {
            const v = String(input ?? '').trim();
            if (!v) return undefined;
            if (codes.includes(v.toUpperCase())) return v.toUpperCase();
            return codes.find(cd => meta[cd]?.label === v);
        };

        const rows = [];
        const badLines = [];
        raw.forEach((r, i) => {
            const zonCd = String(r['존코드'] ?? '').trim();
            const zonNm = String(r['존명'] ?? '').trim();
            const tmpZon = resolve(r['온도구분'], tmpZonCodes, TEMP_ZONE_META);
            const strgTyp = resolve(r['보관유형'], strgTypCodes, STRG_TYP_META);
            const bizDvsn = resolve(r['업무구분'], bizDvsnCodes, BIZ_DVSN_META);
            if (!zonCd || !zonNm || !tmpZon || !strgTyp || !bizDvsn) {
                badLines.push(i + 2); // 엑셀 행 번호 (헤더 1행 + 1-base)
                return;
            }
            rows.push({ zonCd, zonNm, tmpZon, strgTyp, bizDvsn, _status: 'C' });
        });

        if (badLines.length > 0) {
            toast.error(`존코드/존명/온도구분/보관유형/업무구분이 잘못된 행이 있습니다 (엑셀 ${badLines.join(', ')}행)`);
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
        for (const r of dirty.filter(r => r._status !== 'D')) {
            if (!String(r.zonCd ?? '').trim()) {
                toast.error('존코드는 필수입니다.');
                return;
            }
            if (!String(r.zonNm ?? '').trim()) {
                toast.error(`존명은 필수입니다: ${r.zonCd}`);
                return;
            }
            if (!r.tmpZon || !r.strgTyp || !r.bizDvsn) {
                toast.error(`온도구분·보관유형·업무구분은 필수입니다: ${r.zonCd}`);
                return;
            }
        }
        setSaveConfirm(dirty); // 가운데 확인 모달을 띄운다
    };

    const doSave = async (dirty) => {
        try {
            await zonApi.saveAll(dirty);
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
                <LayoutGrid size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">존 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">존 마스터 · 로케이션의 상위 그룹</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" onSearch={fetchList}>
                <SearchItem label="존코드">
                    <input
                        type="text"
                        value={cond.zonCd}
                        onChange={(e) => setCond(prev => ({ ...prev, zonCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="DRY"
                        className="w-full input-base"
                    />
                </SearchItem>
                <SearchItem label="온도구분">
                    <DropdownSelect
                        value={cond.tmpZon}
                        onChange={(v) => setCond(prev => ({ ...prev, tmpZon: v }))}
                        options={tmpZonOptions}
                        placeholder="전체"
                    />
                </SearchItem>
                <SearchItem label="업무구분">
                    <DropdownSelect
                        value={cond.bizDvsn}
                        onChange={(v) => setCond(prev => ({ ...prev, bizDvsn: v }))}
                        options={bizDvsnOptions}
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
                        className="btn-ghost">
                        <Download size={13} /> 엑셀 양식
                    </button>
                    <button
                        onClick={() => fileInputRef.current.click()}
                        className="btn-ghost">
                        <Upload size={13} /> 엑셀 업로드
                    </button>
                    <button
                        onClick={handleDeleteRows}
                        className="btn-danger">
                        <Trash2 size={13} /> 삭제
                    </button>
                    <button
                        onClick={handleAddRow}
                        className="btn-ghost">
                        <Plus size={13} /> 행추가
                    </button>
                    <button
                        onClick={handleSave}
                        className="btn-primary">
                        <Save size={13} /> 저장
                    </button>
                </div>
            </div>

            {/* 저장 확인 모달 */}
            {saveConfirm && (
                <ConfirmModal
                    title="저장하시겠습니까?"
                    confirmText="저장"
                    onCancel={() => setSaveConfirm(null)}
                    onConfirm={() => { doSave(saveConfirm); setSaveConfirm(null); }}
                >
                    <p className="text-sm text-slate-500">
                        신규 <b className="text-blue-500">{saveConfirm.filter(r => r._status === 'C').length}</b>건 ·
                        수정 <b className="text-amber-500">{saveConfirm.filter(r => r._status === 'U').length}</b>건 ·
                        삭제 <b className="text-red-500">{saveConfirm.filter(r => r._status === 'D').length}</b>건
                    </p>
                    <p className="text-xs text-slate-400">
                        하위 로케이션이 있는 존은 삭제되지 않습니다.
                    </p>
                </ConfirmModal>
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