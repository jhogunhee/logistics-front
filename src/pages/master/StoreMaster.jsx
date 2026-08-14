import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Plus, Save, Store, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchSelect, SearchText } from '@/components/common/SearchBar';
import { storeApi } from '@/api/storeApi';
import { RowStatusCell } from '@/components/common/Badge';
import SelectCellEditor from '@/components/common/SelectCellEditor';
import { useCodes } from '@/hooks/useCodes';
import { fmtDe, num } from '@/utils/format';
import ConfirmModal from '@/components/common/ConfirmModal';



export default function StoreMaster() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ storeCd: '', storeNm: '', storeGrp: '', storeTyp: '' });
    const storeGrpCodes = useCodes('STORE_GRP');
    const storeTypCodes = useCodes('STORE_TYP');
    const [rowCount, setRowCount] = useState(0); // 행추가분은 rowData 상태에 없으므로 건수는 그리드 기준으로 센다
    const [saveConfirm, setSaveConfirm] = useState(null); // 저장 확인 모달 대상 행들 (null이면 닫힘)
    const gridRef = useRef(null);

    // 삭제(D) 표시된 행은 편집을 막는다
    const notDeleted = (p) => p.data._status !== 'D';

    const columnDefs = [
        {
            headerName: 'No.', width: 60, editable: false,
            valueGetter: (p) => p.node.rowIndex + 1,
            cellClass: 'text-slate-400',
        },
        {
            field: 'storeCd', headerName: '점포 코드', width: 110, editable: false,
            cellRenderer: (p) => p.value || <span className="text-slate-400">(저장 시 채번)</span>,
        },
        { field: 'storeNm', headerName: '점포명', minWidth: 180, flex: 1, editable: notDeleted },
        {
            field: 'storeGrp', headerName: '그룹', width: 110, editable: notDeleted,
            cellEditor: SelectCellEditor,
            cellEditorParams: { values: storeGrpCodes.values, labelMap: storeGrpCodes.nmByCd, placeholder: '미지정' },
            // 코드가 아니라 코드명으로 보여준다 — 미지정(null)은 빈칸
            valueFormatter: (p) => (p.value ? storeGrpCodes.nm(p.value) : ''),
            headerTooltip: '체인·계열 묶음입니다. 웨이브 편성 조건 「납품처그룹」과 할당 분배 대상 선별이 이 값을 봅니다',
        },
        {
            field: 'storeTyp', headerName: '유형', width: 100, editable: notDeleted,
            cellEditor: SelectCellEditor,
            cellEditorParams: { values: storeTypCodes.values, labelMap: storeTypCodes.nmByCd, placeholder: '미지정' },
            valueFormatter: (p) => (p.value ? storeTypCodes.nm(p.value) : ''),
            headerTooltip: '업태(편의점·마트·급식)입니다. 웨이브 편성 조건 「납품처유형」과 할당 분배 대상 선별이 이 값을 봅니다',
        },
        {
            field: 'outbLifeRate', headerName: '잔여수명 허용률(%)', width: 150, editable: notDeleted,
            type: 'numericColumn',
            cellEditor: 'agNumberCellEditor',
            cellEditorParams: { min: 0, max: 100 },
            valueFormatter: (p) => num(p.value),
            headerTooltip: '이 점포로 출고할 때 잔여 유통기한이 이 비율 미만인 Lot은 할당에서 빠집니다 (FEFO 앞단 필터)',
        },
        {
            field: '_status', headerName: '상태', width: 70,
            cellRenderer: (p) => <RowStatusCell value={p.value} />,
        },
        { field: 'createdBy', headerName: '등록자', width: 100, editable: false },
        {
            field: 'createdAt', headerName: '등록일자', width: 110, editable: false,
            valueFormatter: (p) => fmtDe(p.value),
        },
        { field: 'updatedBy', headerName: '수정자', width: 100, editable: false },
        {
            field: 'updatedAt', headerName: '수정일자', width: 110, editable: false,
            valueFormatter: (p) => fmtDe(p.value),
        },
    ];

    const fetchList = async () => {
        const data = await storeApi.list(cond);
        setRowData(data);
    };

    // 최초 1회 조회 (이후엔 조회 버튼으로 재조회)
    useEffect(() => {
        storeApi.list().then(setRowData);
    }, []);

    // 셀 수정 시 행 상태를 U(수정)로 표시 (신규 C는 유지)
    const onCellValueChanged = (params) => {
        if (params.column.getColId() === '_status') return;
        if (params.data._status !== 'C') {
            params.node.setDataValue('_status', 'U');
        }
    };

    // ── 행 추가 ──────────────────────────────────────────────
    const handleAddRow = () => {
        const api = gridRef.current.api;
        const res = api.applyTransaction({
            // 허용률은 DB 기본값(40)을 미리 채워 준다 — 필수값이라 비워 두면 저장이 막힌다.
            // 그룹·유형은 선택값이라 미지정(null)으로 시작한다
            add: [{ storeCd: '', storeNm: '', storeGrp: null, storeTyp: null, outbLifeRate: 40, _status: 'C' }],
        });
        const rowIndex = res.add[0].rowIndex;
        api.ensureIndexVisible(rowIndex, 'bottom');
        api.startEditingCell({ rowIndex, colKey: 'storeNm' });
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

    // ── 저장 ────────────────────────────────────────────────
    const handleSave = () => {
        const rows = [];
        gridRef.current.api.forEachNode(node => rows.push(node.data));
        const dirty = rows.filter(r => r._status);
        if (dirty.length === 0) {
            toast('변경된 내용이 없습니다.');
            return;
        }
        for (const r of dirty.filter(r => r._status !== 'D')) {
            if (!String(r.storeNm ?? '').trim()) {
                toast.error('점포명은 필수입니다.');
                return;
            }
            const rate = Number(r.outbLifeRate);
            if (r.outbLifeRate == null || r.outbLifeRate === '' || !(rate >= 0 && rate <= 100)) {
                toast.error(`잔여수명 허용률은 0~100 사이여야 합니다: ${r.storeNm}`);
                return;
            }
        }
        setSaveConfirm(dirty);
    };

    const doSave = async (dirty) => {
        try {
            await storeApi.saveAll(dirty);
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
                <Store size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">점포 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    납품처 마스터 — 출고주문이 참조하고, 허용률은 할당의 잔여수명 필터 기준입니다
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="storeCd" label="점포 코드" placeholder="ST-0001" />
                <SearchText name="storeNm" label="점포명" placeholder="점포명 검색" />
                <SearchSelect name="storeGrp" label="그룹" options={storeGrpCodes.searchOptions} />
                <SearchSelect name="storeTyp" label="유형" options={storeTypCodes.searchOptions} />
            </SearchBar>

            {/* 그리드 툴바 */}
            <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{num(rowCount)}건</span>
                <div className="flex gap-2">
                    <button onClick={handleDeleteRows} className="btn-danger">
                        <Trash2 size={13} /> 삭제
                    </button>
                    <button onClick={handleAddRow} className="btn-ghost">
                        <Plus size={13} /> 행추가
                    </button>
                    <button onClick={handleSave} className="btn-primary">
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
