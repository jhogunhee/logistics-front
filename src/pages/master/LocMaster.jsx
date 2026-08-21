import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Download, MapPin, Plus, Save, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

import { locApi } from '@/api/locApi';
import { zonApi } from '@/api/zonApi';
import { useCodes } from '@/hooks/useCodes';
import { useMasterGrid } from '@/hooks/useMasterGrid';
import { LOC_TYPE_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { fmtDe, num } from '@/utils/format';
import SearchBar, { SearchSelect, SearchLoc } from '@/components/common/SearchBar';
import SelectCellEditor from '@/components/common/SelectCellEditor';
import { Badge } from '@/components/common/Badge';
import { RowStatusCell } from '@/components/common/Badge';
import ConfirmModal from '@/components/common/ConfirmModal';
import SaveCountSummary from '@/components/common/SaveCountSummary';

export default function LocMaster() {
    const tempZoneCodes = useCodes('TEMP_ZONE');
    const locTypeCodes = useCodes('LOC_TYPE');
    const bizDvsnCodes = useCodes('BIZ_DVSN');
    const {
        gridRef, rowCount, saveConfirm, setSaveConfirm,
        gridProps, addRow, deleteSelectedRows, requestSave,
    } = useMasterGrid();
    const [cond, setCond] = useState({ locCd: '', zonCd: '', locTyp: '', bizDvsn: '' });
    const [rowData, setRowData] = useState([]);
    const [zons, setZons] = useState([]); // 존 마스터 목록 (드롭다운 · 온도대 검증 · 엑셀 코드표의 원천)
    const fileInputRef = useRef(null); // 엑셀 업로드 파일 선택창

    // 삭제(D) 표시된 행은 편집을 막는다
    const notDeleted = (p) => p.data._status !== 'D';
    const isNew = (p) => p.data._status === 'C';

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
            // 폭은 가장 긴 코드 「PIK-DRY-01-01」(실측 123px)이 잘리지 않는 값
            field: 'locCd', headerName: '로케이션 코드', width: 135,
            editable: isNew,
        },
        {
            // 가장 긴 표기 「SHIP-STAGE 출고 스테이징」(실측 189px)이 잘리지 않는 폭
            field: 'zonCd', headerName: '존', width: 195, editable: notDeleted,
            cellEditor: SelectCellEditor,
            cellEditorParams: {
                values: zonCodes,
                labelMap: Object.fromEntries(zons.map(z => [z.zonCd, z.zonNm])),
            },
            // 편집기와 같은 「코드 존명」 표기 — 값은 코드 그대로라 저장·검증 경로는 안 바뀐다
            valueFormatter: (p) => {
                const nm = zons.find(z => z.zonCd === p.value)?.zonNm;
                return nm ? `${p.value} ${nm}` : (p.value ?? '');
            },
        },
        {
            field: 'tmpZon', headerName: '온도대', width: 100, editable: notDeleted,
            cellEditor: SelectCellEditor,
            cellEditorParams: {
                values: tempZoneCodes.values,
                labelMap: Object.fromEntries(
                    Object.entries(TEMP_ZONE_META).map(([cd, meta]) => [cd, meta.label])
                ),
            },
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
        },
        {
            field: 'locTyp', headerName: '유형', width: 100, editable: notDeleted,
            cellEditor: SelectCellEditor,
            cellEditorParams: {
                values: locTypeCodes.values,
                labelMap: Object.fromEntries(
                    Object.entries(LOC_TYPE_META).map(([cd, meta]) => [cd, meta.label])
                ),
            },
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={LOC_TYPE_META} value={p.value} show="label" />,
        },
        {
            // 이 로케이션에 고정된 상품 (고정 로케이션 마스터). 빈 칸 = 고정 없음 — 여부를 겸한다.
            // 유형 옆에 두는 이유 — 코드·존·온도대·유형과 함께 「이 자리가 무엇인가」를 말하는 컬럼이라서다
            field: 'fxngProdNm', headerName: '고정 상품', width: 150, editable: false,
            cellClass: 'text-slate-500',
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
            field: 'maxQty', headerName: '최대 적재 수량', width: 120, editable: notDeleted,
            cellClass: 'ag-right-aligned-cell',
            headerTooltip: '보관(STORAGE) 필수 · 스테이징은 빈 값(무제한). 적재가능수량 = 최대 적재 수량 − 현재고 − 미완료 지시 유입 잔량',
            valueFormatter: (p) => (p.value == null || p.value === '') ? '' : num(p.value),
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

    // ── 행 추가 ──────────────────────────────────────────────
    // 기본 존은 마스터의 첫 행에서 가져온다 — 코드를 박아두면 그 존이 삭제됐을 때 저장이 실패한다
    const handleAddRow = () => addRow(
        {
            locCd: '', zonCd: zons[0]?.zonCd ?? '', tmpZon: zons[0]?.tmpZon ?? 'DRY',
            locTyp: 'STORAGE', pikngPrty: 0, ptawyPrty: 0, maxQty: null,
        },
        'locCd'
    );

    // ── 엑셀 양식 다운로드 ───────────────────────────────────
    // 업로드가 읽는 헤더 그대로 예시 행을 담아 내려준다 (예시 행은 업로드 후 그리드에서 지우면 됨).
    // 두 번째 시트에 코드표를 넣어 입력 가능한 값을 안내한다 (업로드는 첫 시트만 읽음).
    const handleTemplateDownload = () => {
        const sheet = XLSX.utils.json_to_sheet([
            { '로케이션 코드': 'DRY-C-01-01 (예시)', '존': 'DRY', '온도대': 'DRY', '유형': 'STORAGE', '피킹 우선순위': 5, '적치 우선순위': 5, '최대 적재 수량': 100 },
            { '로케이션 코드': 'CHL-B-02-01 (예시)', '존': 'CHL', '온도대': 'CHL', '유형': 'STORAGE', '피킹 우선순위': 4, '적치 우선순위': 4, '최대 적재 수량': 100 },
            { '로케이션 코드': 'RCV-STAGE-2 (예시)', '존': 'RCV-STAGE', '온도대': 'DRY', '유형': 'STAGE', '피킹 우선순위': 0, '적치 우선순위': 0, '최대 적재 수량': null },
        ]);
        sheet['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }]; // 열 너비

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
    // 첫 시트의 [로케이션 코드 | 존 | 온도대 | 유형 | 피킹 우선순위 | 적치 우선순위 | 최대 적재 수량] 컬럼을 읽어 신규(C) 행으로 추가한다.
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
            const maxQty = r['최대 적재 수량'];
            rows.push({
                locCd, zonCd, tmpZon, locTyp,
                pikngPrty: (prty == null || prty === '') ? 0 : Number(prty),
                ptawyPrty: (ptawyPrty == null || ptawyPrty === '') ? 0 : Number(ptawyPrty),
                maxQty: (maxQty == null || maxQty === '') ? null : Number(maxQty),
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
    // 검증 (삭제 행은 id만 쓰므로 검증 대상 아님)
    const validateRows = (rows) => {
        for (const r of rows) {
            if (!String(r.locCd ?? '').trim()) {
                toast.error('로케이션 코드는 필수입니다.');
                return false;
            }
            // 존의 온도구분과 비교한다
            if (r.locTyp === 'STORAGE' && zonTmpMap[r.zonCd] !== r.tmpZon) {
                toast.error(`보관 로케이션의 온도대는 존의 온도대와 같아야 합니다: ${r.locCd}`);
                return false;
            }
            if (r.pikngPrty !== '' && r.pikngPrty != null && !(Number(r.pikngPrty) >= 0)) {
                toast.error(`피킹 우선순위는 0 이상 숫자여야 합니다: ${r.locCd}`);
                return false;
            }
            if (r.ptawyPrty !== '' && r.ptawyPrty != null && !(Number(r.ptawyPrty) >= 0)) {
                toast.error(`적치 우선순위는 0 이상 숫자여야 합니다: ${r.locCd}`);
                return false;
            }
            // 서버 검증(ck_loc_storage_capacity · ck_loc_max_qty)과 같은 규칙 — 저장 전에 걸러준다
            if (r.locTyp === 'STORAGE' && (r.maxQty == null || r.maxQty === '')) {
                toast.error(`보관 로케이션은 최대 적재 수량이 필수입니다: ${r.locCd}`);
                return false;
            }
            if (r.maxQty != null && r.maxQty !== '' && !(Number(r.maxQty) >= 1)) {
                toast.error(`최대 적재 수량은 1 이상 숫자여야 합니다: ${r.locCd}`);
                return false;
            }
        }
        // 신규 행끼리의 코드 중복은 서버가 건건이 확인하기 전에 여기서 먼저 막는다
        const newCds = rows.filter(r => r._status === 'C').map(r => r.locCd);
        const dup = newCds.find((cd, i) => newCds.indexOf(cd) !== i);
        if (dup) {
            toast.error(`로케이션 코드가 중복됩니다: ${dup}`);
            return false;
        }
        return true;
    };

    const doSave = async (dirty) => {
        try {
            // 빈 우선순위는 0으로, 빈 최대 적재 수량은 null(무제한)로 정규화해서 전송
            const payload = dirty.map(r => ({
                ...r,
                pikngPrty: (r.pikngPrty == null || r.pikngPrty === '') ? 0 : Number(r.pikngPrty),
                ptawyPrty: (r.ptawyPrty == null || r.ptawyPrty === '') ? 0 : Number(r.ptawyPrty),
                maxQty: (r.maxQty == null || r.maxQty === '') ? null : Number(r.maxQty),
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
                <SearchLoc name="locCd" wide />
                <SearchSelect name="zonCd" label="존" options={zonOptions} wide />
                <SearchSelect name="locTyp" label="유형" options={locTypeCodes.searchOptions} />
                <SearchSelect name="bizDvsn" label="업무구분" options={bizDvsnCodes.searchOptions} />
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
                        onClick={deleteSelectedRows}
                        className="btn-danger">
                        <Trash2 size={13} /> 삭제
                    </button>
                    <button
                        onClick={handleAddRow}
                        className="btn-ghost">
                        <Plus size={13} /> 행추가
                    </button>
                    <button
                        onClick={() => requestSave(validateRows)}
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
                    <SaveCountSummary rows={saveConfirm} />
                </ConfirmModal>
            )}

            {/* 그리드 — 고정 높이 대신 남은 화면 공간을 채운다 */}
            <div className="w-full flex-1 min-h-0">
                <AgGridReact
                    ref={gridRef}
                    rowData={rowData}
                    columnDefs={columnDefs}
                    {...gridProps}
                />
            </div>
        </div>
    );
}
