import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Hash, ListOrdered, Plus, Save, Trash2, X, Eye } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import { nbrRuleApi, DYNC_KY_TYP_META } from '@/api/nbrRuleApi';
import { RowStatusCell } from '@/components/common/Badge';
import { fmtDe, fmtDtSec } from '@/utils/format';


const DLMT_OPTIONS = ['-', '_', ''];


const Badge = ({ meta, value }) => {
    const m = meta[value];
    if (!m) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${m.badge}`}>
            {m.label}
        </span>
    );
};

export default function NbrRuleMaster() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ ruleCd: '', ruleNm: '' });
    const [rowCount, setRowCount] = useState(0); // 행추가분은 rowData 상태에 없으므로 건수는 그리드 기준으로 센다
    const [saveConfirm, setSaveConfirm] = useState(null); // 저장 확인 모달에 넘길 대상 행들 (null이면 닫힘)
    const [counterModal, setCounterModal] = useState(null); // { ruleCd, rows } — 카운터 보기 모달 (null이면 닫힘)
    const gridRef = useRef(null);

    // 삭제(D) 표시된 행은 편집을 막는다. ag-grid가 셀 에디터의 옵션 라벨을 만들 때
    // valueFormatter를 data 없는 합성 컨텍스트로도 호출하므로(p.data undefined),
    // editable도 같은 방식으로 호출될 가능성에 대비해 옵셔널 체이닝으로 방어한다.
    const notDeleted = (p) => p.data?._status !== 'D';
    // 카운터는 저장된 규칙에만 존재한다 — 아직 저장 전인 신규(C) 행은 조회할 대상이 없다
    const isPersisted = (data) => data._status !== 'C';

    const handleShowCounters = async (ruleCd) => {
        try {
            const rows = await nbrRuleApi.seqs(ruleCd);
            setCounterModal({ ruleCd, rows });
        } catch {
            // 실패 토스트는 axios 인터셉터가 띄운다 (조회는 GET)
        }
    };

    const columnDefs = [
        {
            headerName: 'No.', width: 60, editable: false,
            valueGetter: (p) => p.node.rowIndex + 1,
            cellClass: 'text-slate-400',
        },
        {
            // 규칙코드는 발급 시 이 코드로 규칙을 참조하는 업무 식별자라 수정 불가 — 신규(C) 행에서만 입력받는다
            field: 'ruleCd', headerName: '규칙코드', width: 140,
            editable: (p) => p.data._status === 'C',
            headerTooltip: '발급 호출부가 이 코드로 규칙을 참조하므로 등록 후에는 변경할 수 없습니다',
        },
        { field: 'ruleNm', headerName: '규칙명', width: 160, editable: notDeleted },
        {
            field: 'prfx', headerName: '접두어', width: 110, editable: notDeleted,
            headerTooltip: '채번 앞에 붙는 고정 문자열 (예: IB, PROD)',
        },
        {
            field: 'prfxDlmt', headerName: '접두구분자', width: 100, editable: notDeleted,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: DLMT_OPTIONS },
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            valueFormatter: (p) => (p.value === '' ? '(없음)' : p.value),
            headerTooltip: '접두어 뒤 구분자. 동적키유형이 고정이면 접두어-SEQ 사이 유일한 경계로 쓰입니다',
        },
        {
            field: 'seqDgt', headerName: '자릿수', width: 90, editable: notDeleted,
            cellEditor: 'agNumberCellEditor',
            cellEditorParams: { min: 1, max: 9, precision: 0 },
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            headerTooltip: 'SEQ 자릿수(zero-pad 폭), 1~9',
        },
        {
            // 동적키유형이 고정이면 날짜 조각 자체가 없어 이 구분자가 쓰이지 않는다
            field: 'deDlmt', headerName: '날짜구분자', width: 100,
            editable: (p) => notDeleted(p) && p.data?.dyncKyTyp !== 'NONE',
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: DLMT_OPTIONS },
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            valueFormatter: (p) => (p.data?.dyncKyTyp === 'NONE' ? '—' : (p.value === '' ? '(없음)' : p.value)),
            headerTooltip: '날짜 뒤 구분자. 동적키유형이 고정이면 쓰이지 않습니다',
        },
        {
            // 동적키유형은 카운터 분리 기준이라 등록 후 바꾸면 기존 카운터와 정합이 깨진다 — 신규(C) 행에서만 입력받는다
            field: 'dyncKyTyp', headerName: '동적키유형', width: 110,
            editable: (p) => p.data._status === 'C',
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: ['NONE', 'YEAR', 'MONTH', 'DAY'] },
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={DYNC_KY_TYP_META} value={p.value} />,
            headerTooltip: '고정=카운터 전역 공유 / 연도별·월별·일자별=발급 시 넘긴 날짜 기준으로 리셋 단위 분리. 등록 후 변경 불가',
        },
        {
            headerName: '카운터', width: 80, editable: false,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => isPersisted(p.data)
                ? (
                    <button
                        onClick={() => handleShowCounters(p.data.ruleCd)}
                        className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="현재 카운터 보기"
                    >
                        <ListOrdered size={14} />
                    </button>
                )
                : null,
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
        const data = await nbrRuleApi.list(cond);
        setRowData(data);
    };

    // 최초 1회 조회 (이후엔 조회 버튼으로 재조회)
    useEffect(() => {
        let ignore = false;
        nbrRuleApi.list().then(data => { if (!ignore) setRowData(data); });
        return () => { ignore = true; };
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
            add: [{
                ruleCd: '', ruleNm: '', prfx: '', prfxDlmt: '-', deDlmt: '-', seqDgt: 3,
                dyncKyTyp: 'NONE', _status: 'C',
            }],
        });
        const rowIndex = res.add[0].rowIndex;
        api.ensureIndexVisible(rowIndex, 'bottom');
        api.startEditingCell({ rowIndex, colKey: 'ruleCd' });
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

    // ── 미리보기 ────────────────────────────────────────────
    // 선택한 행 1개의 현재 패턴/동적키유형으로 서버 렌더링을 호출한다 (DB 미접근, 오늘 날짜 + seq=1)
    const handlePreview = async () => {
        const selected = gridRef.current.api.getSelectedNodes();
        if (selected.length !== 1) {
            toast('미리보기할 행을 하나만 선택하세요.');
            return;
        }
        const row = selected[0].data;
        if (!String(row.prfx ?? '').trim() || !row.dyncKyTyp) {
            toast.error('접두어와 동적키유형을 먼저 입력하세요.');
            return;
        }
        try {
            const { number } = await nbrRuleApi.preview({
                prfx: row.prfx, prfxDlmt: row.prfxDlmt, deDlmt: row.deDlmt,
                seqDgt: row.seqDgt, dyncKyTyp: row.dyncKyTyp,
            });
            toast.success(`미리보기: ${number}`);
        } catch (e) {
            toast.error(e.message || '패턴이 올바르지 않습니다.');
        }
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
            if (!String(r.ruleCd ?? '').trim()) {
                toast.error('규칙코드는 필수입니다.');
                return;
            }
            if (!String(r.ruleNm ?? '').trim()) {
                toast.error(`규칙명은 필수입니다: ${r.ruleCd}`);
                return;
            }
            if (!String(r.prfx ?? '').trim()) {
                toast.error(`접두어는 필수입니다: ${r.ruleCd}`);
                return;
            }
            if (!DLMT_OPTIONS.includes(r.prfxDlmt)) {
                toast.error(`접두구분자가 올바르지 않습니다: ${r.ruleCd}`);
                return;
            }
            if (!DLMT_OPTIONS.includes(r.deDlmt)) {
                toast.error(`날짜구분자가 올바르지 않습니다: ${r.ruleCd}`);
                return;
            }
            const seqDgt = Number(r.seqDgt);
            if (!Number.isInteger(seqDgt) || seqDgt < 1 || seqDgt > 9) {
                toast.error(`자릿수는 1~9 사이의 정수여야 합니다: ${r.ruleCd}`);
                return;
            }
            if (!['NONE', 'YEAR', 'MONTH', 'DAY'].includes(r.dyncKyTyp)) {
                toast.error(`동적키유형이 올바르지 않습니다: ${r.ruleCd}`);
                return;
            }
        }
        setSaveConfirm(dirty);
    };

    const doSave = async (dirty) => {
        try {
            await nbrRuleApi.saveAll(dirty);
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
                <Hash size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">채번규칙 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    상품·벤더 코드, 입고·출고 번호 등의 공통 채번 규칙
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" onSearch={fetchList}>
                <SearchItem label="규칙코드">
                    <input
                        type="text"
                        value={cond.ruleCd}
                        onChange={(e) => setCond(prev => ({ ...prev, ruleCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="PROD_CD"
                        className="w-full input-base"
                    />
                </SearchItem>
                <SearchItem label="규칙명">
                    <input
                        type="text"
                        value={cond.ruleNm}
                        onChange={(e) => setCond(prev => ({ ...prev, ruleNm: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="규칙명 검색"
                        className="w-full input-base"
                    />
                </SearchItem>
            </SearchBar>

            {/* 그리드 툴바 */}
            <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{rowCount}건</span>
                <div className="flex gap-2">
                    <button
                        onClick={handlePreview}
                        className="btn-ghost">
                        <Eye size={13} /> 미리보기
                    </button>
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
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">저장하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            신규 <b className="text-blue-500">{saveConfirm.filter(r => r._status === 'C').length}</b>건 ·
                            수정 <b className="text-amber-500">{saveConfirm.filter(r => r._status === 'U').length}</b>건 ·
                            삭제 <b className="text-red-500">{saveConfirm.filter(r => r._status === 'D').length}</b>건
                        </p>
                        <p className="text-xs text-slate-400">
                            등록 후에는 규칙코드·동적키유형을 바꿀 수 없습니다.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setSaveConfirm(null)}
                                className="btn-modal-cancel">
                                취소
                            </button>
                            <button
                                onClick={() => { doSave(saveConfirm); setSaveConfirm(null); }}
                                className="btn-modal-primary">
                                저장
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 카운터 보기 모달 — 읽기전용, 확인/취소 없이 닫기만 */}
            {counterModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
                    onClick={() => setCounterModal(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-800">
                                현재 카운터 — <span className="text-indigo-600">{counterModal.ruleCd}</span>
                            </h3>
                            <button
                                onClick={() => setCounterModal(null)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="px-6 py-5 max-h-96 overflow-y-auto">
                            {counterModal.rows.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">아직 발급된 적이 없습니다.</p>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                                            <th className="pb-2 font-medium">동적키</th>
                                            <th className="pb-2 font-medium">현재값</th>
                                            <th className="pb-2 font-medium">최종발급시각</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {counterModal.rows.map((row) => (
                                            <tr key={row.dyncKy} className="border-b border-slate-50 last:border-0">
                                                <td className="py-2 text-slate-700">{row.dyncKy}</td>
                                                <td className="py-2 text-slate-700 font-mono">{row.seq}</td>
                                                <td className="py-2 text-slate-500">{fmtDtSec(row.updatedAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
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
