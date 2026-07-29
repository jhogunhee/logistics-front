import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ListTree, Plus, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import { codeApi } from '@/api/codeApi';

// ISO 일시("2026-07-16T14:03:21...") → "2026-07-16"
const formatDate = (v) => (v ? v.replace('T', ' ').slice(0, 11) : '');

export default function CodeMaster() {
    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null); // 상단에서 고른 그룹 (null이면 하단이 비어 있다)
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ codeCd: '', codeNm: '' });
    const [rowCount, setRowCount] = useState(0); // 행추가분은 rowData 상태에 없으므로 건수는 그리드 기준으로 센다
    const [saveConfirm, setSaveConfirm] = useState(null); // 저장 확인 모달에 넘길 대상 행들 (null이면 닫힘)
    const groupGridRef = useRef(null);
    const gridRef = useRef(null);

    // 삭제(D) 표시된 행은 편집을 막는다
    const notDeleted = (p) => p.data._status !== 'D';
    // 코드 값은 (grp_cd, code_cd) PK의 일부라 등록 후 변경 불가 — 신규(C) 행에서만 입력받는다
    const isNew = (p) => p.data._status === 'C';

    const STATUS_META = {
        C: { label: '신규', cls: 'text-blue-500' },
        U: { label: '수정', cls: 'text-amber-500' },
        D: { label: '삭제', cls: 'text-red-500' },
    };

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
            field: 'description', headerName: '설명', flex: 1, minWidth: 200, editable: notDeleted,
            cellRenderer: (p) => p.value || <span className="text-slate-300">-</span>,
        },
        {
            field: '_status', headerName: '상태', width: 70,
            cellRenderer: (p) => {
                const meta = STATUS_META[p.value];
                return meta
                    ? <span className={`text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>
                    : null;
            },
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
            headerTooltip: '로직이 리터럴로 참조하는 값입니다. 등록 후에는 변경할 수 없습니다',
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
            cellRenderer: (p) => {
                const meta = STATUS_META[p.value];
                return meta
                    ? <span className={`text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>
                    : null;
            },
        },
        { field: 'createdBy', headerName: '등록자', width: 90, editable: false },
        {
            field: 'createdAt', headerName: '등록일자', width: 110, editable: false,
            valueFormatter: (p) => formatDate(p.value),
        },
        { field: 'updatedBy', headerName: '수정자', width: 90, editable: false },
        {
            field: 'updatedAt', headerName: '수정일자', width: 110, editable: false,
            valueFormatter: (p) => formatDate(p.value),
        },
    ];

    const fetchCodes = async (grpCd = selectedGroup?.grpCd, searchCond = cond) => {
        if (!grpCd) { setRowData([]); return; }
        setRowData(await codeApi.search(grpCd, searchCond));
    };

    // 그룹 목록을 받고 첫 그룹을 바로 연다 — 빈 화면으로 시작하지 않게 한다
    useEffect(() => {
        let ignore = false;
        codeApi.groups().then(list => {
            if (ignore) return;
            setGroups(list);
        });
        return () => { ignore = true; };
    }, []);

    // 그룹 데이터가 처음 그려질 때 첫 행을 골라 둔다 (선택 이벤트가 하단 조회까지 이어진다).
    // groups 상태가 아니라 그리드가 실제로 들고 있는 행 수를 보는 이유는, 이 핸들러가
    // 데이터 도착 전에도 불릴 수 있어 닫힌 값(빈 배열)을 보게 되기 때문이다.
    const selectFirstGroup = (p) => {
        if (p.api.getDisplayedRowCount() > 0 && p.api.getSelectedRows().length === 0) {
            p.api.getDisplayedRowAtIndex(0)?.setSelected(true);
        }
    };

    /**
     * 코드 조회는 선택 이벤트가 아니라 selectedGroup 변화에 매단다.
     * 이벤트에 매달면 최초 자동 선택처럼 그리드 내부에서 발생한 선택에서 조회가 누락된다
     * (실제로 그랬다 — selectedGroup은 잡혔는데 /search 요청이 안 나갔다).
     * 상태를 기준으로 삼으면 사용자가 클릭하든 코드가 고르든 같은 경로를 탄다.
     */
    useEffect(() => {
        // 아직 저장 전인 신규 그룹(_status 'C')은 서버에 없으므로 조회하지 않는다
        if (!selectedGroup || selectedGroup._status === 'C') return;
        let ignore = false;
        codeApi.search(selectedGroup.grpCd, { codeCd: '', codeNm: '' })
            .then(d => { if (!ignore) setRowData(d); })
            .catch(e => {
                // 실패를 삼키면 앞 그룹의 코드가 그대로 남아 "한 칸 밀린" 화면이 된다 —
                // 고른 그룹과 보이는 코드가 어긋나는 것이 빈 그리드보다 위험하다.
                if (ignore) return;
                setRowData([]);
                toast.error(e.message || '코드를 불러오지 못했습니다.');
            });
        return () => { ignore = true; };
    }, [selectedGroup]);

    /**
     * 그룹 전환. 저장하지 않은 코드 변경이 있으면 되묻는다 —
     * 저장이 그룹 단위(/master/codes/{grpCd}/bulk)로 나가므로 다른 그룹의 편집분이 섞이면 안 된다.
     */
    const onGroupSelected = (p) => {
        const next = p.api.getSelectedRows()[0] ?? null;
        if (!next || next.grpCd === selectedGroup?.grpCd) return;

        const dirty = [];
        gridRef.current?.api.forEachNode(n => { if (n.data._status) dirty.push(n.data); });
        if (dirty.length > 0 && !window.confirm('저장하지 않은 코드 변경이 있습니다. 그룹을 바꾸면 사라집니다.')) {
            // 되돌린다 — 선택 이벤트가 다시 돌지만 grpCd가 같아 위에서 걸러진다
            p.api.forEachNode(n => n.setSelected(n.data.grpCd === selectedGroup?.grpCd));
            return;
        }
        setCond({ codeCd: '', codeNm: '' });
        // 아직 저장 전인 신규 그룹은 서버에 없어 조회를 건너뛴다 — 그때 앞 그룹의 코드를
        // 남겨두면 "그룹은 신규인데 코드는 남의 것"인 화면이 된다. 여기서 비운다.
        if (next._status === 'C') setRowData([]);
        setSelectedGroup(next);   // 조회는 위 useEffect가 이어받는다
    };

    // ── 그룹 편집 ────────────────────────────────────────────
    // 저장 대상이 코드가 아니라 그룹이라 저장 버튼도 패널마다 따로 둔다.
    const handleAddGroup = () => {
        const api = groupGridRef.current.api;
        const res = api.applyTransaction({ add: [{ grpCd: '', grpNm: '', description: '', _status: 'C' }] });
        const rowIndex = res.add[0].rowIndex;
        api.ensureIndexVisible(rowIndex, 'bottom');
        api.startEditingCell({ rowIndex, colKey: 'grpCd' });
    };

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
        const rows = [];
        groupGridRef.current.api.forEachNode(n => rows.push(n.data));
        const dirty = rows.filter(r => r._status);
        if (dirty.length === 0) { toast('변경된 그룹이 없습니다.'); return; }
        for (const r of dirty.filter(r => r._status !== 'D')) {
            if (!String(r.grpCd ?? '').trim()) { toast.error('그룹코드는 필수입니다.'); return; }
            if (!String(r.grpNm ?? '').trim()) { toast.error(`그룹명은 필수입니다: ${r.grpCd}`); return; }
        }
        try {
            await codeApi.saveGroups(dirty);
            toast.success(`그룹 ${dirty.length}건 저장했습니다.`);
            setGroups(await codeApi.groups());
        } catch (e) {
            toast.error(e.message || '그룹 저장에 실패했습니다.');
        }
    };

    // 셀 수정 시 행 상태를 U(수정)로 표시 (신규 C는 유지)
    const onCellValueChanged = (params) => {
        if (params.column.getColId() === '_status') return;
        if (params.data._status !== 'C') {
            params.node.setDataValue('_status', 'U');
        }
    };

    // ── 행 추가 ──────────────────────────────────────────────
    // 정렬순서 기본값은 현재 최댓값 + 1 — 새 코드는 콤보박스 맨 뒤에 붙는 게 자연스럽다
    const handleAddRow = () => {
        if (!selectedGroup) { toast('위에서 그룹을 먼저 고르세요.'); return; }
        const api = gridRef.current.api;
        let maxSeq = 0;
        api.forEachNode(node => { maxSeq = Math.max(maxSeq, node.data.srtSeq ?? 0); });

        const res = api.applyTransaction({
            add: [{ codeCd: '', codeNm: '', srtSeq: maxSeq + 1, ref1: '', ref2: '', ref3: '', _status: 'C' }],
        });
        const rowIndex = res.add[0].rowIndex;
        api.ensureIndexVisible(rowIndex, 'bottom');
        api.startEditingCell({ rowIndex, colKey: 'codeCd' });
    };

    // ── 삭제 ────────────────────────────────────────────────
    // 신규(C) 행은 그리드에서 바로 제거, 기존 행은 D로 표시해 저장 시 반영한다 (재조회하면 원복).
    // 실제 차단은 서버가 한다 — UOM 그룹은 그 단위를 쓰는 상품이 있으면 거부한다.
    const handleDeleteRows = () => {
        const api = gridRef.current.api;
        const selected = api.getSelectedNodes();
        if (selected.length === 0) {
            toast('삭제할 행을 선택하세요.');
            return;
        }
        const newRows = selected.filter(n => n.data._status === 'C').map(n => n.data);
        if (newRows.length > 0) api.applyTransaction({ remove: newRows });
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
        const editable = dirty.filter(r => r._status !== 'D');
        for (const r of editable) {
            if (!String(r.codeCd ?? '').trim()) {
                toast.error('코드는 필수입니다.');
                return;
            }
            if (!String(r.codeNm ?? '').trim()) {
                toast.error(`코드명은 필수입니다: ${r.codeCd}`);
                return;
            }
            if (r.srtSeq === null || r.srtSeq === undefined || r.srtSeq === '') {
                toast.error(`정렬순서는 필수입니다: ${r.codeCd}`);
                return;
            }
        }
        // 신규 행끼리의 코드 중복은 서버가 건건이 INSERT하며 잡기 전에 여기서 먼저 막는다
        const newCds = editable.filter(r => r._status === 'C').map(r => r.codeCd);
        const dup = newCds.find((cd, i) => newCds.indexOf(cd) !== i);
        if (dup) {
            toast.error(`코드가 중복됩니다: ${dup}`);
            return;
        }
        setSaveConfirm(dirty);
    };

    const doSave = async (dirty) => {
        try {
            await codeApi.saveAll(selectedGroup.grpCd, dirty);
            toast.success(`${dirty.length}건 저장했습니다.`);
            fetchCodes();
        } catch (e) {
            toast.error(e.message || '저장에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <ListTree size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">공통코드 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    그룹과 그 안의 코드를 편집합니다 — 저장은 위·아래 패널이 각각 따로입니다
                </span>
            </div>

            {/* 검색 조건은 하단(코드)에만 걸린다 — 그룹은 5건 남짓이라 검색할 대상이 아니다 */}
            <SearchBar label="코드 검색" onSearch={() => fetchCodes()}>
                <SearchItem label="코드">
                    <input
                        type="text"
                        value={cond.codeCd}
                        onChange={(e) => setCond(prev => ({ ...prev, codeCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchCodes()}
                        placeholder="DRY"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="코드명">
                    <input
                        type="text"
                        value={cond.codeNm}
                        onChange={(e) => setCond(prev => ({ ...prev, codeNm: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchCodes()}
                        placeholder="상온"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
            </SearchBar>

            {/* 저장 확인 모달 */}
            {saveConfirm && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">저장하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            <b>{selectedGroup?.grpNm}</b> · 신규 <b className="text-blue-500">{saveConfirm.filter(r => r._status === 'C').length}</b>건 ·
                            수정 <b className="text-amber-500">{saveConfirm.filter(r => r._status === 'U').length}</b>건 ·
                            삭제 <b className="text-red-500">{saveConfirm.filter(r => r._status === 'D').length}</b>건
                        </p>
                        <p className="text-xs text-slate-400">
                            코드 값은 로직이 리터럴로 참조합니다. 이미 쓰이는 코드를 지우면 그 값을 가진 기존 데이터가 화면에서 빈 칸으로 보입니다.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setSaveConfirm(null)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                취소
                            </button>
                            <button
                                onClick={() => { doSave(saveConfirm); setSaveConfirm(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                                저장
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 상하 분할 + 드래그 스플리터 (비율은 localStorage에 기억됨) */}
            <PanelGroup direction="vertical" autoSaveId="master-code-split-v1" className="flex-1 min-h-0">
                <Panel defaultSize={35} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-700">코드 그룹</span>
                            <span className="text-xs text-slate-400">
                                {groups.length}건 · 그룹코드는 등록 후 변경할 수 없습니다
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleDeleteGroup}
                                title="코드가 남아 있는 그룹은 서버가 삭제를 거부합니다"
                                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-red-300 hover:text-red-600 transition-colors">
                                <Trash2 size={13} /> 삭제
                            </button>
                            <button
                                onClick={handleAddGroup}
                                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                                <Plus size={13} /> 행추가
                            </button>
                            <button
                                onClick={handleSaveGroups}
                                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700 transition-colors">
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
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                            rowClassRules={{
                                'line-through': (p) => p.data._status === 'D',
                                'opacity-40': (p) => p.data._status === 'D',
                            }}
                            stopEditingWhenCellsLoseFocus={true}
                            onCellValueChanged={onCellValueChanged}
                            onFirstDataRendered={selectFirstGroup}
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
                                    ? `${selectedGroup.grpNm} (${selectedGroup.grpCd}) · ${rowCount}건`
                                    : '위에서 그룹을 선택하세요'}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleDeleteRows}
                                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-red-300 hover:text-red-600 transition-colors">
                                <Trash2 size={13} /> 삭제
                            </button>
                            <button
                                onClick={handleAddRow}
                                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                                <Plus size={13} /> 행추가
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700 transition-colors">
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
                </Panel>
            </PanelGroup>
        </div>
    );
}
