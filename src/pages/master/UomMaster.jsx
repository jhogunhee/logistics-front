import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Download, Plus, Ruler, Save, Trash2, Undo2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

import SearchBar, { SearchText } from '@/components/common/SearchBar';
import SelectCellEditor from '@/components/common/SelectCellEditor';
import { prodUomApi } from '@/api/prodUomApi';
import { prodApi } from '@/api/prodApi';
import { useCodes } from '@/hooks/useCodes';
import { useMasterGrid } from '@/hooks/useMasterGrid';
import { RowStatusCell } from '@/components/common/Badge';
import ConfirmModal from '@/components/common/ConfirmModal';
import SaveCountSummary from '@/components/common/SaveCountSummary';
import { num } from '@/utils/format';

// 단위 코드 목록의 주인은 공통코드 UOM 그룹이다 (온도대·보관유형과 같은 API를 쓴다)
const GRP_CD = 'UOM';


/** 서버가 준 포장 행들 → 편집판. `_key`는 getRowId용 — 신규 행에는 아직 prodUomId가 없다 */
const snapshot = (rows) => (rows ?? []).map(u => ({ ...u, _key: `id-${u.prodUomId}` }));

/** prodId별 포장단위 묶음. 좌측 건수·우측 패널·업로드 중복검사가 같은 묶음을 쓴다 */
const groupByProd = (uoms) => {
    const byProd = {};
    uoms.forEach(u => { (byProd[u.prodId] ??= []).push(u); });
    return byProd;
};

/**
 * 입고단위·출고단위 지정 라디오.
 */
const RoleRadio = ({ node, field, onPick }) => (
    <input
        type="radio"
        checked={!!node.data[field]}
        disabled={node.data._status === 'D'}
        onChange={() => onPick(node, field)}
        className="w-4 h-4 accent-indigo-600 disabled:opacity-40"
    />
);

export default function UomMaster() {
    const [prods, setProds] = useState([]);
    const [uomsByProd, setUomsByProd] = useState({});
    const [cond, setCond] = useState({ prodCd: '', prodNm: '' });
    const uomCodes = useCodes(GRP_CD);                     // 공통코드 UOM — 단위 콤보 편집기용
    const [selectedProdId, setSelectedProdId] = useState(null);
    const [uploadConfirm, setUploadConfirm] = useState(null); // 엑셀 업로드 확인 모달
    const prodGridRef = useRef(null);
    const fileInputRef = useRef(null);
    const newRowSeq = useRef(0);       // 신규 행의 임시 키 (getRowId가 id를 요구한다)
    // 우측 포장 그리드는 다른 마스터 화면과 같은 C/U/D 규약을 쓴다
    const {
        gridRef: uomGridRef, rowCount, dirtyCount, saveConfirm, setSaveConfirm,
        gridProps, addRow, deleteSelectedRows, requestSave,
    } = useMasterGrid();

    const selectedProd = useMemo(
        () => prods.find(p => p.prodId === selectedProdId) ?? null,
        [prods, selectedProdId]
    );
    // 상품이 바뀌거나 재조회되면 원본에서 편집판을 새로 뜬다. 복사하는 이유는
    // ag-grid가 행 객체를 직접 고치기 때문 — 원본이 남아 있어야 되돌릴 수 있다.
    const uomRows = useMemo(
        () => snapshot(uomsByProd[selectedProdId]),
        [uomsByProd, selectedProdId]
    );
    // 삭제(D) 표시된 행은 편집을 막는다
    const notDeleted = (p) => p.data._status !== 'D';
    // 단위는 (상품, 단위) 유일키의 일부라 등록 후 변경 불가 — 신규(C) 행에서만 고른다
    const isNew = (p) => p.data._status === 'C';

    // ── 좌측: 상품 목록 ──────────────────────────────────────
    const prodColumnDefs = [
        { field: 'prodCd', headerName: '상품코드', width: 110 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 140 },
        {
            // 포장이 몇 건인지만 보여준다 — 어느 상품을 손봐야 하는지 고르는 단서다
            headerName: '포장', width: 60,
            cellClass: 'ag-right-aligned-cell text-slate-400',
            valueGetter: (p) => uomsByProd[p.data.prodId]?.length ?? 0,
            valueFormatter: (p) => num(p.value),
        },
    ];

    // ── 우측: 선택 상품의 포장 ────────────────────────────────
    const uomColumnDefs = [
        {
            field: 'uomCd', headerName: '단위', width: 130,
            editable: isNew,
            cellEditor: SelectCellEditor,
            cellEditorParams: {
                values: uomCodes.values,
                labelMap: uomCodes.nmByCd,
                placeholder: '단위 선택',
            },
            headerTooltip: '공통코드 UOM 그룹에서 가져옵니다. 등록 후에는 바꿀 수 없습니다',
            valueFormatter: (p) => (p.value ? `${p.value} ${uomCodes.nmByCd[p.value] ?? ''}`.trim() : ''),
            cellRenderer: (p) => p.value ? p.valueFormatted : <span className="text-slate-400">(선택)</span>,
        },
        {
            // 재고 저장 단위가 낱개(EA)라 이 값이 곧 환산 배수다 — 검수 입력 1개가 재고 몇 개가 되는지
            // (예전엔 출고단위 환산 「단위수량」 파생 컬럼이 따로 있었지만 EA 통일로 같은 값이 돼 제거)
            field: 'eaQty', headerName: '낱개수량', width: 100, editable: notDeleted,
            type: 'numericColumn',
            cellEditor: 'agNumberCellEditor',
            valueFormatter: (p) => num(p.value),
            headerTooltip: '이 단위 1개가 낱개 몇 개인가 (예: BOX 1개 = 24). 낱개 그 자체면 1. 검수 입력·재고 수량이 이 배수로 움직입니다',
        },
        {
            field: 'wgt', headerName: '중량(kg)', width: 100, editable: notDeleted,
            type: 'numericColumn',
            cellEditor: 'agNumberCellEditor',
            headerTooltip: '포장재 무게를 포함한 실측 중량. 재지 않았으면 비워둡니다',
            cellRenderer: (p) => (p.value == null || p.value === '')
                ? <span className="text-slate-400">미측정</span>
                : num(p.value),
        },
        {
            // field를 두는 이유 — setDataValue로 값을 바꾸면 ag-grid가 그 셀만 알아서 다시 그린다.
            // 파생 표시로 두면(field 없음) 직접 refreshCells를 불러야 한다.
            field: 'inbUom', headerName: '입고단위', width: 90, editable: false,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            headerTooltip: '벤더에게 발주하고 납품받는 단위',
            cellRenderer: (p) => <RoleRadio node={p.node} field="inbUom" onPick={assignRole} />,
        },
        {
            field: 'outbUom', headerName: '출고단위', width: 90, editable: false,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            headerTooltip: '출고주문에 쓰는 단위',
            cellRenderer: (p) => <RoleRadio node={p.node} field="outbUom" onPick={assignRole} />,
        },
        {
            field: '_status', headerName: '상태', width: 70,
            cellRenderer: (p) => <RowStatusCell value={p.value} />,
        },
    ];

    // 상품 목록(검색조건 적용)과 포장 전체를 함께 받는다 — 좌측 건수와 우측 상세가 같은 시점의 데이터가 된다
    const fetchList = async () => {
        const [prodData, uomData] = await Promise.all([prodApi.list(cond), prodUomApi.list()]);
        setProds(prodData);
        setUomsByProd(groupByProd(uomData));
        // 조회 결과에 없는 상품을 고른 상태로 두면 오른쪽이 빈 채로 남는다
        setSelectedProdId(prev => (prodData.some(p => p.prodId === prev) ? prev : null));
    };

    useEffect(() => {
        Promise.all([prodApi.list(), prodUomApi.list()]).then(([prodData, uomData]) => {
            setProds(prodData);
            setUomsByProd(groupByProd(uomData));
        });
    }, []);

    // 저장하지 않은 편집을 들고 다른 상품으로 넘어가면 조용히 사라진다 — 막고 알린다
    const selectProd = (prodId) => {
        if (prodId === selectedProdId) return;
        if (dirtyCount > 0) {
            toast.error('저장하지 않은 변경이 있습니다. 저장하거나 되돌린 뒤 이동하세요.');
            // 클릭으로 이미 옮겨간 그리드 선택 하이라이트를 현재 상품으로 되돌린다
            prodGridRef.current?.api.forEachNode(n => n.setSelected(n.data.prodId === selectedProdId));
            return;
        }
        setSelectedProdId(prodId);
    };

    // 원본에서 새로 뜬 편집판을 그리드에 직접 밀어 넣는다 — 행추가분(applyTransaction)까지 함께 걷힌다
    const revert = () => uomGridRef.current.api.setGridOption('rowData', snapshot(uomsByProd[selectedProdId]));

    /**
     * 입고/출고단위 지정. 이 그리드는 한 상품의 포장만 담으므로 전체를 훑어 하나만 켜면 된다.
     * setDataValue가 셀 갱신과 U 표시(onCellValueChanged)를 함께 처리한다.
     */
    const assignRole = (node, field) => {
        uomGridRef.current.api.forEachNode(n => {
            if (n.data._status === 'D') return;
            const next = n === node;
            if (!!n.data[field] === next) return; // 안 바뀌는 행은 U로 표시하지 않는다
            n.setDataValue(field, next);
        });
    };

    // ── 포장 추가 ───────────────────────────────────────────
    const handleAddUom = () => {
        if (!selectedProd) {
            toast('포장을 추가할 상품을 먼저 고르세요.');
            return;
        }
        addRow({
            _key: `new-${newRowSeq.current++}`,
            prodId: selectedProd.prodId,
            uomCd: '', eaQty: 1, wgt: null,
            inbUom: false, outbUom: false,
        }, 'uomCd');
    };

    // ── 엑셀 양식 다운로드 ───────────────────────────────────
    // 업로드가 읽는 헤더 그대로 예시 행을 담아 내려준다. 둘째 시트에 코드표를 넣어 입력 가능한
    // 값을 안내한다 (업로드는 첫 시트만 읽음).
    //
    // 입고단위·출고단위는 양식에 두지 않는다 — 상품마다 하나씩이라 엑셀에서 여러 행에 표시하면
    // 어느 행이 이기는지 정할 수 없다. 올린 뒤 화면에서 라디오로 지정한다.
    const handleTemplateDownload = () => {
        const sheet = XLSX.utils.json_to_sheet([
            { '상품코드': 'PROD-0001 (예시)', '단위': 'BOX', '낱개수량': 24, '중량(kg)': 9.12 },
            { '상품코드': 'PROD-0001 (예시)', '단위': 'PLT', '낱개수량': 576, '중량(kg)': 240 },
            { '상품코드': 'PROD-0002 (예시 - 중량 미측정은 빈 칸)', '단위': 'PACK', '낱개수량': 5, '중량(kg)': null },
        ]);
        sheet['!cols'] = [{ wch: 38 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];

        const codeSheet = XLSX.utils.json_to_sheet([
            ...prods.map(p => ({ '구분': '상품', '코드': p.prodCd, '이름': p.prodNm })),
            ...uomCodes.codes.map(c => ({ '구분': '단위', '코드': c.codeCd, '이름': c.codeNm })),
        ]);
        codeSheet['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 30 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, '단위');
        XLSX.utils.book_append_sheet(workbook, codeSheet, '코드표');
        XLSX.writeFile(workbook, 'prod_uom_upload_template.xlsx');
    };

    // ── 엑셀 업로드 ─────────────────────────────────────────
    // 여러 상품에 걸친 등록이라 그리드(한 상품)에 담지 않고 확인 후 곧장 서버로 보낸다.
    // 상품코드·단위가 실재하는지, 이미 등록된 포장은 아닌지 여기서 먼저 거른다 — (상품, 단위)가
    // 유일키라 그냥 보내면 서버가 첫 충돌에서 전체를 롤백하고, 어느 줄이 문제인지 되짚기 어렵다.
    const handleExcelUpload = async (e) => {
        const file = e.target.files[0];
        e.target.value = ''; // 같은 파일을 다시 선택해도 change 이벤트가 오도록 초기화
        if (!file) return;

        const workbook = XLSX.read(await file.arrayBuffer());
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });

        // 검색으로 좁혀진 화면 상태로 검증하면 목록 밖의 유효한 상품까지 오류로 거부된다 — 전체를 새로 받는다
        const [allProds, allUoms] = await Promise.all([prodApi.list(), prodUomApi.list()]);
        const prodByCd = Object.fromEntries(allProds.map(p => [p.prodCd, p]));
        const allUomsByProd = groupByProd(allUoms);

        const codeSet = new Set(uomCodes.values);
        const rows = [];
        const badLines = [];
        const dupLines = [];
        raw.forEach((r, i) => {
            const line = i + 2; // 엑셀 행 번호 (헤더 1행 + 1-base)
            const prodCd = String(r['상품코드'] ?? '').trim().toUpperCase();
            const uomCd = String(r['단위'] ?? '').trim().toUpperCase();
            const eaQty = r['낱개수량'];
            const prod = prodByCd[prodCd];
            if (!prod || !codeSet.has(uomCd) || !(Number(eaQty) >= 1)) {
                badLines.push(line);
                return;
            }
            // 이미 그 상품이 갖고 있는 단위인지
            if (allUomsByProd[prod.prodId]?.some(u => u.uomCd === uomCd)
                || rows.some(x => x.prodId === prod.prodId && x.uomCd === uomCd)) {
                dupLines.push(line);
                return;
            }
            const wgt = r['중량(kg)'];
            rows.push({
                _status: 'C',
                prodId: prod.prodId,
                prodCd,
                uomCd,
                eaQty: Number(eaQty),
                wgt: (wgt == null || String(wgt).trim() === '') ? null : Number(wgt),
            });
        });

        if (badLines.length > 0) {
            toast.error(`상품코드/단위/낱개수량이 잘못된 행이 있습니다 (엑셀 ${badLines.join(', ')}행)`);
            return;
        }
        if (dupLines.length > 0) {
            toast.error(`이미 등록된 포장입니다 (엑셀 ${dupLines.join(', ')}행)`);
            return;
        }
        if (rows.length === 0) {
            toast('추가할 데이터가 없습니다.');
            return;
        }
        setUploadConfirm(rows);
    };

    const doUpload = async (rows) => {
        try {
            await prodUomApi.saveAll(rows);
            toast.success(`${rows.length}건을 등록했습니다.`);
            fetchList();
        } catch (err) {
            toast.error(err.message || '업로드에 실패했습니다.');
        }
    };

    // ── 저장 ────────────────────────────────────────────────
    // rows는 편집 행(삭제 제외)만 온다 — 삭제 행은 id만 쓰므로 검증 대상이 아니다
    const validateRows = (rows) => {
        for (const r of rows) {
            if (!String(r.uomCd ?? '').trim()) {
                toast.error('단위는 필수입니다.');
                return false;
            }
            if (!(Number(r.eaQty) >= 1)) {
                toast.error(`낱개수량은 1 이상이어야 합니다: ${r.uomCd}`);
                return false;
            }
            const hasWgt = r.wgt != null && String(r.wgt).trim() !== '';
            if (hasWgt && !(Number(r.wgt) > 0)) {
                toast.error(`중량은 비워두거나(미측정) 0보다 커야 합니다: ${r.uomCd}`);
                return false;
            }
        }
        // 한 상품 안에서 같은 단위를 두 번 넣는 것 (uq_prod_uom 위반) — 편집 안 한 행까지 포함해 본다
        const cds = [];
        uomGridRef.current.api.forEachNode(n => { if (n.data._status !== 'D') cds.push(n.data.uomCd); });
        const dup = cds.find((cd, i) => cd && cds.indexOf(cd) !== i);
        if (dup) {
            toast.error(`같은 단위가 중복됩니다: ${dup}`);
            return false;
        }
        return true;
    };

    const doSave = async (dirty) => {
        try {
            await prodUomApi.saveAll(dirty.map(r => ({
                _status: r._status,
                prodUomId: r.prodUomId,
                prodId: r.prodId,
                uomCd: r.uomCd,
                eaQty: r.eaQty == null || r.eaQty === '' ? null : Number(r.eaQty),
                wgt: r.wgt == null || String(r.wgt).trim() === '' ? null : Number(r.wgt),
                // 서버는 true인 행만 본다 — 상품이 단위를 한 칸씩만 갖기 때문에
                // 새 포장을 지정하면 이전 포장은 저절로 풀린다
                inbUom: !!r.inbUom,
                outbUom: !!r.outbUom,
            })));
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

            {/* 검색 조건 — 왼쪽 상품 목록을 좁힌다 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="prodCd" label="상품코드" placeholder="PROD-0001" />
                <SearchText name="prodNm" label="상품명" placeholder="상품명 검색" />
            </SearchBar>

            <div className="flex-1 min-h-0 flex gap-4">
                {/* 좌: 상품 목록 */}
                <div className="w-96 shrink-0 flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">상품 {prods.length}건</span>
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
                        </div>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={prodGridRef}
                            rowData={prods}
                            columnDefs={prodColumnDefs}
                            getRowId={(p) => String(p.data.prodId)}
                            // enableClickSelection이 없으면 v33+ 기본값(false) 탓에 클릭해도 행 하이라이트가 안 생긴다
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                            onRowClicked={(p) => selectProd(p.data.prodId)}
                        />
                    </div>
                </div>

                {/* 우: 선택 상품의 포장 */}
                <div className="flex-1 min-w-0 flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">
                            {selectedProd ? (
                                <>
                                    <b className="text-slate-700">{selectedProd.prodNm}</b>
                                    <span className="text-slate-400"> 의 포장 {rowCount}건</span>
                                    {dirtyCount > 0 && (
                                        <span className="text-amber-500 font-bold"> · 미저장 {dirtyCount}건</span>
                                    )}
                                </>
                            ) : (
                                <span className="text-slate-400">왼쪽에서 상품을 고르세요</span>
                            )}
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={revert}
                                disabled={dirtyCount === 0}
                                className="btn-ghost">
                                <Undo2 size={13} /> 되돌리기
                            </button>
                            <button
                                onClick={deleteSelectedRows}
                                disabled={!selectedProd}
                                className="btn-danger">
                                <Trash2 size={13} /> 삭제
                            </button>
                            <button
                                onClick={handleAddUom}
                                disabled={!selectedProd}
                                className="btn-ghost">
                                <Plus size={13} /> 포장 추가
                            </button>
                            <button
                                onClick={() => requestSave(validateRows)}
                                disabled={dirtyCount === 0}
                                className="btn-primary">
                                <Save size={13} /> 저장
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={uomGridRef}
                            rowData={uomRows}
                            columnDefs={uomColumnDefs}
                            getRowId={(p) => p.data._key}
                            {...gridProps}
                        />
                    </div>
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
                    <SaveCountSummary
                        rows={saveConfirm}
                        prefix={<><b className="text-slate-700">{selectedProd?.prodNm}</b> · </>}
                    />
                    <p className="text-xs text-slate-400">
                        입고단위·출고단위로 쓰이는 포장은 삭제되지 않습니다 — 다른 포장으로 옮긴 뒤 지우세요.
                    </p>
                </ConfirmModal>
            )}

            {/* 엑셀 업로드 확인 모달 — 여러 상품에 걸치므로 그리드를 거치지 않고 바로 등록한다 */}
            {uploadConfirm && (
                <ConfirmModal
                    title="포장을 등록하시겠습니까?"
                    confirmText="등록"
                    onCancel={() => setUploadConfirm(null)}
                    onConfirm={() => { doUpload(uploadConfirm); setUploadConfirm(null); }}
                >
                    <p className="text-sm text-slate-500">
                        상품 <b className="text-slate-700">{new Set(uploadConfirm.map(r => r.prodId)).size}</b>건에
                        포장 <b className="text-blue-500">{uploadConfirm.length}</b>건을 추가합니다.
                    </p>
                    <p className="text-xs text-slate-400">
                        입고단위·출고단위는 엑셀로 정하지 않습니다 — 등록 후 상품을 골라 라디오로 지정하세요.
                    </p>
                </ConfirmModal>
            )}
        </div>
    );
}
