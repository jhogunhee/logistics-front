import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AgGridReact } from 'ag-grid-react';
import { Barcode, Plus, Save } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import { skuApi, TEMP_ZONE_META } from '@/api/skuApi';

const TEMP_ZONE_OPTIONS = [
    { value: '', label: '전체' },
    { value: 'DRY', label: '상온 (DRY)' },
    { value: 'CHL', label: '냉장 (CHL)' },
    { value: 'FRZ', label: '냉동 (FRZ)' },
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

export default function SkuMaster() {
    const [rowData, setRowData] = useState([]);
    const [cond, setCond] = useState({ skuCd: '', skuNm: '', tempZone: '' });
    const gridRef = useRef(null);

    const fetchList = useCallback(async () => {
        const data = await skuApi.list(cond);
        setRowData(data);
    }, [cond]);

    // 최초 1회 조회 (이후엔 조회 버튼으로 재조회)
    useEffect(() => {
        let ignore = false;
        skuApi.list().then(data => { if (!ignore) setRowData(data); });
        return () => { ignore = true; };
    }, []);

    // 셀 수정 시 행 상태를 U(수정)로 표시 (신규 C는 유지)
    const onCellValueChanged = useCallback((params) => {
        if (params.data._status !== 'C') {
            params.node.setDataValue('_status', 'U');
        }
    }, []);

    const columnDefs = useMemo(() => [
        { field: 'skuCd', headerName: 'SKU 코드', width: 150, editable: (p) => p.data._status === 'C' },
        { field: 'skuNm', headerName: '상품명', flex: 1, minWidth: 200, editable: true },
        {
            field: 'tempZone', headerName: '온도대', width: 130, editable: true,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: ['DRY', 'CHL', 'FRZ'] },
            cellRenderer: (p) => <TempZoneBadge value={p.value} />,
        },
        {
            field: 'shelfLifeDays', headerName: '유통기한(일)', width: 120, editable: true,
            cellClass: 'ag-right-aligned-cell',
        },
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
                { skuCd: '', skuNm: '', tempZone: 'DRY', shelfLifeDays: 0, _status: 'C' },
            ]);
        });
        const api = gridRef.current?.api;
        if (api) {
            const lastIndex = api.getDisplayedRowCount() - 1;
            api.ensureIndexVisible(lastIndex, 'bottom');
            api.startEditingCell({ rowIndex: lastIndex, colKey: 'skuCd' });
        }
    };

    // ── 저장 ────────────────────────────────────────────────
    const handleSave = async () => {
        const dirty = rowData.filter(r => r._status);
        if (dirty.length === 0) {
            toast('변경된 내용이 없습니다.');
            return;
        }
        // 검증
        for (const r of dirty) {
            if (!r.skuCd.trim() || !r.skuNm.trim()) {
                toast.error('SKU 코드와 상품명은 필수입니다.');
                return;
            }
            if (!(Number(r.shelfLifeDays) > 0)) {
                toast.error(`유통기한(일)은 1 이상이어야 합니다: ${r.skuCd}`);
                return;
            }
        }
        try {
            await skuApi.saveAll(dirty);
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
                <Barcode size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">SKU 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">상품 마스터 · 온도대/유통기한 정책</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" onSearch={fetchList}>
                <SearchItem label="SKU 코드">
                    <input
                        type="text"
                        value={cond.skuCd}
                        onChange={(e) => setCond(prev => ({ ...prev, skuCd: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="SKU-0001"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="상품명">
                    <input
                        type="text"
                        value={cond.skuNm}
                        onChange={(e) => setCond(prev => ({ ...prev, skuNm: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="상품명 검색"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="온도대">
                    <DropdownSelect
                        value={cond.tempZone}
                        onChange={(v) => setCond(prev => ({ ...prev, tempZone: v }))}
                        options={TEMP_ZONE_OPTIONS}
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
