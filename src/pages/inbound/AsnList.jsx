import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Ban, Plus, Trash2, Truck, X } from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import { asnApi, ASN_STATUS_META, ASN_STATUS_OPTIONS } from '@/api/asnApi';
import { skuApi, TEMP_ZONE_META } from '@/api/skuApi';

// 오늘 날짜 "YYYY-MM-DD" (입고 예정일 기본값)
const todayStr = () => new Date().toISOString().slice(0, 10);

const StatusBadge = ({ value }) => {
    const meta = ASN_STATUS_META[value];
    if (!meta) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${meta.badge}`}>
            {meta.label}
        </span>
    );
};

const TempZoneBadge = ({ value }) => {
    const meta = TEMP_ZONE_META[value];
    if (!meta) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${meta.badge}`}>
            {meta.label} {value}
        </span>
    );
};

const HEADER_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'ibNo', headerName: '입고번호', width: 170 },
    {
        field: 'status', headerName: '입고진행상태', width: 130,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <StatusBadge value={p.value} />,
    },
    { field: 'vndrNm', headerName: '벤더', flex: 1, minWidth: 110 },
    { field: 'expctDt', headerName: '입고 예정일', width: 120 },
    {
        headerName: '검수 진행', width: 100, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '검수된 라인 / 전체 라인',
        valueGetter: (p) => `${p.data.rcvdLineCount} / ${p.data.lineCount}`,
    },
    { field: 'totalExpctQty', headerName: '예정수량', width: 100, cellClass: 'ag-right-aligned-cell' },
    { field: 'totalRcvdQty', headerName: '검수수량', width: 100, cellClass: 'ag-right-aligned-cell' },
];

const LINE_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'skuCd', headerName: 'SKU 코드', width: 140 },
    { field: 'skuNm', headerName: '상품명', flex: 1, minWidth: 200 },
    {
        field: 'tempZone', headerName: '온도대', width: 120,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <TempZoneBadge value={p.value} />,
    },
    { field: 'expctQty', headerName: '예정수량', width: 100, cellClass: 'ag-right-aligned-cell' },
    { field: 'rcvdQty', headerName: '검수수량', width: 100, cellClass: 'ag-right-aligned-cell' },
    {
        headerName: '잔량', width: 90,
        headerTooltip: '예정 - 검수수량 (음수 = 과입고)',
        valueGetter: (p) => p.data.expctQty - p.data.rcvdQty,
        cellClass: (p) => p.value < 0 ? 'ag-right-aligned-cell text-red-500 font-bold' : 'ag-right-aligned-cell',
    },
    { field: 'ptwyQty', headerName: '적치완료', width: 100, cellClass: 'ag-right-aligned-cell' },
];

const EMPTY_LINE = { skuId: '', expctQty: '' };

export default function AsnList() {
    const [rowData, setRowData] = useState([]);
    const [lineRows, setLineRows] = useState([]);
    const [selectedAsn, setSelectedAsn] = useState(null);
    const [cond, setCond] = useState({ ibNo: '', status: '', dateFrom: todayStr(), dateTo: todayStr() });
    const [skuOptions, setSkuOptions] = useState([]);
    const [regOpen, setRegOpen] = useState(false);
    const [regForm, setRegForm] = useState({ vndrNm: '', expctDt: todayStr(), lines: [{ ...EMPTY_LINE }] });
    const [cancelTarget, setCancelTarget] = useState(null); // 취소 확인 모달 대상 (null이면 닫힘)
    const gridRef = useRef(null);

    const fetchList = async () => {
        const data = await asnApi.list(cond);
        setRowData(data);
        setSelectedAsn(null);
        setLineRows([]);
    };

    // 최초 1회 조회(검색조건 기본값 = 오늘) + 등록 모달용 SKU 목록
    useEffect(() => {
        let ignore = false;
        asnApi.list(cond).then(data => { if (!ignore) setRowData(data); });
        skuApi.list().then(skus => {
            if (!ignore) {
                setSkuOptions(skus.map(s => ({ value: s.skuId, label: `${s.skuCd} ${s.skuNm}` })));
            }
        });
        return () => { ignore = true; };
    }, []);

    // 헤더 행 선택 시 라인 조회
    const onSelectionChanged = async (e) => {
        const node = e.api.getSelectedNodes()[0];
        if (!node) {
            setSelectedAsn(null);
            setLineRows([]);
            return;
        }
        setSelectedAsn(node.data);
        setLineRows(await asnApi.lines(node.data.ibOrderId));
    };

    // ── 취소 ────────────────────────────────────────────────
    const handleCancelClick = () => {
        if (!selectedAsn) {
            toast('취소할 입고예정을 선택하세요.');
            return;
        }
        if (selectedAsn.status !== 'SCHEDULED') {
            toast.error('입고예정(SCHEDULED) 상태만 취소할 수 있습니다.');
            return;
        }
        setCancelTarget(selectedAsn);
    };

    const doCancel = async (asn) => {
        try {
            await asnApi.cancel(asn.ibOrderId);
            toast.success(`${asn.ibNo} 를 취소했습니다.`);
            fetchList();
        } catch (e) {
            toast.error(e.message || '취소에 실패했습니다.');
        }
    };

    // ── 등록 모달 ────────────────────────────────────────────
    const openRegModal = () => {
        setRegForm({ vndrNm: '', expctDt: todayStr(), lines: [{ ...EMPTY_LINE }] });
        setRegOpen(true);
    };

    const setLine = (idx, patch) => {
        setRegForm(prev => ({
            ...prev,
            lines: prev.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
        }));
    };

    const handleRegister = async () => {
        if (!regForm.vndrNm.trim()) { toast.error('벤더명은 필수입니다.'); return; }
        if (!regForm.expctDt) { toast.error('입고 예정일은 필수입니다.'); return; }
        for (const l of regForm.lines) {
            if (!l.skuId) { toast.error('SKU를 선택하지 않은 라인이 있습니다.'); return; }
            if (!(Number(l.expctQty) > 0)) { toast.error('예정수량은 1 이상이어야 합니다.'); return; }
        }
        try {
            await asnApi.create({
                vndrNm: regForm.vndrNm.trim(),
                expctDt: regForm.expctDt,
                lines: regForm.lines.map(l => ({ skuId: l.skuId, expctQty: Number(l.expctQty) })),
            });
            toast.success('입고예정을 등록했습니다.');
            setRegOpen(false);
            fetchList();
        } catch (e) {
            toast.error(e.message || '등록에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Truck size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">입고예정(ASN)</h2>
                <span className="text-xs text-slate-400 mt-0.5">등록 · 조회 · 취소 — 검수는 입고검수 화면에서</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar label="검색" onSearch={fetchList}>
                <SearchItem label="입고번호">
                    <input
                        type="text"
                        value={cond.ibNo}
                        onChange={(e) => setCond(prev => ({ ...prev, ibNo: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                        placeholder="IB-20260717-001"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                </SearchItem>
                <SearchItem label="입고진행상태">
                    <DropdownSelect
                        value={cond.status}
                        onChange={(v) => setCond(prev => ({ ...prev, status: v }))}
                        options={ASN_STATUS_OPTIONS}
                        placeholder="전체"
                    />
                </SearchItem>
                <SearchItem label="입고예정일" wide>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={cond.dateFrom}
                            onChange={(e) => setCond(prev => ({ ...prev, dateFrom: e.target.value }))}
                            className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                        />
                        <span className="text-slate-400 shrink-0">~</span>
                        <input
                            type="date"
                            value={cond.dateTo}
                            onChange={(e) => setCond(prev => ({ ...prev, dateTo: e.target.value }))}
                            className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                        />
                    </div>
                </SearchItem>
            </SearchBar>

            {/* 상하 분할 + 드래그 스플리터 — 경계를 끌어 비율 조절 (비율은 localStorage에 기억됨) */}
            <PanelGroup direction="vertical" autoSaveId="wms-asn-split-v2" className="flex-1 min-h-0">
                <Panel defaultSize={60} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">{rowData.length}건</span>
                        <div className="flex gap-2">
                            <button
                                onClick={handleCancelClick}
                                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 hover:border-red-300 hover:text-red-600 transition-colors">
                                <Ban size={13} /> 입고취소
                            </button>
                            <button
                                onClick={openRegModal}
                                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 rounded-lg text-[12px] font-bold text-white hover:bg-indigo-700 transition-colors">
                                <Plus size={13} /> ASN 등록
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={gridRef}
                            rowData={rowData}
                            columnDefs={HEADER_COLUMN_DEFS}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                            onSelectionChanged={onSelectionChanged}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={40} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700">입고 라인</span>
                        <span className="text-xs text-slate-400">
                            {selectedAsn ? `${selectedAsn.ibNo} · ${selectedAsn.vndrNm}` : '위에서 입고예정을 선택하세요'}
                        </span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact rowData={lineRows} columnDefs={LINE_COLUMN_DEFS} rowHeight={34} />
                    </div>
                </Panel>
            </PanelGroup>

            {/* 취소 확인 모달 */}
            {cancelTarget && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">입고예정을 취소하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {cancelTarget.ibNo} · {cancelTarget.vndrNm} · 라인 {cancelTarget.lineCount}건
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setCancelTarget(null)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                닫기
                            </button>
                            <button
                                onClick={() => { doCancel(cancelTarget); setCancelTarget(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-red-600 text-white hover:bg-red-700">
                                입고취소
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 등록 모달 */}
            {regOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[560px] flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-800">ASN 등록</h3>
                            <button onClick={() => setRegOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-slate-500">벤더명</label>
                                <input
                                    type="text"
                                    value={regForm.vndrNm}
                                    onChange={(e) => setRegForm(prev => ({ ...prev, vndrNm: e.target.value }))}
                                    placeholder="서울식품"
                                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-slate-500">입고 예정일</label>
                                <input
                                    type="date"
                                    value={regForm.expctDt}
                                    onChange={(e) => setRegForm(prev => ({ ...prev, expctDt: e.target.value }))}
                                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-slate-500">입고 라인</label>
                                <button
                                    onClick={() => setRegForm(prev => ({ ...prev, lines: [...prev.lines, { ...EMPTY_LINE }] }))}
                                    className="flex items-center gap-1 text-[12px] font-bold text-indigo-600 hover:text-indigo-800">
                                    <Plus size={12} /> 라인 추가
                                </button>
                            </div>
                            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                                {regForm.lines.map((line, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <div className="flex-1">
                                            <DropdownSelect
                                                value={line.skuId}
                                                onChange={(v) => setLine(idx, { skuId: v })}
                                                options={skuOptions}
                                                placeholder="SKU 선택"
                                            />
                                        </div>
                                        <input
                                            type="number"
                                            min="1"
                                            value={line.expctQty}
                                            onChange={(e) => setLine(idx, { expctQty: e.target.value })}
                                            placeholder="수량"
                                            className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                                        />
                                        <button
                                            onClick={() => setRegForm(prev => ({
                                                ...prev,
                                                lines: prev.lines.length > 1
                                                    ? prev.lines.filter((_, i) => i !== idx)
                                                    : prev.lines,
                                            }))}
                                            className="text-slate-300 hover:text-red-500">
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-2 justify-end pt-2">
                            <button
                                onClick={() => setRegOpen(false)}
                                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                                취소
                            </button>
                            <button
                                onClick={handleRegister}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                                등록
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
