import { useRef, useState } from 'react';
import toast from 'react-hot-toast';

/**
 * 단일 그리드 마스터 화면(상품·존·로케이션·벤더·점포·채번규칙)의 공통 골격.
 *
 * C/U/D 행 상태 규약 — 셀 수정 시 U 마킹, 신규(C) 행은 삭제 시 즉시 제거, 기존 행은 D 마킹,
 * 저장 시 그리드 전체에서 dirty 행 수집
 *
 * 화면에 남는 것: 컬럼 정의 · 검색 조건(fetch) · 행 기본값 · 검증 · 저장 payload 변환.
 */
export function useMasterGrid() {
    const gridRef = useRef(null); // 그리드 api 호출용 (applyTransaction 등)
    const [rowCount, setRowCount] = useState(0); // 행추가분은 rowData 상태에 없으므로 건수는 그리드 기준으로 센다
    const [saveConfirm, setSaveConfirm] = useState(null); // 저장 확인 모달에 넘길 대상 행들 (null이면 닫힘)

    // 셀 수정 시 행 상태를 U(수정)로 표시 (신규 C는 유지)
    const onCellValueChanged = (params) => {
        if (params.column.getColId() === '_status') return; // 상태 컬럼 자체의 변경(삭제 표시 등)은 무시
        if (params.data._status !== 'C') {
            params.node.setDataValue('_status', 'U');
        }
    };

    /** AgGridReact에 스프레드로 넘기는 공통 props. 화면 고유 prop은 뒤에 이어 쓰면 덮인다 */
    const gridProps = {
        rowSelection: { mode: 'multiRow' },
        rowClassRules: {
            'line-through': (p) => p.data._status === 'D',
            'opacity-40': (p) => p.data._status === 'D',
        },
        stopEditingWhenCellsLoseFocus: true,
        onCellValueChanged,
        onModelUpdated: (p) => setRowCount(p.api.getDisplayedRowCount()),
    };

    // ── 행 추가 ──────────────────────────────────────────────
    // applyTransaction은 동기라 추가된 행 노드를 바로 돌려주므로 곧장 편집을 시작할 수 있다
    const addRow = (defaults, editColKey) => {
        const api = gridRef.current.api;
        const res = api.applyTransaction({ add: [{ ...defaults, _status: 'C' }] });
        const rowIndex = res.add[0].rowIndex;
        api.ensureIndexVisible(rowIndex, 'bottom');
        if (editColKey) {
            api.startEditingCell({ rowIndex, colKey: editColKey });
        }
    };

    // ── 삭제 ────────────────────────────────────────────────
    // 신규(C) 행은 그리드에서 바로 제거, 기존 행은 D로 표시해 저장 시 서버에 반영한다 (재조회하면 원복)
    const deleteSelectedRows = () => {
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
    /** 행추가분은 rowData 상태에 없으므로 그리드에서 전체 행을 수집한다 */
    const collectDirty = () => {
        const rows = [];
        gridRef.current.api.forEachNode(node => rows.push(node.data));
        return rows.filter(r => r._status);
    };

    /**
     * dirty 수집 → 검증 → 저장 확인 모달 오픈.
     * validate는 편집 행(삭제 제외)을 받아 문제가 있으면 토스트를 띄우고 false를 돌려준다.
     */
    const requestSave = (validate) => {
        const dirty = collectDirty();
        if (dirty.length === 0) {
            toast('변경된 내용이 없습니다.');
            return;
        }
        if (validate && !validate(dirty.filter(r => r._status !== 'D'))) {
            return;
        }
        setSaveConfirm(dirty); // 가운데 확인 모달을 띄운다
    };

    return {
        gridRef, rowCount, saveConfirm, setSaveConfirm,
        gridProps, addRow, deleteSelectedRows, collectDirty, requestSave,
    };
}
