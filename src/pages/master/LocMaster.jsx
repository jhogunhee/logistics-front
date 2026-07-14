import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AgGridReact } from 'ag-grid-react';
import { MapPin, Plus, Save } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import { locApi, LOC_TYPE_META } from '@/api/locApi';
import { TEMP_ZONE_META } from '@/api/skuApi';

const ZONE_OPTIONS = [
    { value: '', label: '전체' },
    { value: 'RCV-STAGE', label: 'RCV-STAGE (입고 스테이징)' },
    { value: 'DRY', label: 'DRY (상온존)' },
    { value: 'CHL', label: 'CHL (냉장존)' },
    { value: 'FRZ', label: 'FRZ (냉동존)' },
];

const LOC_TYPE_OPTIONS = [
    { value: '', label: '전체' },
    { value: 'STAGE', label: '스테이징' },
    { value: 'STORAGE', label: '보관' },
];

const TempZoneBadge = ({ value }) => {
    const meta = TEMP_ZONE_META[value];
    if (!meta) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${meta.badge}`}>
            {meta.label} {value}
        </span>
    );
};

const LocTypeBadge = ({ value }) => {
    const meta = LOC_TYPE_META[value];
    if (!meta) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${meta.badge}`}>
            {meta.label}
        </span>
    );
};

export default function LocMaster() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ locCd: '', zoneCd: '', locType: '' });
    const gridRef = useRef(null);

    const fetchList = useCallback(async () => {
        const data = await locApi.list(cond);
        setRowData(data);
    }, [cond]);

    // 최초 1회 조회 (이후엔 조회 버튼으로 재조회)
    useEffect(() => {
        let ignore = false;
        locApi.list().then(data => { if (!ignore) setRowData(data); });
        return () => { ignore = true; };
    }, []);

    // 셀 수정 시 행 상태를 U(수정)로 표시 (신규 C는 유지)
    const onCellValueChanged = useCallback((params) => {
        if (params.data._status !== 'C') {
            params.node.setDataValue('_status', 'U');
        }
    }, []);

    const columnDefs = useMemo(() => [
        { field: 'locCd', headerName: '로케이션 코드', width: 170, editable: (p) => p.data._status === 'C' },
        {
            field: 'zoneCd', headerName: '존', width: 140, editable: true,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: ['RCV-STAGE', 'DRY', 'CHL', 'FRZ'] },
        },
        {
            field: 'tempZone', headerName: '온도대', width: 130, editable: true,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: ['DRY', 'CHL', 'FRZ'] },
            cellRenderer: (p) => <TempZoneBadge value={p.value} />,
        },
        {
            field: 'locType', headerName: '유형', width: 120, editable: true,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: ['STAGE', 'STORAGE'] },
            cellRenderer: (p) => <LocTypeBadge value={p.value} />,
        },
        {
            field: 'pickPrty', headerName: '피킹 우선순위', width: 130, editable: true,
            cellClass: 'ag-right-aligned-cell',
            headerTooltip: 'FEFO 동순위(같은 유통기한) 간 할당 순서. 낮을수록 먼저',
        },
        { field: '', headerName: '', flex: 1, sortable: false, filter: false },
        {
            field: '_status', headerName: '상태', width: 70,
            cellRenderer: (p) => p.value
                ? <span className={`text-[11px] font-bold ${p.value === 'C' ? 'text-blue-500' : 'text-amber-500'}`}>
                    {p.value === 'C' ? '신규' : '수정'}
                  </span>
                : null,
        },
    ], []);

    // ── 행 추가 ──────────────────────────────────────────────
    const handleAddRow = () => {
        flushSync(() => {
            setRowData(prev => [
                ...prev,
                { locCd: '', zoneCd: 'DRY', tempZone: 'DRY', locType: 'STORAGE', pickPrty: 0, _status: 'C' },
            ]);
        });
        const api = gridRef.current?.api;
        if (api) {
            const lastIndex = api.getDisplayedRowCount() - 1;
            api.ensureIndexVisible(lastIndex, 'bottom');
            api.startEditingCell({ rowIndex: lastIndex, colKey: 'locCd' });
        }
    };

    // ── 저장 ────────────────────────────────────────────────
    const handleSave = async () => {
        const dirty = rowData.filter(r => r._status);
        if (dirty.length === 0) {
            toast('변경된 내용이 없습니다.');
            return;
        }
        for (const r of dirty) {
            if (!r.locCd.trim()) {
                toast.error('로케이션 코드는 필수입니다.');
                return;
            }
            if (r.locType === 'STORAGE' && r.zoneCd !== r.tempZone) {
                toast.error(`보관 로케이션은 존과 온도대가 일치해야 합니다: ${r.locCd}`);
                return;
            }
        }
        try {
            await locApi.saveAll(dirty);
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
                <MapPin size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">로케이션 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">로케이션 마스터 · 스테이징/보관존</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" onSearch={fetchList}>
                <SearchItem label="로케이션">
                    <input
                        type="text"
                        value={cond.locCd}
                        onChange={(e) => setCond(prev => ({ ...prev, locCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="DRY-A-01-01"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="존">
                    <DropdownSelect
                        value={cond.zoneCd}
                        onChange={(v) => setCond(prev => ({ ...prev, zoneCd: v }))}
                        options={ZONE_OPTIONS}
                        placeholder="전체"
                    />
                </SearchItem>
                <SearchItem label="유형">
                    <DropdownSelect
                        value={cond.locType}
                        onChange={(v) => setCond(prev => ({ ...prev, locType: v }))}
                        options={LOC_TYPE_OPTIONS}
                        placeholder="전체"
                    />
                </SearchItem>
            </SearchBar>

            {/* 그리드 툴바 */}
            <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{rowData.length}건</span>
                <div className="flex gap-2">
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

            {/* 그리드 */}
            <div className="w-full" style={{ height: 480 }}>
                <AgGridReact
                    ref={gridRef}
                    rowData={rowData}
                    columnDefs={columnDefs}
                    stopEditingWhenCellsLoseFocus={true}
                    onCellValueChanged={onCellValueChanged}
                />
            </div>
        </div>
    );
}
