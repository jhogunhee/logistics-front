import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Download, MapPin, Plus, Save, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

import SearchBar, { SearchText, SearchSelect } from '@/components/common/SearchBar';
import { locApi } from '@/api/locApi';
import { zonApi } from '@/api/zonApi';
import { LOC_TYPE_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { useCodes } from '@/hooks/useCodes';
import { Badge } from '@/components/common/Badge';
import { RowStatusCell } from '@/components/common/Badge';
import { fmtDe, num } from '@/utils/format';
import ConfirmModal from '@/components/common/ConfirmModal';


export default function LocMaster() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ locCd: '', zonCd: '', locTyp: '' });
    const [zons, setZons] = useState([]); // 존 마스터 목록 (드롭다운 · 온도대 검증 · 엑셀 코드표의 원천)
    const tempZoneCodes = useCodes('TEMP_ZONE');
    const locTypeCodes = useCodes('LOC_TYPE');
    const [rowCount, setRowCount] = useState(0); // 행추가분은 rowData 상태에 없으므로 건수는 그리드 기준으로 센다
    const [saveConfirm, setSaveConfirm] = useState(null); // 저장 확인 모달에 넘길 대상 행들 (null이면 닫힘)
    const gridRef = useRef(null); // 그리드 api 호출용 (applyTransaction 등)
    const fileInputRef = useRef(null); // 엑셀 업로드 파일 선택창

    // 삭제(D) 표시된 행은 편집을 막는다
    const notDeleted = (p) => p.data._status !== 'D';

    // 존 마스터에서 파생 — 하드코딩하지 않는다 (존이 추가되면 여기 자동 반영)
    const zonCodes = zons.map(z => z.zonCd);
    const zonOptions = [{ value: '', label: '전체' }, ...zons.map(z => ({ value: z.zonCd, label: `${z.zonCd} ${z.zonNm}` }))];
    const zonTmpMap = Object.fromEntries(zons.map(z => [z.zonCd, z.tmpZon]));


    // 온도대/유형 편집기 목록은 공통코드 상태를 직접 참조한다
    const columnDefs = [
        {
            headerName: 'No.', width: 60, editable: false,
            valueGetter: (p) => p.node.rowIndex + 1,
            cellClass: 'text-slate-400',
        },
        {
            // 코드는 업무 식별자라 수정 불가 — 신규(C) 행에서만 입력받는다
            field: 'locCd', headerName: '로케이션 코드', width: 120,
            editable: (p) => p.data._status === 'C',
        },
        {
            field: 'zonCd', headerName: '존', width: 110, editable: notDeleted,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: zonCodes },
        },
        {
            field: 'tmpZon', headerName: '온도대', width: 100, editable: notDeleted,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: tempZoneCodes.values },
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
        },
        {
            field: 'locTyp', headerName: '유형', width: 100, editable: notDeleted,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: locTypeCodes.values },
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={LOC_TYPE_META} value={p.value} show="label" />,
        },
        {
            field: 'pikngPrty', headerName: '피킹 우선순위', width: 120, editable: notDeleted,
            cellClass: 'ag-right-aligned-cell',
            headerTooltip: 'FEFO 동순위(같은 유통기한) 간 할당 순서. 낮을수록 먼저',
        },
        {
            field: 'ptawyPrty', headerName: '적치 우선순위', width: 120, editable: notDeleted,
            cellClass: 'ag-right-aligned-cell',
            headerTooltip: '적치 전략의 후보 정렬 기준(적치순서). 낮을수록 먼저 배정',
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
        const data = await locApi.list(cond);
        setRowData(data);
    };

    // 최초 1회 조회 (이후엔 조회 버튼으로 재조회) + 존 마스터
    useEffect(() => {
        locApi.list().then(setRowData);
        zonApi.list().then(setZons);
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
            // 기본 존은 마스터의 첫 행에서 가져온다 — 코드를 박아두면 그 존이 삭제됐을 때 저장이 실패한다
            add: [{
                locCd: '', zonCd: zons[0]?.zonCd ?? '', tmpZon: zons[0]?.tmpZon ?? 'DRY',
                locTyp: 'STORAGE', pikngPrty: 0, ptawyPrty: 0, _status: 'C',
            }],
        });
        const rowIndex = res.add[0].rowIndex;
        api.ensureIndexVisible(rowIndex, 'bottom');
        api.startEditingCell({ rowIndex, colKey: 'locCd' });
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
    // 두 번째 시트에 코드표를 넣어 입력 가능한 값을 안내한다 (업로드는 첫 시트만 읽음).
    const handleTemplateDownload = () => {
        const sheet = XLSX.utils.json_to_sheet([
            { '로케이션 코드': 'DRY-C-01-01 (예시)', '존': 'DRY', '온도대': 'DRY', '유형': 'STORAGE', '피킹 우선순위': 5, '적치 우선순위': 5 },
            { '로케이션 코드': 'CHL-B-02-01 (예시)', '존': 'CHL', '온도대': 'CHL', '유형': 'STORAGE', '피킹 우선순위': 4, '적치 우선순위': 4 },
            { '로케이션 코드': 'RCV-STAGE-2 (예시)', '존': 'RCV-STAGE', '온도대': 'DRY', '유형': 'STAGE', '피킹 우선순위': 0, '적치 우선순위': 0 },
        ]);
        sheet['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }]; // 열 너비

        const codeSheet = XLSX.utils.json_to_sheet([
            ...zons.map(z => ({ '구분': '존', '코드': z.zonCd, '이름': z.zonNm })),
            ...Object.entries(TEMP_ZONE_META).map(([cd, meta]) => ({ '구분': '온도대', '코드': cd, '이름': meta.label })),
            ...Object.entries(LOC_TYPE_META).map(([cd, meta]) => ({ '구분': '유형', '코드': cd, '이름': meta.label })),
        ]);
        codeSheet['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 10 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, '로케이션');
        XLSX.utils.book_append_sheet(workbook, codeSheet, '코드표');
        XLSX.writeFile(workbook, 'loc_upload_template.xlsx');
    };

    // ── 엑셀 업로드 ─────────────────────────────────────────
    // 첫 시트의 [로케이션 코드 | 존 | 온도대 | 유형 | 피킹 우선순위] 컬럼을 읽어 신규(C) 행으로 추가한다.
    // 온도대/유형은 코드(DRY/STORAGE)와 이름(상온/보관) 모두 허용.
    const handleExcelUpload = async (e) => {
        const file = e.target.files[0];
        e.target.value = ''; // 같은 파일을 다시 선택해도 change 이벤트가 오도록 초기화
        if (!file) return;

        const workbook = XLSX.read(await file.arrayBuffer());
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });

        const tempNameToCode = Object.fromEntries(
            Object.entries(TEMP_ZONE_META).map(([cd, meta]) => [meta.label, cd])
        );
        const typeNameToCode = Object.fromEntries(
            Object.entries(LOC_TYPE_META).map(([cd, meta]) => [meta.label, cd])
        );
        const rows = [];
        const badLines = [];
        raw.forEach((r, i) => {
            const locCd = String(r['로케이션 코드'] ?? '').trim();
            const zonCd = String(r['존'] ?? '').trim().toUpperCase();
            const tempRaw = String(r['온도대'] ?? '').trim();
            const typeRaw = String(r['유형'] ?? '').trim();
            const tmpZon = tempZoneCodes.values.includes(tempRaw.toUpperCase())
                ? tempRaw.toUpperCase()
                : tempNameToCode[tempRaw];
            const locTyp = locTypeCodes.values.includes(typeRaw.toUpperCase())
                ? typeRaw.toUpperCase()
                : typeNameToCode[typeRaw];
            if (!locCd || !zonCodes.includes(zonCd) || !tmpZon || !locTyp) {
                badLines.push(i + 2); // 엑셀 행 번호 (헤더 1행 + 1-base)
                return;
            }
            const prty = r['피킹 우선순위'];
            const ptawyPrty = r['적치 우선순위'];
            rows.push({
                locCd, zonCd, tmpZon, locTyp,
                pikngPrty: (prty == null || prty === '') ? 0 : Number(prty),
                ptawyPrty: (ptawyPrty == null || ptawyPrty === '') ? 0 : Number(ptawyPrty),
                _status: 'C',
            });
        });

        if (badLines.length > 0) {
            toast.error(`코드/존/온도대/유형이 잘못된 행이 있습니다 (엑셀 ${badLines.join(', ')}행)`);
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
            if (!r.locCd.trim()) {
                toast.error('로케이션 코드는 필수입니다.');
                return;
            }
            // 존의 온도구분과 비교한다 (예전엔 존코드 문자열 자체를 온도대와 비교해서
            // DRY/CHL/FRZ 세 존에만 보관 로케이션을 붙일 수 있었다)
            if (r.locTyp === 'STORAGE' && zonTmpMap[r.zonCd] !== r.tmpZon) {
                toast.error(`보관 로케이션의 온도대는 존의 온도대와 같아야 합니다: ${r.locCd}`);
                return;
            }
            if (r.pikngPrty !== '' && r.pikngPrty != null && !(Number(r.pikngPrty) >= 0)) {
                toast.error(`피킹 우선순위는 0 이상 숫자여야 합니다: ${r.locCd}`);
                return;
            }
            if (r.ptawyPrty !== '' && r.ptawyPrty != null && !(Number(r.ptawyPrty) >= 0)) {
                toast.error(`적치 우선순위는 0 이상 숫자여야 합니다: ${r.locCd}`);
                return;
            }
        }
        setSaveConfirm(dirty); // 가운데 확인 모달을 띄운다
    };

    const doSave = async (dirty) => {
        try {
            // 빈 우선순위는 0으로 정규화해서 전송
            const payload = dirty.map(r => ({
                ...r,
                pikngPrty: (r.pikngPrty == null || r.pikngPrty === '') ? 0 : Number(r.pikngPrty),
            }));
            await locApi.saveAll(payload);
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
                <MapPin size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">로케이션 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">로케이션 마스터 · 스테이징/보관존</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="locCd" label="로케이션" placeholder="DRY-A-01-01" />
                <SearchSelect name="zonCd" label="존" options={zonOptions} />
                <SearchSelect name="locTyp" label="유형" options={locTypeCodes.searchOptions} />
            </SearchBar>

            {/* 그리드 툴바 */}
            <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{num(rowCount)}건</span>
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
