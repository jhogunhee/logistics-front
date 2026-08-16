import { useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Building2, Plus, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { vendorApi } from '@/api/vendorApi';
import { useMasterGrid } from '@/hooks/useMasterGrid';
import { fmtDe, num } from '@/utils/format';
import SearchBar, { SearchText } from '@/components/common/SearchBar';
import { RowStatusCell } from '@/components/common/Badge';
import ConfirmModal from '@/components/common/ConfirmModal';
import SaveCountSummary from '@/components/common/SaveCountSummary';

export default function VendorMaster() {
    const {
        gridRef, rowCount, saveConfirm, setSaveConfirm,
        gridProps, addRow, deleteSelectedRows, requestSave,
    } = useMasterGrid();
    const [cond, setCond] = useState({ vndrCd: '', vndrNm: '' });
    const [rowData, setRowData] = useState([]);

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

    // ── 행 추가 ──────────────────────────────────────────────
    const handleAddRow = () => addRow(
        { vndrCd: '', vndrNm: '', picNm: '', telNo: '' },
        'vndrNm'
    );

    // ── 저장 ────────────────────────────────────────────────
    const validateRows = (rows) => {
        for (const r of rows) {
            if (!String(r.vndrNm ?? '').trim()) {
                toast.error('벤더명은 필수입니다.');
                return false;
            }
        }
        return true;
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
