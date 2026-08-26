import { useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Plus, Save, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';

import { usrApi } from '@/api/usrApi';
import { ROLE_LABELS, roleLabels } from '@/auth/roles';
import { useMasterGrid } from '@/hooks/useMasterGrid';
import { fmtDe, num } from '@/utils/format';
import SearchBar, { SearchText } from '@/components/common/SearchBar';
import { RowStatusCell } from '@/components/common/Badge';
import ConfirmModal from '@/components/common/ConfirmModal';
import SaveCountSummary from '@/components/common/SaveCountSummary';
import MultiCheckCellEditor from '@/components/common/MultiCheckCellEditor';

const ROLE_CODES = Object.keys(ROLE_LABELS);

export default function UsrMaster() {
    const {
        gridRef, rowCount, saveConfirm, setSaveConfirm,
        gridProps, addRow, deleteSelectedRows, requestSave,
    } = useMasterGrid();
    const [cond, setCond] = useState({ keyword: '' });
    const [rowData, setRowData] = useState([]);

    const notDeleted = (p) => p.data._status !== 'D';
    // 아이디는 신규 행에서만 입력받는다 — 이력의 등록자·수정자가 그 값으로 남아 있어 바꾸면 연결이 끊긴다
    const newRowOnly = (p) => p.data._status === 'C';

    const columnDefs = [
        {
            headerName: 'No.', width: 60, editable: false,
            valueGetter: (p) => p.node.rowIndex + 1,
            cellClass: 'text-slate-400',
        },
        {
            field: 'loginId', headerName: '아이디', width: 130,
            headerClass: 'header-required', editable: newRowOnly,
        },
        {
            field: 'usrNm', headerName: '사용자명', width: 140,
            headerClass: 'header-required', editable: notDeleted,
        },
        {
            field: 'roles', headerName: '역할', minWidth: 220, flex: 1,
            headerClass: 'header-required', editable: notDeleted,
            cellEditor: MultiCheckCellEditor,
            cellEditorPopup: true,
            cellEditorParams: { values: ROLE_CODES, labelMap: ROLE_LABELS },
            valueFormatter: (p) => roleLabels(p.value),
        },
        {
            field: 'pwd', headerName: '비밀번호', width: 150, editable: notDeleted,
            cellRenderer: (p) => (p.value
                ? '••••••'
                : <span className="text-slate-400">
                    {p.data._status === 'C' ? '(신규는 필수)' : '(변경 안 함)'}
                  </span>),
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
        const data = await usrApi.list(cond);
        setRowData(data);
    };

    useEffect(() => {
        usrApi.list().then(setRowData);
    }, []);

    const handleAddRow = () => addRow(
        { loginId: '', usrNm: '', pwd: '', roles: [] },
        'loginId'
    );

    const validateRows = (rows) => {
        for (const r of rows) {
            if (r._status === 'D') continue;
            if (r._status === 'C' && !String(r.loginId ?? '').trim()) {
                toast.error('아이디는 필수입니다.');
                return false;
            }
            if (r._status === 'C' && !String(r.pwd ?? '').trim()) {
                toast.error('신규 사용자는 비밀번호가 필수입니다.');
                return false;
            }
            if (!String(r.usrNm ?? '').trim()) {
                toast.error('사용자명은 필수입니다.');
                return false;
            }
            if (!r.roles?.length) {
                toast.error('역할은 하나 이상이어야 합니다.');
                return false;
            }
        }
        return true;
    };

    const doSave = async (dirty) => {
        try {
            await usrApi.saveAll(dirty);
            toast.success(`${dirty.length}건 저장했습니다.`);
            fetchList();
        } catch (e) {
            toast.error(e.message || '저장에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex items-center gap-2">
                <Users size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">사용자 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    로그인 계정과 역할 — 이 화면은 시스템관리자만 열 수 있습니다
                </span>
            </div>

            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="keyword" label="검색어" placeholder="아이디 · 사용자명" />
            </SearchBar>

            <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{num(rowCount)}건</span>
                <div className="flex gap-2">
                    <button onClick={deleteSelectedRows} className="btn-danger">
                        <Trash2 size={13} /> 삭제
                    </button>
                    <button onClick={handleAddRow} className="btn-ghost">
                        <Plus size={13} /> 행추가
                    </button>
                    <button onClick={() => requestSave(validateRows)} className="btn-primary">
                        <Save size={13} /> 저장
                    </button>
                </div>
            </div>

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
