import { useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Pin, Plus, Save, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { fxngLocApi } from '@/api/fxngLocApi';
import { prodApi } from '@/api/prodApi';
import { locApi } from '@/api/locApi';
import { zonApi } from '@/api/zonApi';
import { useMasterGrid } from '@/hooks/useMasterGrid';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { fmtDe, num } from '@/utils/format';
import SearchBar, { SearchSelect, SearchProd, SearchLoc } from '@/components/common/SearchBar';
import { Badge } from '@/components/common/Badge';
import { RowStatusCell } from '@/components/common/Badge';
import ConfirmModal from '@/components/common/ConfirmModal';
import LocPickerModal from '@/components/common/LocPickerModal';
import ProdPickerModal from '@/components/common/ProdPickerModal';
import SaveCountSummary from '@/components/common/SaveCountSummary';

export default function FxngLocMaster() {
    const {
        gridRef, rowCount, saveConfirm, setSaveConfirm,
        gridProps, addRow, deleteSelectedRows, requestSave,
    } = useMasterGrid();
    const [cond, setCond] = useState({ prodCd: '', locCd: '', zonCd: '' });
    const [rowData, setRowData] = useState([]);
    const [prods, setProds] = useState([]); // 상품 마스터 목록 (온도대 검증·상품명 표시의 원천)
    const [prodPicker, setProdPicker] = useState(null); // 상품 팝업이 채울 대상 행 노드 (null = 닫힘)
    const [locPicker, setLocPicker] = useState(null);   // 로케이션 팝업이 채울 대상 행 노드 (null = 닫힘)
    const [locs, setLocs] = useState([]);   // 로케이션 마스터 목록 (드롭다운 — STORAGE만)
    const [zons, setZons] = useState([]);   // 존 마스터 목록 (검색 드롭다운)

    // 삭제(D) 표시된 행은 편집을 막는다
    const notDeleted = (p) => p.data._status !== 'D';

    // 마스터에서 파생 — 하드코딩하지 않는다. 고정은 보관(STORAGE) 로케이션만 지정할 수 있다
    const storageLocs = locs.filter(l => l.locTyp === 'STORAGE');
    const prodMap = Object.fromEntries(prods.map(p => [p.prodCd, p]));
    const locMap = Object.fromEntries(storageLocs.map(l => [l.locCd, l]));
    const zonOptions = [{ value: '', label: '전체' }, ...zons.map(z => ({ value: z.zonCd, label: `${z.zonCd} ${z.zonNm}` }))];

    const columnDefs = [
        {
            headerName: 'No.', width: 60, editable: false,
            valueGetter: (p) => p.node.rowIndex + 1,
            cellClass: 'text-slate-400',
        },
        {
            // 상품은 건수가 많아 드롭다운 대신 검색 팝업으로 고른다 — 값 반영(setDataValue)도
            // 셀 수정 이벤트를 타므로 C/U 더티 추적은 직접 편집과 동일하다
            field: 'prodCd', headerName: '상품', width: 130,
            headerClass: 'header-required', editable: false,
            cellRenderer: (p) => (
                <div className="flex items-center justify-between gap-1 w-full">
                    <span>{p.value || <span className="text-slate-300">상품 선택</span>}</span>
                    {p.data._status !== 'D' && (
                        <button
                            type="button"
                            onClick={() => setProdPicker(p.node)}
                            title="상품 팝업에서 선택"
                            className="p-0.5 text-slate-400 hover:text-indigo-600 shrink-0">
                            <Search size={13} />
                        </button>
                    )}
                </div>
            ),
        },
        {
            field: 'prodNm', headerName: '상품명', width: 180, editable: false,
            // 편집 중인 신규 행도 상품명이 따라오게 마스터에서 파생한다
            valueGetter: (p) => prodMap[p.data.prodCd]?.prodNm ?? p.data.prodNm ?? '',
        },
        {
            // 상품과 같은 팝업 방식 — 고를 수 있는 건 보관(STORAGE) 로케이션뿐이라 팝업도 그렇게 거른다
            field: 'locCd', headerName: '로케이션', width: 140,
            headerClass: 'header-required', editable: false,
            cellRenderer: (p) => (
                <div className="flex items-center justify-between gap-1 w-full">
                    <span>{p.value || <span className="text-slate-300">로케이션 선택</span>}</span>
                    {p.data._status !== 'D' && (
                        <button
                            type="button"
                            onClick={() => setLocPicker(p.node)}
                            title="로케이션 팝업에서 선택"
                            className="p-0.5 text-slate-400 hover:text-indigo-600 shrink-0">
                            <Search size={13} />
                        </button>
                    )}
                </div>
            ),
        },
        {
            field: 'zonCd', headerName: '존', width: 100, editable: false,
            valueGetter: (p) => locMap[p.data.locCd]?.zonCd ?? p.data.zonCd ?? '',
        },
        {
            field: 'tmpZon', headerName: '온도대', width: 100, editable: false,
            valueGetter: (p) => locMap[p.data.locCd]?.tmpZon ?? p.data.tmpZon ?? '',
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
        },
        {
            field: 'locMaxQty', headerName: '최대 적재 수량', width: 120, editable: false,
            valueGetter: (p) => locMap[p.data.locCd]?.maxQty ?? p.data.locMaxQty ?? null,
            cellClass: 'ag-right-aligned-cell text-slate-400',
            headerTooltip: '로케이션 마스터의 최대 적재 수량 — 보충 상한은 이 값을 넘을 수 없다',
            valueFormatter: (p) => (p.value == null || p.value === '') ? '' : num(p.value),
        },
        {
            field: 'minQty', headerName: '재보충점', width: 110,
            headerClass: 'header-required', editable: notDeleted,
            cellClass: 'ag-right-aligned-cell',
            headerTooltip: '재고가 이 아래로 내려가면 보충 대상 (보충 프로세스 구현 시 사용)',
            valueFormatter: (p) => (p.value == null || p.value === '') ? '' : num(p.value),
        },
        {
            field: 'maxQty', headerName: '보충 상한', width: 110,
            headerClass: 'header-required', editable: notDeleted,
            cellClass: 'ag-right-aligned-cell',
            headerTooltip: '보충이 채우는 목표 수량. 로케이션 최대 적재 수량 이하',
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
        const data = await fxngLocApi.list(cond);
        setRowData(data);
    };

    // 최초 1회 조회 (이후엔 조회 버튼으로 재조회) + 드롭다운 원천 마스터
    useEffect(() => {
        fxngLocApi.list().then(setRowData);
        prodApi.list().then(setProds);
        locApi.list().then(setLocs);
        zonApi.list().then(setZons);
    }, []);

    // ── 행 추가 ──────────────────────────────────────────────
    // 상품·로케이션은 셀의 돋보기 버튼으로 고른다 — 행추가는 빈 행만 만든다
    const handleAddRow = () => addRow({ prodCd: '', locCd: '', minQty: 0, maxQty: null });

    // ── 저장 ────────────────────────────────────────────────
    // 검증 (삭제 행은 id만 쓰므로 검증 대상 아님) — 서버 검증과 같은 규칙을 저장 전에 걸러준다
    const validateRows = (rows) => {
        for (const r of rows) {
            const prod = prodMap[r.prodCd];
            const loc = locMap[r.locCd];
            if (!prod) {
                toast.error('상품은 필수입니다.');
                return false;
            }
            if (!loc) {
                toast.error(`로케이션은 필수입니다: ${r.prodCd}`);
                return false;
            }
            if (prod.tmpZon !== loc.tmpZon) {
                toast.error(`상품과 로케이션의 온도대가 다릅니다: ${r.prodCd} ↔ ${r.locCd}`);
                return false;
            }
            if (r.minQty == null || r.minQty === '' || !(Number(r.minQty) >= 0)) {
                toast.error(`재보충점은 0 이상 숫자여야 합니다: ${r.locCd}`);
                return false;
            }
            if (r.maxQty == null || r.maxQty === '' || !(Number(r.maxQty) >= 1)) {
                toast.error(`보충 상한은 1 이상 숫자여야 합니다: ${r.locCd}`);
                return false;
            }
            if (Number(r.minQty) > Number(r.maxQty)) {
                toast.error(`재보충점은 보충 상한 이하여야 합니다: ${r.locCd}`);
                return false;
            }
            if (loc.maxQty != null && Number(r.maxQty) > loc.maxQty) {
                toast.error(`보충 상한은 로케이션 최대 적재 수량(${num(loc.maxQty)}) 이하여야 합니다: ${r.locCd}`);
                return false;
            }
        }
        // 한 로케이션 = 한 상품 전용(uq_fxng_loc) — 서버가 건건이 확인하기 전에 신규 행끼리 먼저 막는다
        const newCds = rows.filter(r => r._status === 'C').map(r => r.locCd);
        const dup = newCds.find((cd, i) => newCds.indexOf(cd) !== i);
        if (dup) {
            toast.error(`로케이션이 중복됩니다: ${dup}`);
            return false;
        }
        return true;
    };

    const doSave = async (dirty) => {
        try {
            const payload = dirty.map(r => ({
                ...r,
                minQty: (r.minQty == null || r.minQty === '') ? null : Number(r.minQty),
                maxQty: (r.maxQty == null || r.maxQty === '') ? null : Number(r.maxQty),
            }));
            await fxngLocApi.saveAll(payload);
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
                <Pin size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">고정 로케이션 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">상품×로케이션 지정 · 피킹존 운영과 보충 기준</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchProd name="prodCd" />
                <SearchLoc name="locCd" placeholder="PIK-DRY-01-01" wide />
                <SearchSelect name="zonCd" label="존" options={zonOptions} wide />
            </SearchBar>

            {/* 그리드 툴바 */}
            <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{num(rowCount)}건</span>
                <div className="flex gap-2">
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

            {/* 상품·로케이션 선택 팝업 — 고른 코드를 대상 행에 반영한다 (선택 시 스스로 닫힘) */}
            <ProdPickerModal
                open={prodPicker != null}
                onClose={() => setProdPicker(null)}
                onSelect={(p) => prodPicker.setDataValue('prodCd', p.prodCd)}
            />
            <LocPickerModal
                open={locPicker != null}
                locTyp="STORAGE"
                onClose={() => setLocPicker(null)}
                onSelect={(l) => locPicker.setDataValue('locCd', l.locCd)}
            />

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
