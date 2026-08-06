import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Building2, Plus, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchText } from '@/components/common/SearchBar';
import { vendorApi } from '@/api/vendorApi';
import { RowStatusCell } from '@/components/common/Badge';
import { fmtDe } from '@/utils/format';
import ConfirmModal from '@/components/common/ConfirmModal';



export default function VendorMaster() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ vndrCd: '', vndrNm: '' });
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
            field: 'vndrCd', headerName: '벤더 코드', width: 110, editable: false,
            cellRenderer: (p) => p.value || <span className="text-slate-400">(저장 시 채번)</span>,
        },
        { field: 'vndrNm', headerName: '벤더명', minWidth: 180, flex: 1, editable: notDeleted },
        { field: 'picNm', headerName: '담당자', width: 110, editable: notDeleted },
        { field: 'telNo', headerName: '연락처', width: 140, editable: notDeleted },
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
        const data = await vendorApi.list(cond);
        setRowData(data);
    };

    // 최초 1회 조회 (이후엔 조회 버튼으로 재조회)
    useEffect(() => {
        vendorApi.list().then(setRowData);
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
            add: [{ vndrCd: '', vndrNm: '', picNm: '', telNo: '', _status: 'C' }],
        });
        const rowIndex = res.add[0].rowIndex;
        api.ensureIndexVisible(rowIndex, 'bottom');
        api.startEditingCell({ rowIndex, colKey: 'vndrNm' });
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
            if (!String(r.vndrNm ?? '').trim()) {
                toast.error('벤더명은 필수입니다.');
                return;
            }
        }
        setSaveConfirm(dirty);
    };

    const doSave = async (dirty) => {
        try {
            await vendorApi.saveAll(dirty);
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
                <Building2 size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">벤더 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    납품처 마스터 — 입고주문·입고예정이 참조합니다
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="vndrCd" label="벤더 코드" placeholder="VD-0001" />
                <SearchText name="vndrNm" label="벤더명" placeholder="벤더명 검색" />
            </SearchBar>

            {/* 그리드 툴바 */}
            <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{rowCount}건</span>
                <div className="flex gap-2">
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