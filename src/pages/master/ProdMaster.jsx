import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Barcode, Download, Plus, Save, Shapes, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

import { prodApi } from '@/api/prodApi';
import { useCodes } from '@/hooks/useCodes';
import { useMasterGrid } from '@/hooks/useMasterGrid';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { fmtDe, num } from '@/utils/format';
import SearchBar, { SearchText, SearchSelect } from '@/components/common/SearchBar';
import SelectCellEditor from '@/components/common/SelectCellEditor';
import { Badge, RowStatusCell } from '@/components/common/Badge';
import { ProdThumb } from '@/components/common/ProdThumb';
import ProdIconPickerModal from '@/components/master/ProdIconPickerModal';
import { THUMB_CELL_STYLE } from '@/constants/agGrid';
import ConfirmModal from '@/components/common/ConfirmModal';
import SaveCountSummary from '@/components/common/SaveCountSummary';

export default function ProdMaster() {
    const tempZoneCodes = useCodes('TEMP_ZONE');
    const uomCodes = useCodes('UOM'); // 입고/출고단위 콤보박스 — 콤보에 "BOX 박스"로 보여준다
    const {
        gridRef, rowCount, saveConfirm, setSaveConfirm,
        gridProps, addRow, deleteSelectedRows, requestSave,
    } = useMasterGrid();
    const [cond, setCond] = useState({ prodCd: '', prodNm: '', tmpZon: '' });
    const [rowData, setRowData] = useState([]);
    const fileInputRef = useRef(null); // 엑셀 업로드 파일 선택창

    // 삭제(D) 표시된 행은 편집을 막는다
    const notDeleted = (p) => p.data._status !== 'D';
    // 단위 두 컬럼 전용 — 아직 저장 전인 신규 행에서만 연다 (아래 컬럼 정의 주석 참고)
    const isNew = (p) => p.data._status === 'C';

    // 온도대 편집기 목록은 공통코드 상태를 직접 참조한다
    const columnDefs = [
        {
            headerName: 'No.', width: 60, editable: false,
            valueGetter: (p) => p.node.rowIndex + 1,
            cellClass: 'text-slate-400',
        },
        {
            // 헤더 이름을 비운다 — 썸네일은 그 자체로 무엇인지 말한다. 다른 화면의 이미지 컬럼도 같다
            field: 'imgUrl', headerName: '', width: 50,
            headerTooltip: '상품 이미지. 위의 「아이콘 선택」 버튼으로 지정합니다',
            sortable: false, editable: false,
            cellStyle: THUMB_CELL_STYLE,
            cellRenderer: (p) => <ProdThumb src={p.value} alt={p.data.prodNm} tmpZon={p.data.tmpZon} size={34} />,
        },
        {
            // 서버 채번이라 입력은 안 받지만 반드시 값이 생기는 컬럼 — 필수 표시를 유지한다
            field: 'prodCd', headerName: '상품 코드', width: 140,
            headerClass: 'header-required', editable: false,
            cellRenderer: (p) => p.value || <span className="text-slate-400">(저장 시 채번)</span>,
        },
        { field: 'prodNm', headerName: '상품명', minWidth: 200, headerClass: 'header-required', editable: notDeleted },
        {
            field: 'tmpZon', headerName: '온도대', width: 100,
            headerClass: 'header-required', editable: notDeleted,
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
            // 신규 행(C)에서만 연다. 등록 후에는 못 고치고 변경은 단위 관리 화면의 라디오가 맡는다.
            // 이중 관리 방지
            field: 'inbUomCd', headerName: '입고단위', width: 100,
            headerClass: 'header-required', editable: isNew,
            cellEditor: SelectCellEditor,
            cellEditorParams: { values: uomCodes.values, labelMap: uomCodes.nmByCd },
            cellClass: (p) => (isNew(p) ? undefined : 'text-slate-500'),
            headerTooltip: '벤더에게 발주하고 납품받는 단위. 신규 등록 시에만 지정할 수 있고, 등록 후 변경은 단위 관리 화면에서 합니다',
        },
        {
            field: 'outbUomCd', headerName: '출고단위', width: 100,
            headerClass: 'header-required', editable: isNew,
            cellEditor: SelectCellEditor,
            cellEditorParams: { values: uomCodes.values, labelMap: uomCodes.nmByCd },
            cellClass: (p) => (isNew(p) ? undefined : 'text-slate-500'),
            headerTooltip: '출고주문에 쓰는 단위. 신규 등록 시에만 지정할 수 있고, 등록 후 변경은 단위 관리 화면에서 합니다',
        },
        {
            field: 'shelfLifeDays', headerName: '유통기한(일)', width: 120, editable: notDeleted,
            cellClass: 'ag-right-aligned-cell',
            cellRenderer: (p) => (p.value == null || p.value === '')
                ? <span className="text-slate-400">미관리</span>
                : num(p.value),
        },
        {
            field: '_status', headerName: '상태', width: 70,
            cellRenderer: (p) => <RowStatusCell value={p.value} />,
        },
        { field: 'createdBy', headerName: '등록자', width: 110, editable: false },
        {
            field: 'createdAt', headerName: '등록일자', width: 110, editable: false,
            valueFormatter: (p) => fmtDe(p.value),
        },
        { field: 'updatedBy', headerName: '수정자', width: 110, editable: false },
        {
            field: 'updatedAt', headerName: '수정일자', width: 110, editable: false,
            valueFormatter: (p) => fmtDe(p.value),
        },
    ];

    const fetchList = async () => {
        const data = await prodApi.list(cond);
        setRowData(data);
    };

    // 최초 1회 조회 (이후엔 조회 버튼으로 재조회)
    useEffect(() => {
        prodApi.list().then(setRowData);
    }, []);

    // ── 행 추가 ──────────────────────────────────────────────
    // 단위 기본값은 EA — 낱개로 받아 낱개로 내보내는 상품이 대부분이다.
    const handleAddRow = () => addRow(
        // imgUrl은 비워둔다 — 파일명이 상품코드인데 신규 행은 저장 전까지 코드가 없다(서버 채번).
        // 저장 뒤 코드를 보고 넣는 순서가 된다
        { prodCd: '', prodNm: '', tmpZon: 'DRY', inbUomCd: 'EA', outbUomCd: 'EA', shelfLifeDays: null, imgUrl: null },
        'prodNm'
    );

    // ── 상품 이미지 ─────────────────────────────────────────
    // 화면에서 하는 조작은 아이콘을 고르는 것 하나뿐이다. 버튼 둘을 뺐고 이유가 서로 다르다 —
    //
    // 「이미지 연결」(상품별 그림 파일): 할 수 없는 일이라서. 파일을 미리 소스 폴더에 넣어 둔
    //   상품에만 통해서, 방금 만든 상품에서 누르면 「파일이 없습니다」로 끝났다. 화면이 할 수
    //   없는 일을 버튼으로 세워 두면 그 자체가 미완성으로 읽힌다. 그림 파일도 함께 지웠다.
    // 「이미지 제거」: 할 이유가 없어서. 잘못 골랐으면 다른 아이콘을 고르면 되고, 마땅한 게
    //   없으면 목록의 📦 기타를 고른다. 「이미지 없음」은 사람이 일부러 만들 상태가 아니다.
    //
    // NULL(이미지 없음)은 그대로 유효하다 — 신규 상품이 아이콘을 고르기 전까지의 상태이고
    // 그때 ProdThumb이 폴백을 그린다. 사람이 그 상태를 만들 수 없어졌을 뿐이다.
    // 시더 상품에 붙어 있던 그림 주소도 DB에 남아 있으면 계속 보인다(세 형태를 다 그린다).
    //
    // setDataValue가 useMasterGrid의 onCellValueChanged를 태워 행을 U로 표시하므로
    // 「저장」을 눌러야 DB에 반영된다.

    /** 선택된 행 하나를 돌려준다. 없거나 여럿이면 안내하고 null */
    const selectedRowNode = () => {
        const nodes = gridRef.current?.api.getSelectedNodes() ?? [];
        if (nodes.length !== 1) {
            toast('상품을 하나만 선택하세요.');
            return null;
        }
        if (nodes[0].data._status === 'D') {
            toast('삭제 표시된 행은 편집할 수 없습니다.');
            return null;
        }
        return nodes[0];
    };

    /*
     * 아이콘 선택 — 그림 파일과 달리 상품코드가 필요 없어(파일명이 아니라 이름을 저장한다)
     * 저장 전 신규 행에서도 고를 수 있다. 모달이 고른 값을 셀에 넣고 닫는다(반영은 「저장」 몫).
     */
    const [iconTarget, setIconTarget] = useState(null); // 아이콘을 고르는 중인 행 노드

    const handleIconPick = (value) => {
        iconTarget?.setDataValue('imgUrl', value);
        setIconTarget(null);
        toast.success('아이콘을 골랐습니다. 저장 버튼을 눌러야 반영됩니다.');
    };

    // ── 엑셀 양식 다운로드 ───────────────────────────────────
    // 업로드가 읽는 헤더 그대로 예시 행을 담아 내려준다 (예시 행은 업로드 후 그리드에서 지우면 됨).
    // 두 번째 시트에 온도대 코드표를 넣어 입력 가능한 값을 안내한다 (업로드는 첫 시트만 읽음).
    const handleTemplateDownload = () => {
        const sheet = XLSX.utils.json_to_sheet([
            { '상품명': '신라면 멀티팩 (예시)', '온도대': 'DRY', '입고단위': 'BOX', '출고단위': 'EA', '유통기한(일)': 180 },
            { '상품명': '서울우유 1L (예시)', '온도대': 'CHL', '입고단위': 'EA', '출고단위': 'EA', '유통기한(일)': 14 },
            { '상품명': '왕교자 만두 1kg (예시)', '온도대': 'FRZ', '입고단위': 'EA', '출고단위': 'EA', '유통기한(일)': 365 },
            { '상품명': '일회용 종이컵 1000입 (예시 - 유통기한 미관리는 빈 칸)', '온도대': 'DRY', '입고단위': 'BOX', '출고단위': 'EA', '유통기한(일)': null },
        ]);
        sheet['!cols'] = [{ wch: 45 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }]; // 열 너비

        // 온도대 코드표 시트 (TEMP_ZONE_META 기준이라 코드가 늘어나면 같이 반영됨)
        const codeSheet = XLSX.utils.json_to_sheet(
            Object.entries(TEMP_ZONE_META).map(([cd, meta]) => ({
                '온도대 코드': cd, '이름': meta.label, '비고': '코드/이름 둘 다 입력 가능',
            }))
        );
        codeSheet['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 24 }];

        // 단위 코드표 시트. 공통코드 UOM 그룹을 그대로 내려주므로 단위를 추가하면 양식에도 따라온다.
        // 낱개수량(BOX 1개 = 몇 낱개)은 상품마다 달라서 여기 담을 수 없다 — 단위 관리 화면에서 넣는다.
        const uomSheet = XLSX.utils.json_to_sheet(
            uomCodes.values.map(cd => ({ '단위 코드': cd, '비고': '빈 칸이면 EA(낱개)로 등록됩니다' }))
        );
        uomSheet['!cols'] = [{ wch: 12 }, { wch: 34 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, '상품');
        XLSX.utils.book_append_sheet(workbook, codeSheet, '온도대 코드');
        XLSX.utils.book_append_sheet(workbook, uomSheet, '단위 코드');
        XLSX.writeFile(workbook, 'prod_upload_template.xlsx');
    };

    // ── 엑셀 업로드 ─────────────────────────────────────────
    // 첫 시트의 [상품명 | 온도대 | 입고단위 | 출고단위 | 유통기한(일)] 컬럼을 읽어 신규(C) 행으로 추가한다.
    // 온도대는 코드(DRY)와 이름(상온) 모두 허용, 유통기한 빈 칸은 미관리(null),
    // 단위 빈 칸은 EA(낱개) — 옛 양식(단위 열이 없는 파일)도 그대로 올라간다.
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
        const badUomLines = [];
        raw.forEach((r, i) => {
            const prodNm = String(r['상품명'] ?? '').trim();
            const tempRaw = String(r['온도대'] ?? '').trim();
            const tmpZon = tempZoneCodes.values.includes(tempRaw.toUpperCase())
                ? tempRaw.toUpperCase()
                : nameToCode[tempRaw];
            const inbUomCd = String(r['입고단위'] ?? '').trim().toUpperCase() || 'EA';
            const outbUomCd = String(r['출고단위'] ?? '').trim().toUpperCase() || 'EA';
            if (!prodNm || !tmpZon) {
                badLines.push(i + 2); // 엑셀 행 번호 (헤더 1행 + 1-base)
                return;
            }
            // 없는 단위 코드는 저장 시점이 아니라 여기서 잡는다 — 서버는 문자열을 그대로 받는다
            if (!uomCodes.values.includes(inbUomCd) || !uomCodes.values.includes(outbUomCd)) {
                badUomLines.push(i + 2);
                return;
            }
            const shelf = r['유통기한(일)'];
            rows.push({
                prodCd: '', prodNm, tmpZon, inbUomCd, outbUomCd,
                shelfLifeDays: (shelf == null || shelf === '') ? null : Number(shelf),
                _status: 'C',
            });
        });

        if (badLines.length > 0) {
            toast.error(`상품명/온도대가 잘못된 행이 있습니다 (엑셀 ${badLines.join(', ')}행)`);
            return;
        }
        if (badUomLines.length > 0) {
            toast.error(`단위 코드가 잘못된 행이 있습니다 (엑셀 ${badUomLines.join(', ')}행) — 양식의 「단위 코드」 시트를 참고하세요`);
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
    // 검증 (상품 코드는 서버 채번, 삭제 행은 id만 쓰므로 검증 대상 아님)
    const validateRows = (rows) => {
        for (const r of rows) {
            if (!String(r.prodNm ?? '').trim()) {
                toast.error('상품명은 필수입니다.');
                return false;
            }
            if (!String(r.inbUomCd ?? '').trim()) {
                toast.error(`입고단위는 필수입니다: ${r.prodNm}`);
                return false;
            }
            if (!String(r.outbUomCd ?? '').trim()) {
                toast.error(`출고단위는 필수입니다: ${r.prodNm}`);
                return false;
            }
            // 빈 값 = 유통기한 미관리(공산품 등). 값이 있으면 1 이상이어야 한다.
            const hasShelfLife = r.shelfLifeDays != null && String(r.shelfLifeDays).trim() !== '';
            if (hasShelfLife && !(Number(r.shelfLifeDays) > 0)) {
                toast.error(`유통기한(일)은 비워두거나(미관리) 1 이상이어야 합니다: ${r.prodNm}`);
                return false;
            }
        }
        return true;
    };

    /**
     * 낱개(EA)가 아닌 단위로 새로 등록된 상품을 안내한다.
     * 서버는 그 단위의 포장을 낱개수량 1로 만들 뿐이라(ProdService.ensureUoms) BOX를 골라도
     * 아직 "BOX 1개 = 1낱개"다. 실제 입수량은 단위 관리 화면에서 넣어야 환산이 맞는다.
     * 행추가와 엑셀 업로드가 둘 다 이 저장을 타므로 안내도 여기 한 곳에 둔다.
     */
    const warnDefaultEaQty = (dirty) => {
        const targets = dirty.filter(r =>
            r._status === 'C' && (r.inbUomCd !== 'EA' || r.outbUomCd !== 'EA'));
        if (targets.length === 0) return;
        const head = targets[0].prodNm;
        const label = targets.length === 1 ? head : `${head} 등 ${targets.length}건`;
        toast(`${label}의 입수량이 1로 등록됐습니다. 단위 관리 화면에서 실제 입수량을 넣어주세요.`,
            { duration: 8000, icon: '📦' });
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
            warnDefaultEaQty(dirty);
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
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="prodCd" label="상품 코드" placeholder="PROD-0001" />
                <SearchText name="prodNm" label="상품명" placeholder="상품명 검색" />
                <SearchSelect name="tmpZon" label="온도대" options={tempZoneCodes.searchOptions} />
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
                        onClick={() => setIconTarget(selectedRowNode())}
                        className="btn-ghost"
                        title="선택한 상품에 아이콘을 지정합니다. 저장 전 신규 행에서도 고를 수 있습니다">
                        <Shapes size={13} /> 아이콘 선택
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

            {/* 아이콘 선택 모달 — 선택된 행이 없으면 selectedRowNode가 안내하고 null을 준다 */}
            {iconTarget && (
                <ProdIconPickerModal
                    value={iconTarget.data.imgUrl}
                    prodNm={iconTarget.data.prodNm}
                    onPick={handleIconPick}
                    onClose={() => setIconTarget(null)}
                />
            )}

            {/* 그리드 — 고정 높이 대신 남은 화면 공간을 채운다 */}
            <div className="w-full flex-1 min-h-0">
                <AgGridReact
                    ref={gridRef}
                    rowData={rowData}
                    columnDefs={columnDefs}
                    // 이 화면만 행 높이를 지정하지 않아 ag-grid 기본값(≈42)을 쓰고 있었다.
                    // 썸네일이 같은 크기여도 행이 높으면 작아 보인다 — 현재고 조회와 같은 값으로 맞춘다
                    rowHeight={40}
                    headerHeight={38}
                    {...gridProps}
                />
            </div>
        </div>
    );
}
