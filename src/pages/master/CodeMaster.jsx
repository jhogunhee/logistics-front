import { useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ListTree, Plus, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { codeApi } from '@/api/codeApi';
import { useMasterGrid } from '@/hooks/useMasterGrid';
import { fmtDe, num } from '@/utils/format';
import SearchBar, { SearchText } from '@/components/common/SearchBar';
import { RowStatusCell } from '@/components/common/Badge';
import ConfirmModal from '@/components/common/ConfirmModal';
import SaveCountSummary from '@/components/common/SaveCountSummary';

export default function CodeMaster() {
    // 그리드가 둘이라 훅도 둘 — C/U/D 마킹·행추가·삭제·dirty 수집 규약을 다른 마스터 화면과 같은 훅으로 쓴다
    const {
        gridRef: groupGridRef, rowCount: groupRowCount, gridProps: groupGridProps,
        addRow: addGroupRow, collectDirty: collectGroupDirty,
    } = useMasterGrid();
    const {
        gridRef, rowCount, saveConfirm, setSaveConfirm,
        gridProps, addRow, deleteSelectedRows, collectDirty, requestSave,
    } = useMasterGrid();
    const [cond, setCond] = useState({ grpCd: '', grpNm: '' });
    const [groups, setGroups] = useState([]);
    const [rowData, setRowData] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null); // 상단에서 고른 그룹 (null이면 하단이 비어 있다)
    const [groupSwitchConfirm, setGroupSwitchConfirm] = useState(null); // 미저장 상태에서 그룹을 바꾸려 할 때 보류된 그룹

    // 삭제(D) 표시된 행은 편집을 막는다
    const notDeleted = (p) => p.data._status !== 'D';
    // 코드 값은 (grp_cd, code_cd) PK의 일부라 등록 후 변경 불가 — 신규(C) 행에서만 입력받는다
    const isNew = (p) => p.data._status === 'C';

    const GROUP_COLUMN_DEFS = [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        {
            // 그룹코드는 PK이자 코드가 리터럴로 참조하는 값이라 등록 후 변경 불가
            field: 'grpCd', headerName: '그룹코드', width: 150,
            editable: isNew,
            cellClass: 'font-medium text-slate-700',
            valueParser: (p) => String(p.newValue ?? '').trim().toUpperCase(),
            cellRenderer: (p) => p.value || <span className="text-slate-400">(입력)</span>,
        },
        { field: 'grpNm', headerName: '그룹명', width: 150, editable: notDeleted },
        {
            field: 'dscr', headerName: '설명', flex: 1, minWidth: 200, editable: notDeleted,
            cellRenderer: (p) => p.value || <span className="text-slate-300">-</span>,
        },
        {
            field: '_status', headerName: '상태', width: 70,
            cellRenderer: (p) => <RowStatusCell value={p.value} />,
        },
    ];

    const columnDefs = [
        {
            headerName: 'No.', width: 60, editable: false,
            valueGetter: (p) => p.node.rowIndex + 1,
            cellClass: 'text-slate-400',
        },
        {
            field: 'codeCd', headerName: '코드', width: 140,
            editable: isNew,
            headerTooltip: '등록 후에는 변경할 수 없습니다',
            valueParser: (p) => String(p.newValue ?? '').trim().toUpperCase(), // 코드는 대문자로 통일
            cellRenderer: (p) => p.value || <span className="text-slate-400">(입력)</span>,
        },
        { field: 'codeNm', headerName: '코드명', flex: 1, minWidth: 160, editable: notDeleted },
        {
            field: 'srtSeq', headerName: '정렬순서', width: 110, editable: notDeleted,
            type: 'numericColumn',
            cellEditor: 'agNumberCellEditor',
            headerTooltip: '화면 콤보박스에 노출되는 순서입니다',
        },
        {
            // 참조값은 뜻이 그룹마다 다르다 — 컬럼명으로는 알 수 없으므로 위 그룹 설명을 본다
            field: 'ref1', headerName: '참조1', width: 110, editable: notDeleted,
            headerTooltip: '코드에 딸린 부가 속성. 뜻은 그룹마다 다릅니다 (그룹 설명 참고)',
            cellRenderer: (p) => p.value || <span className="text-slate-300">-</span>,
        },
        {
            field: 'ref2', headerName: '참조2', width: 110, editable: notDeleted,
            cellRenderer: (p) => p.value || <span className="text-slate-300">-</span>,
        },
        {
            field: 'ref3', headerName: '참조3', width: 110, editable: notDeleted,
            cellRenderer: (p) => p.value || <span className="text-slate-300">-</span>,
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

    /**
     * 그룹 검색 — 검색조건(그룹코드/그룹명)은 상단 그룹 그리드에 걸린다.
     * 결과에 현재 선택 그룹이 남아 있으면 새 객체로 바꿔 끼우고, 없으면 선택을 풀고 하단도 비운다.
     */
    const fetchGroups = async (searchCond = cond) => {
        const newGroups = await codeApi.searchGroups(searchCond);
        setGroups(newGroups);
        const kept = selectedGroup ? newGroups.find(g => g.grpCd === selectedGroup.grpCd) ?? null : null;
        selectGroup(kept);
    };

    /**
     * 그룹 선택 변경은 반드시 이 함수를 거친다.
     * 선택이 풀리거나(null) 아직 저장 전인 신규 그룹(_status 'C')이면 공통코드 데이터를 비운다.
     */
    const selectGroup = (group) => {
        setSelectedGroup(group);
        if (!group || group._status === 'C') setRowData([]);
    };

    // 최초 진입은 조건 없이 전체 그룹을 보여준다 — 하단은 그룹을 클릭할 때 채워진다
    useEffect(() => {
        codeApi.searchGroups().then(setGroups);
    }, []);

    /**
     * 코드 조회는 선택 이벤트가 아니라 selectedGroup 변화에 매단다.
     * 이벤트에 매달면 저장 후 되살린 선택처럼 그리드 내부에서 발생한 선택에서 조회가 누락된다.
     * 상태를 기준으로 삼으면 사용자가 클릭하든 코드가 고르든 같은 경로를 탄다.
     */
    useEffect(() => {
        if (!selectedGroup || selectedGroup._status === 'C') return;
        let ignore = false;
        codeApi.search(selectedGroup.grpCd)
            .then(d => { if (!ignore) setRowData(d); })
            .catch(() => {
                // 실패를 삼키면 앞 그룹의 코드가 그대로 남아 "한 칸 밀린" 화면이 된다 —
                // 고른 그룹과 보이는 코드가 어긋나는 것이 빈 그리드보다 위험하다.
                // 토스트는 axios 인터셉터가 띄우므로 여기서는 비우기만 한다.
                if (ignore) return;
                setRowData([]);
            });
        return () => { ignore = true; };
    }, [selectedGroup]);

    // 그룹 데이터가 들어올 때마다(검색·저장 후 rowData 교체): 사라진 그리드 선택을 selectedGroup에 맞춰 되살린다.
    const syncGroupSelection = (p) => {
        if (!selectedGroup || p.api.getSelectedRows().length > 0) return;
        p.api.forEachNode(n => { if (n.data.grpCd === selectedGroup.grpCd) n.setSelected(true); });
    };

    /** 확인 모달에서 취소했을 때 — 선택을 앞 그룹으로 되돌린다 (이벤트가 다시 돌지만 grpCd가 같아 걸러진다) */
    const revertGroupSelection = () => {
        groupGridRef.current?.api.forEachNode(n => n.setSelected(n.data.grpCd === selectedGroup?.grpCd));
    };

    /**
     * 그룹 전환. 저장하지 않은 코드 변경이 있으면 되묻는다 —
     * 저장이 그룹 단위(/master/codes/{grpCd}/bulk)로 나가므로 다른 그룹의 편집분이 섞이면 안 된다.
     */
    const onGroupSelected = (p) => {
        const nextGroup = p.api.getSelectedRows()[0] ?? null;
        if (!nextGroup || nextGroup.grpCd === selectedGroup?.grpCd) return;

        const dirty = gridRef.current ? collectDirty() : [];
        if (dirty.length > 0) {
            // 확인 모달은 비동기라 여기서 막을 수 없다 — 전환을 보류해 두고 응답을 기다린다
            setGroupSwitchConfirm(nextGroup);
            return;
        }
        selectGroup(nextGroup);
    };

    // ── 그룹 편집 ────────────────────────────────────────────
    // 저장 대상이 코드가 아니라 그룹이라 저장 버튼도 패널마다 따로 둔다.
    const handleAddGroup = () => addGroupRow({ grpCd: '', grpNm: '', dscr: '' }, 'grpCd');

    // 그룹은 단일 선택이라 "선택된 그룹"을 지운다 (코드 그리드의 다중 선택과 다르다)
    const handleDeleteGroup = () => {
        const api = groupGridRef.current.api;
        const node = api.getSelectedNodes()[0];
        if (!node) { toast('삭제할 그룹을 선택하세요.'); return; }
        if (node.data._status === 'C') {
            api.applyTransaction({ remove: [node.data] });
            toast('신규 행을 제거했습니다.');
            return;
        }
        node.setDataValue('_status', 'D');
        toast(`${node.data.grpCd} 는 저장 시 삭제됩니다`);
    };

    const handleSaveGroups = async () => {
        const dirty = collectGroupDirty();
        if (dirty.length === 0) { toast('변경된 그룹이 없습니다.'); return; }
        for (const r of dirty.filter(r => r._status !== 'D')) {
            if (!String(r.grpCd ?? '').trim()) { toast.error('그룹코드는 필수입니다.'); return; }
            if (!String(r.grpNm ?? '').trim()) { toast.error(`그룹명은 필수입니다: ${r.grpCd}`); return; }
        }
        try {
            await codeApi.saveGroups(dirty);
            toast.success(`그룹 ${dirty.length}건 저장했습니다.`);

            await fetchGroups();
        } catch (e) {
            toast.error(e.message || '그룹 저장에 실패했습니다.');
        }
    };

    // ── 행 추가 ──────────────────────────────────────────────
    // 정렬순서 기본값은 현재 최댓값 + 1 — 새 코드는 콤보박스 맨 뒤에 붙는 게 자연스럽다
    const handleAddRow = () => {
        if (!selectedGroup) { toast('위에서 그룹을 먼저 고르세요.'); return; }
        // 미저장 신규 그룹은 서버에 없다 — 코드 저장이 /master/codes/{grpCd}/bulk로 나가므로 그룹 저장이 먼저다
        if (selectedGroup._status === 'C') { toast('그룹을 먼저 저장하세요.'); return; }
        let maxSeq = 0;
        gridRef.current.api.forEachNode(node => { maxSeq = Math.max(maxSeq, node.data.srtSeq ?? 0); });
        addRow({ codeCd: '', codeNm: '', srtSeq: maxSeq + 1, ref1: '', ref2: '', ref3: '' }, 'codeCd');
    };

    // ── 저장 ────────────────────────────────────────────────
    const validateRows = (rows) => {
        for (const r of rows) {
            if (!String(r.codeCd ?? '').trim()) {
                toast.error('코드는 필수입니다.');
                return false;
            }
            if (!String(r.codeNm ?? '').trim()) {
                toast.error(`코드명은 필수입니다: ${r.codeCd}`);
                return false;
            }
            if (r.srtSeq === null || r.srtSeq === undefined || r.srtSeq === '') {
                toast.error(`정렬순서는 필수입니다: ${r.codeCd}`);
                return false;
            }
        }
        // 신규 행끼리의 코드 중복은 서버가 건건이 INSERT하며 잡기 전에 여기서 먼저 막는다
        const newCds = rows.filter(r => r._status === 'C').map(r => r.codeCd);
        const dup = newCds.find((cd, i) => newCds.indexOf(cd) !== i);
        if (dup) {
            toast.error(`코드가 중복됩니다: ${dup}`);
            return false;
        }
        return true;
    };

    const handleSave = () => {
        if (selectedGroup?._status === 'C') { toast.error('그룹을 먼저 저장하세요.'); return; }
        requestSave(validateRows);
    };

    const doSave = async (dirty) => {
        try {
            await codeApi.saveAll(selectedGroup.grpCd, dirty);
            toast.success(`${dirty.length}건 저장했습니다.`);
            // 같은 그룹 재조회 — selectedGroup이 바뀌지 않아 위 useEffect는 돌지 않는다
            setRowData(await codeApi.search(selectedGroup.grpCd));
        } catch (e) {
            toast.error(e.message || '저장에 실패했습니다.');
        }
    };

    return (
        // min-h — 노트북처럼 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <ListTree size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">공통코드 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    그룹과 그 안의 코드를 편집합니다 — 저장은 위·아래 패널이 각각 따로입니다
                </span>
            </div>

            {/* 검색 조건은 상단(그룹)에 걸린다 — 하단 코드는 그룹 행을 클릭할 때 조회된다 */}
            <SearchBar label="그룹 검색" cond={cond} setCond={setCond} onSearch={() => fetchGroups()}>
                <SearchText name="grpCd" label="그룹코드" placeholder="TEMP_ZONE" />
                <SearchText name="grpNm" label="그룹명" placeholder="온도대" />
            </SearchBar>

            {/* 저장 확인 모달 */}
            {saveConfirm && (
                <ConfirmModal
                    title="저장하시겠습니까?"
                    confirmText="저장"
                    onCancel={() => setSaveConfirm(null)}
                    onConfirm={() => { doSave(saveConfirm); setSaveConfirm(null); }}
                >
                    <SaveCountSummary rows={saveConfirm} prefix={<><b>{selectedGroup?.grpNm}</b> · </>} />
                    <p className="text-xs text-slate-400">
                        코드 값은 로직이 리터럴로 참조합니다. 이미 쓰이는 코드를 지우면 그 값을 가진 기존 데이터가 화면에서 빈 칸으로 보입니다.
                    </p>
                </ConfirmModal>
            )}

            {/* 그룹 전환 확인 — 저장이 그룹 단위라 다른 그룹의 편집분이 섞이면 안 된다 */}
            {groupSwitchConfirm && (
                <ConfirmModal
                    title="그룹을 바꾸시겠습니까?"
                    confirmText="그룹 바꾸기"
                    danger
                    onCancel={() => { setGroupSwitchConfirm(null); revertGroupSelection(); }}
                    onConfirm={() => { selectGroup(groupSwitchConfirm); setGroupSwitchConfirm(null); }}
                >
                    <p className="text-sm text-slate-500">
                        <b className="text-slate-700">{selectedGroup?.grpNm}</b>에 저장하지 않은 코드 변경이 있습니다.
                        그룹을 바꾸면 <b className="text-red-500">사라집니다</b>.
                    </p>
                </ConfirmModal>
            )}

            {/* 상하 분할 + 드래그 스플리터 (비율은 localStorage에 기억됨) */}
            <PanelGroup direction="vertical" autoSaveId="master-code-split-v1" className="flex-1 min-h-0">
                <Panel defaultSize={35} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-700">코드 그룹</span>
                            <span className="text-xs text-slate-400">
                                {groupRowCount}건 · 그룹코드는 등록 후 변경할 수 없습니다
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleDeleteGroup}
                                title="코드가 남아 있는 그룹은 서버가 삭제를 거부합니다"
                                className="btn-danger">
                                <Trash2 size={13} /> 삭제
                            </button>
                            <button
                                onClick={handleAddGroup}
                                className="btn-ghost">
                                <Plus size={13} /> 행추가
                            </button>
                            <button
                                onClick={handleSaveGroups}
                                className="btn-primary">
                                <Save size={13} /> 저장
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={groupGridRef}
                            rowData={groups}
                            columnDefs={GROUP_COLUMN_DEFS}
                            rowHeight={34}
                            headerHeight={38}
                            {...groupGridProps}
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                            onRowDataUpdated={syncGroupSelection}
                            onSelectionChanged={onGroupSelected}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={65} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-700">코드</span>
                            <span className="text-xs text-slate-400">
                                {selectedGroup
                                    ? `${selectedGroup.grpNm} (${selectedGroup.grpCd}) · ${num(rowCount)}건`
                                    : '위에서 그룹을 클릭하면 코드가 조회됩니다'}
                            </span>
                        </div>
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
                                onClick={handleSave}
                                className="btn-primary">
                                <Save size={13} /> 저장
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={gridRef}
                            rowData={rowData}
                            columnDefs={columnDefs}
                            rowHeight={34}
                            headerHeight={38}
                            {...gridProps}
                        />
                    </div>
                </Panel>
            </PanelGroup>
        </div>
    );
}
