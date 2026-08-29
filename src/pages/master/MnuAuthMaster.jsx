import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ChevronDown, ChevronRight, Eye, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

import { mnuApi } from '@/api/mnuApi';
import { ROLE_LABELS } from '@/auth/roles';
import { num } from '@/utils/format';
import ConfirmModal from '@/components/common/ConfirmModal';

/** ADMR은 열이 없다 — 항상 전 메뉴를 보므로 매핑 대상이 아니고 DB CHECK도 막는다 */
const ROLE_CODES = ['CENT_ADMR', 'ODR_PIC', 'IB_PIC', 'INV_PIC', 'OUTB_PIC', 'INQ'];
const DVSNS = [{ value: 'WEB', label: '데스크톱' }, { value: 'PDA', label: '현장 단말' }];

/** 그룹 행의 세 상태 — 전부 켬 / 일부만 켬 / 전부 끔 */
const groupState = (items, code) => {
    if (items.every(i => i[code])) return 'all';
    return items.some(i => i[code]) ? 'some' : 'none';
};

/** 일부만 켜진 상태는 checked로 표현할 수 없어 DOM 속성(indeterminate)으로 준다 */
function TriCheck({ state }) {
    const ref = useRef(null);
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = state === 'some';
    }, [state]);
    return (
        <input ref={ref} type="checkbox" checked={state === 'all'} readOnly
               className="pointer-events-none accent-indigo-600" />
    );
}

/** 그룹 행은 접기 화살표와 건수를, 메뉴 행은 한 단 들여쓴 이름을 그린다 */
function LabelCell({ data }) {
    if (!data._group) {
        return (
            <span className="pl-6 text-slate-700">
                {data.mnuNm}
                {/* 메뉴 관리 화면과 같은 줄을 가리키는지 코드로 확인할 수 있게 같이 보여준다 */}
                <span className="ml-1.5 text-xs text-slate-400 font-mono">({data.mnuCd})</span>
            </span>
        );
    }
    const Chevron = data._collapsed ? ChevronRight : ChevronDown;
    return (
        <span className="flex items-center gap-1 font-bold text-slate-700">
            <Chevron size={14} className="text-slate-400" />
            {data.grpNm}
            <span className="text-xs font-medium text-slate-400 tabular-nums">{data.count}</span>
        </span>
    );
}

/**
 * 켜져 있지만 저장은 못 하는 칸에 눈 아이콘을 붙인다 — 막지 않고 무엇을 준 것인지만 알린다.
 * 조회 목적으로 화면을 열어두는 것은 정상적인 설정이다(판정은 서버의 SecurityRules가 한다).
 */
function RoleCell({ data, colDef }) {
    const code = colDef.field;
    if (data._group) {
        return (
            <span className="flex items-center h-full">
                <TriCheck state={data[code]} />
            </span>
        );
    }
    const readOnly = data[code] && data.readOnlyRoles?.includes(code);
    return (
        <span className="flex items-center gap-1 h-full">
            <input type="checkbox" checked={!!data[code]} readOnly
                   className="pointer-events-none accent-indigo-600" />
            {readOnly && (
                <span title="열리지만 저장은 안 됩니다 (업무 구역 상한)" className="flex">
                    <Eye size={13} className="text-amber-500" />
                </span>
            )}
        </span>
    );
}

/**
 * 권한별 메뉴 관리 — 행이 메뉴, 열이 역할인 체크박스 격자.
 *
 * 그룹 행을 사이에 끼워 그룹 단위로 접고 한 번에 켜고 끈다. 실제 트리(Tree Data)가 아니라
 * 평평한 행에 그룹 행을 섞은 것인데, 깊이가 2단뿐이고 <b>AG Grid Community에는 행 그룹핑이
 * 없어서다</b>. 저장 payload는 메뉴 행만 추리므로 그룹 행이 있어도 형태가 같다.
 *
 * 저장은 그 구분(WEB/PDA)의 매핑을 <b>통째로 교체</b>한다 — 지금 화면 상태가 그대로 DB가
 * 되므로 두 번 눌러도 결과가 같다. C/U/D 행 상태가 없어 useMasterGrid를 쓰지 않는다.
 */
export default function MnuAuthMaster() {
    const gridRef = useRef(null);
    const [dvsn, setDvsn] = useState('WEB');
    const [rows, setRows] = useState([]);
    const [collapsed, setCollapsed] = useState(() => new Set());
    const [dirty, setDirty] = useState(false);
    const [saveConfirm, setSaveConfirm] = useState(false);

    // 역할 목록을 열별 boolean으로 편다 — 격자로 보려면 이 모양이어야 한다
    const applyRows = useCallback((data) => {
        setRows(data.map(r => ({
            ...r,
            ...Object.fromEntries(ROLE_CODES.map(c => [c, r.roles.includes(c)])),
        })));
        setDirty(false);
    }, []);

    const load = useCallback(() => mnuApi.roleGrid(dvsn).then(applyRows), [dvsn, applyRows]);

    useEffect(() => {
        let alive = true;
        mnuApi.roleGrid(dvsn).then(data => { if (alive) applyRows(data); });
        return () => { alive = false; };   // 탭을 빠르게 오갈 때 늦게 온 응답이 덮지 않게
    }, [dvsn, applyRows]);

    // 그룹 행을 끼운 표시용 행. 그룹 사이 순서는 사이드바와 같게 각 그룹의 최소 srtSeq 순이다
    const displayRows = useMemo(() => {
        const byGroup = new Map();
        rows.forEach(r => {
            if (!byGroup.has(r.grpNm)) byGroup.set(r.grpNm, []);
            byGroup.get(r.grpNm).push(r);
        });
        const minSeq = (items) => Math.min(...items.map(i => i.srtSeq));
        const out = [];
        [...byGroup.entries()]
            .sort((a, b) => minSeq(a[1]) - minSeq(b[1]))
            .forEach(([grpNm, items]) => {
                const sorted = [...items].sort((a, b) => a.srtSeq - b.srtSeq);
                out.push({
                    _group: true, _collapsed: collapsed.has(grpNm), grpNm, count: sorted.length,
                    ...Object.fromEntries(ROLE_CODES.map(c => [c, groupState(sorted, c)])),
                });
                if (!collapsed.has(grpNm)) out.push(...sorted);
            });
        return out;
    }, [rows, collapsed]);

    const toggleOne = useCallback((mnuCd, code) => {
        setRows(prev => prev.map(r => (r.mnuCd === mnuCd ? { ...r, [code]: !r[code] } : r)));
        setDirty(true);
    }, []);

    /** 그 그룹의 그 역할을 한 번에 — 하나라도 꺼져 있으면 전부 켜고, 다 켜져 있으면 전부 끈다 */
    const toggleGroupRole = useCallback((grpNm, code) => {
        setRows(prev => {
            const next = !prev.filter(r => r.grpNm === grpNm).every(r => r[code]);
            return prev.map(r => (r.grpNm === grpNm ? { ...r, [code]: next } : r));
        });
        setDirty(true);
    }, []);

    /** 역할 머리글 — 그 열 전체 */
    const toggleColumn = useCallback((code) => {
        setRows(prev => {
            const next = !prev.every(r => r[code]);
            return prev.map(r => ({ ...r, [code]: next }));
        });
        setDirty(true);
    }, []);

    const toggleCollapse = useCallback((grpNm) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            if (next.has(grpNm)) next.delete(grpNm); else next.add(grpNm);
            return next;
        });
    }, []);

    // 하나라도 펼쳐져 있으면 「모두 접기」다 — 접힌 그룹만 있는 상태에서만 펼치기로 바뀐다
    const allCollapsed = rows.length > 0 && displayRows.every(r => r._group);
    const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(rows.map(r => r.grpNm)));

    const columnDefs = useMemo(() => [
        {
            colId: 'label', headerName: '그룹 / 메뉴', width: 330, editable: false,
            cellRenderer: LabelCell,
            cellClass: (p) => (p.data._group ? 'cursor-pointer' : ''),
            onCellClicked: (p) => { if (p.data._group) toggleCollapse(p.data.grpNm); },
        },
        {
            // 열 이름이 역할 이름이라는 것을 머리 위에서 밝힌다 — 「조회」가 조회 권한으로 읽히지 않게
            headerName: '역할 — 체크하면 그 역할의 메뉴에 뜬다',
            headerClass: 'text-slate-500',
            children: ROLE_CODES.map(code => ({
                field: code,
                headerName: ROLE_LABELS[code],
                width: 118,
                editable: false,
                headerTooltip: `머리글을 누르면 ${ROLE_LABELS[code]} 열 전체가 켜지고 꺼집니다`,
                cellRenderer: RoleCell,
                cellClass: 'cursor-pointer',
                onCellClicked: (p) => (p.data._group
                    ? toggleGroupRole(p.data.grpNm, code)
                    : toggleOne(p.data.mnuCd, code)),
            })),
        },
    ], [toggleCollapse, toggleGroupRole, toggleOne]);

    const save = async () => {
        try {
            await mnuApi.replaceRoles(dvsn, rows.map(r => ({
                mnuCd: r.mnuCd,
                roles: ROLE_CODES.filter(c => r[c]),
            })));
            toast.success('저장했습니다. 사용자 화면은 다음 새로고침부터 바뀝니다.');
            load();
        } catch (e) {
            toast.error(e.message || '저장에 실패했습니다.');
        }
    };

    const switchDvsn = (value) => {
        if (value === dvsn) return;
        if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 버리고 이동할까요?')) return;
        setDvsn(value);
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">권한별 메뉴 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    역할이 어느 화면을 여는지 정합니다 — 저장 즉시 반영됩니다
                </span>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {DVSNS.map(d => (
                        <button
                            key={d.value}
                            type="button"
                            onClick={() => switchDvsn(d.value)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                                dvsn === d.value
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                        >
                            {d.label}
                        </button>
                    ))}
                    <span className="text-xs text-slate-500 font-medium ml-1">{num(rows.length)}건</span>
                    {dirty && <span className="text-xs font-bold text-amber-600">· 저장 안 됨</span>}
                </div>
                <div className="flex gap-2">
                    <button onClick={toggleAll} className="btn-ghost">
                        {allCollapsed ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        {allCollapsed ? '모두 펼치기' : '모두 접기'}
                    </button>
                    <button onClick={load} className="btn-ghost">
                        <RotateCcw size={13} /> 되돌리기
                    </button>
                    <button onClick={() => setSaveConfirm(true)} className="btn-primary">
                        <Save size={13} /> 저장
                    </button>
                </div>
            </div>

            {saveConfirm && (
                <ConfirmModal
                    title="저장하시겠습니까?"
                    confirmText="저장"
                    onCancel={() => setSaveConfirm(false)}
                    onConfirm={() => { save(); setSaveConfirm(false); }}
                >
                    <p className="text-sm text-slate-600">
                        {DVSNS.find(d => d.value === dvsn)?.label} 메뉴의 권한을 <b>지금 화면 상태로 통째로 교체</b>합니다.
                        체크를 푼 화면은 그 역할에게서 사라지고, 그 화면의 저장 API도 막힙니다.
                    </p>
                </ConfirmModal>
            )}

            <div className="w-full flex-1 min-h-0">
                <AgGridReact
                    ref={gridRef}
                    rowData={displayRows}
                    columnDefs={columnDefs}
                    getRowId={(p) => (p.data._group ? `g:${p.data.grpNm}` : p.data.mnuCd)}
                    rowClassRules={{ 'bg-slate-50': (p) => p.data._group }}
                    onColumnHeaderClicked={(p) => {
                        const code = p.column.getColId();
                        if (ROLE_CODES.includes(code)) toggleColumn(code);
                    }}
                />
            </div>

            {/* 범례 — 눈 아이콘의 뜻과 ADMR 열이 없는 이유는 화면 안에서 답이 나와야 한다 */}
            <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500 flex flex-wrap items-center gap-x-6 gap-y-1">
                <span className="flex items-center gap-1.5">
                    <input type="checkbox" checked readOnly className="pointer-events-none accent-indigo-600" />
                    저장까지 됨
                </span>
                <span className="flex items-center gap-1.5">
                    <input type="checkbox" checked readOnly className="pointer-events-none accent-indigo-600" />
                    <Eye size={13} className="text-amber-500" />
                    열리지만 저장은 안 됨 (업무 구역 상한)
                </span>
                <span>그룹 행 체크는 그 그룹 전체를, 역할 머리글은 그 열 전체를 켜고 끕니다.</span>
                <span>시스템관리자는 항상 모든 메뉴를 봅니다 — 그래서 열이 없습니다.</span>
            </div>
        </div>
    );
}
