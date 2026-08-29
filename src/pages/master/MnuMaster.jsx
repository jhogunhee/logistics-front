import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AlertTriangle, ListTree, Plus, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { mnuApi } from '@/api/mnuApi';
import { ROUTE_PATHS } from '@/routes';
import { MENU_ICONS } from '@/layout/menuIcons';
import { useMasterGrid } from '@/hooks/useMasterGrid';
import { fmtDe, num } from '@/utils/format';
import SearchBar, { SearchSelect, SearchText } from '@/components/common/SearchBar';
import SelectCellEditor from '@/components/common/SelectCellEditor';
import { RowStatusCell } from '@/components/common/Badge';
import ConfirmModal from '@/components/common/ConfirmModal';
import SaveCountSummary from '@/components/common/SaveCountSummary';

const DVSN_OPTIONS = [{ value: 'WEB', label: '데스크톱' }, { value: 'PDA', label: '현장 단말' }];
const DVSN_LABELS = { WEB: '데스크톱', PDA: '현장 단말' };
const ICON_NAMES = Object.keys(MENU_ICONS);

/**
 * 메뉴 관리 — 사이드바와 PDA 홈이 이 표를 그대로 그린다.
 *
 * 화면 경로와 아이콘은 직접 입력받지 않고 드롭다운으로 고르게 한다. 경로는 라우트로 등록된
 * 것이어야 죽은 링크가 안 생기고, 아이콘은 menuIcons.js의 이름표에 있어야 그려진다 —
 * 둘 다 실체가 프론트에만 있어서 서버가 검증해 줄 수 없다.
 */
export default function MnuMaster() {
    const {
        gridRef, rowCount, saveConfirm, setSaveConfirm,
        gridProps, addRow, deleteSelectedRows, requestSave,
    } = useMasterGrid();
    const [cond, setCond] = useState({ keyword: '', dvsn: '' });
    const [menus, setMenus] = useState([]);
    const [uncovered, setUncovered] = useState([]);

    const notDeleted = (p) => p.data._status !== 'D';
    // 메뉴 코드는 권한 행(mnu_role)이 참조하는 식별자라 신규 행에서만 받는다
    const newRowOnly = (p) => p.data._status === 'C';

    const columnDefs = [
        {
            headerName: 'No.', width: 60, editable: false,
            valueGetter: (p) => p.node.rowIndex + 1,
            cellClass: 'text-slate-400',
        },
        {
            field: 'mnuCd', headerName: '메뉴 코드', width: 190,
            headerClass: 'header-required', editable: newRowOnly,
        },
        {
            field: 'mnuNm', headerName: '메뉴명', width: 170,
            headerClass: 'header-required', editable: notDeleted,
        },
        {
            field: 'dvsn', headerName: '구분', width: 140,
            headerClass: 'header-required', editable: notDeleted,
            cellEditor: SelectCellEditor,
            cellEditorParams: { values: ['WEB', 'PDA'], labelMap: DVSN_LABELS },
            valueFormatter: (p) => (p.value ? `${p.value} ${DVSN_LABELS[p.value] ?? ''}`.trim() : ''),
        },
        {
            field: 'grpNm', headerName: '그룹', width: 110,
            headerClass: 'header-required', editable: notDeleted,
            // 그룹의 첫 줄만 진하게 — 값은 계속 보여준다(편집하는 칸이라 비우면 무엇을 고치는지 모른다)
            cellClass: (p) => (p.data._groupStart ? 'font-bold text-slate-700' : 'text-slate-400'),
        },
        {
            field: 'srtSeq', headerName: '순서', width: 80,
            headerClass: 'header-required', editable: notDeleted,
            type: 'numericColumn',
            valueParser: (p) => Number(p.newValue),
            headerTooltip: '그룹 안 순서. 그룹 사이 순서도 이 값의 최소치로 정해진다',
        },
        {
            field: 'iconNm', headerName: '아이콘', width: 180,
            headerClass: 'header-required', editable: notDeleted,
            cellEditor: SelectCellEditor,
            cellEditorParams: { values: ICON_NAMES },
        },
        {
            field: 'scrnPth', headerName: '화면 경로', width: 215,
            headerClass: 'header-required', editable: notDeleted,
            cellEditor: SelectCellEditor,
            cellEditorParams: { values: ROUTE_PATHS },
            headerTooltip: '라우트로 등록된 경로만 고를 수 있다',
        },
        {
            field: 'apiPrfx', headerName: 'API 접두', width: 250, editable: notDeleted,
            headerTooltip: '이 화면의 저장 API 앞부분. 비우면 조회 전용 화면이라 메뉴 권한이 관여하지 않는다',
            cellRenderer: (p) => (p.value || <span className="text-slate-400">(조회 전용)</span>),
        },
        { field: 'kywd', headerName: '검색 키워드', flex: 1, minWidth: 200, editable: notDeleted },
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

    // 54건짜리 표라 조회는 한 번만 하고 거르기는 화면에서 한다.
    // 정렬은 권한별 메뉴 관리·사이드바와 같게 「구분 → 그룹(그 그룹의 최소 순서) → 순서」다 —
    // 서버는 그룹명 가나다순으로 주는데 그대로 쓰면 두 화면의 줄 순서가 어긋나 같은 표로 안 보인다
    const filtered = useMemo(() => {
        const kw = cond.keyword.trim().toLowerCase();
        const rows = menus.filter(m => (!cond.dvsn || m.dvsn === cond.dvsn)
            && (!kw || `${m.mnuCd} ${m.mnuNm} ${m.grpNm} ${m.scrnPth} ${m.kywd ?? ''}`
                .toLowerCase().includes(kw)));

        const groupSeq = new Map();   // 구분+그룹 → 그 그룹의 최소 순서
        rows.forEach(m => {
            const key = `${m.dvsn}|${m.grpNm}`;
            groupSeq.set(key, Math.min(groupSeq.get(key) ?? Infinity, m.srtSeq));
        });
        const rank = (m) => (m.dvsn === 'WEB' ? 0 : 1);
        const sorted = [...rows].sort((a, b) => rank(a) - rank(b)
            || groupSeq.get(`${a.dvsn}|${a.grpNm}`) - groupSeq.get(`${b.dvsn}|${b.grpNm}`)
            || a.srtSeq - b.srtSeq);

        // 그룹이 바뀌는 줄에 표시를 남긴다 — 그룹 행을 끼우는 대신 구분선으로 경계를 보인다.
        // 편집 그리드라 파생 행을 섞으면 선택·행추가·정렬과 부딪힌다(권한별 화면은 체크만 해서 괜찮다)
        return sorted.map((m, i, arr) => ({
            ...m,
            _groupStart: i === 0 || arr[i - 1].grpNm !== m.grpNm || arr[i - 1].dvsn !== m.dvsn,
        }));
    }, [menus, cond]);

    const applyList = (data) => {
        setMenus(data.menus);
        setUncovered(data.uncoveredEndpoints);
    };

    const fetchList = () => mnuApi.list().then(applyList);

    useEffect(() => { mnuApi.list().then(applyList); }, []);

    const handleAddRow = () => addRow(
        {
            mnuCd: '', mnuNm: '', dvsn: 'WEB', grpNm: '', srtSeq: 900,
            iconNm: 'Box', scrnPth: '', apiPrfx: '', kywd: '',
        },
        'mnuCd',
    );

    const REQUIRED = {
        mnuCd: '메뉴 코드', mnuNm: '메뉴명', dvsn: '구분',
        grpNm: '그룹', iconNm: '아이콘', scrnPth: '화면 경로',
    };

    const validateRows = (rows) => {
        for (const r of rows) {
            for (const [field, label] of Object.entries(REQUIRED)) {
                if (!String(r[field] ?? '').trim()) {
                    toast.error(`${label}은(는) 필수입니다.`);
                    return false;
                }
            }
            if (!Number.isInteger(Number(r.srtSeq))) {
                toast.error('순서는 정수여야 합니다.');
                return false;
            }
            // 접두를 잘못 적으면 그 화면의 저장이 통째로 막힌다 — 형태만이라도 먼저 거른다
            if (String(r.apiPrfx ?? '').trim() && !String(r.apiPrfx).startsWith('/')) {
                toast.error('API 접두는 /로 시작해야 합니다.');
                return false;
            }
        }
        return true;
    };

    const doSave = async (dirty) => {
        try {
            await mnuApi.saveAll(dirty);
            toast.success(`${dirty.length}건 저장했습니다. 사이드바는 다음 새로고침부터 바뀝니다.`);
            fetchList();
        } catch (e) {
            toast.error(e.message || '저장에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex items-center gap-2">
                <ListTree size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">메뉴 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    사이드바와 PDA 홈이 이 표를 그립니다 — 어느 역할이 보는지는 권한별 메뉴 관리에서 정합니다
                </span>
            </div>

            {uncovered.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm shrink-0">
                    <b className="text-amber-800 flex items-center gap-1.5">
                        <AlertTriangle size={14} /> 주인 없는 저장 API {uncovered.length}건
                    </b>
                    <p className="text-amber-700 mt-1">
                        아래 주소는 어느 메뉴의 API 접두에도 안 걸려 메뉴 권한이 관여하지 못합니다
                        (업무 구역 상한만 남습니다). 메뉴를 추가하거나 API 접두를 고쳐 주세요.
                    </p>
                    <ul className="mt-2 font-mono text-xs text-amber-900 max-h-24 overflow-y-auto">
                        {uncovered.map(p => <li key={p}>{p}</li>)}
                    </ul>
                </div>
            )}

            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchText name="keyword" label="검색어" placeholder="코드 · 메뉴명 · 경로" />
                <SearchSelect name="dvsn" label="구분" options={DVSN_OPTIONS} />
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
                    rowData={filtered}
                    columnDefs={columnDefs}
                    {...gridProps}
                    // 삭제 표시 규칙(gridProps)에 그룹 경계선을 더한다 — 덮어쓰지 않게 펼쳐서 합친다
                    rowClassRules={{
                        ...gridProps.rowClassRules,
                        'border-t-2 border-slate-200': (p) => p.data._groupStart,
                    }}
                />
            </div>
        </div>
    );
}
