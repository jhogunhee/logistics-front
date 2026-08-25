import { useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Handshake, Plus, Save, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { prodVndrApi } from '@/api/prodVndrApi';
import { prodApi } from '@/api/prodApi';
import { useMasterGrid } from '@/hooks/useMasterGrid';
import { TEMP_ZONE_META } from '@/constants/badgeMeta';
import { fmtDe, num } from '@/utils/format';
import SearchBar, { SearchText, SearchProd } from '@/components/common/SearchBar';
import { Badge } from '@/components/common/Badge';
import { RowStatusCell } from '@/components/common/Badge';
import ConfirmModal from '@/components/common/ConfirmModal';
import ProdPickerModal from '@/components/common/ProdPickerModal';
import VendorPickerModal from '@/components/common/VendorPickerModal';
import SaveCountSummary from '@/components/common/SaveCountSummary';

export default function ProdVndrMaster() {
    const {
        gridRef, rowCount, saveConfirm, setSaveConfirm,
        gridProps, addRow, deleteSelectedRows, requestSave,
    } = useMasterGrid();
    const [cond, setCond] = useState({ prodCd: '', prodNm: '', vndrCd: '' });
    const [rowData, setRowData] = useState([]);
    const [prods, setProds] = useState([]);             // 상품 마스터 (상품명·입고단위 표시의 원천)
    const [prodPicker, setProdPicker] = useState(null); // 상품 팝업이 채울 대상 행 노드 (null = 닫힘)
    const [vndrPicker, setVndrPicker] = useState(null); // 거래처 팝업이 채울 대상 행 노드

    // 삭제(D) 표시된 행은 편집을 막는다
    const notDeleted = (p) => p.data._status !== 'D';
    const qty = (p) => (p.value == null || p.value === '') ? '' : num(p.value);

    const prodMap = Object.fromEntries(prods.map(p => [p.prodCd, p]));

    const columnDefs = [
        {
            headerName: 'No.', width: 60, editable: false,
            valueGetter: (p) => p.node.rowIndex + 1,
            cellClass: 'text-slate-400',
        },
        {
            // 상품·거래처 모두 건수가 많아 드롭다운 대신 검색 팝업으로 고른다 (고정 로케이션 화면과 같은 방식)
            field: 'prodCd', headerName: '상품', width: 130,
            headerClass: 'header-required', editable: false,
            cellRenderer: (p) => (
                <div className="flex items-center justify-between gap-1 w-full">
                    <span>{p.value || <span className="text-slate-300">상품 선택</span>}</span>
                    {p.data._status !== 'D' && (
                        <button
                            type="button"
                            onClick={() => setProdPicker(p.node)}
                            title="상품 팝업에서 선택"
                            className="p-0.5 text-slate-400 hover:text-indigo-600 shrink-0">
                            <Search size={13} />
                        </button>
                    )}
                </div>
            ),
        },
        {
            field: 'prodNm', headerName: '상품명', width: 180, editable: false,
            // 편집 중인 신규 행도 상품명이 따라오게 마스터에서 파생한다
            valueGetter: (p) => prodMap[p.data.prodCd]?.prodNm ?? p.data.prodNm ?? '',
        },
        {
            field: 'tmpZon', headerName: '온도대', width: 90, editable: false,
            valueGetter: (p) => prodMap[p.data.prodCd]?.tmpZon ?? p.data.tmpZon ?? '',
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
        },
        {
            field: 'vndrCd', headerName: '거래처', width: 120,
            headerClass: 'header-required', editable: false,
            cellRenderer: (p) => (
                <div className="flex items-center justify-between gap-1 w-full">
                    <span>{p.value || <span className="text-slate-300">거래처 선택</span>}</span>
                    {p.data._status !== 'D' && (
                        <button
                            type="button"
                            onClick={() => setVndrPicker(p.node)}
                            title="거래처 팝업에서 선택"
                            className="p-0.5 text-slate-400 hover:text-indigo-600 shrink-0">
                            <Search size={13} />
                        </button>
                    )}
                </div>
            ),
        },
        { field: 'vndrNm', headerName: '거래처명', width: 150, editable: false },
        {
            field: 'minQty', headerName: '발주점', width: 110,
            headerClass: 'header-required', editable: notDeleted,
            cellClass: 'ag-right-aligned-cell',
            headerTooltip: '순재고(가용 + 미입고 예정 + 미확정 발주)가 이 아래면 발주 대상 — 낱개(EA) 기준',
            valueFormatter: qty,
        },
        {
            field: 'maxQty', headerName: '발주 상한', width: 110,
            headerClass: 'header-required', editable: notDeleted,
            cellClass: 'ag-right-aligned-cell',
            headerTooltip: '순재고를 여기까지 채우는 수량을 발주한다 — 낱개(EA) 기준',
            valueFormatter: qty,
        },
        {
            field: 'inbUomCd', headerName: '발주단위', width: 90, editable: false,
            valueGetter: (p) => prodMap[p.data.prodCd]?.inbUomCd ?? p.data.inbUomCd ?? '',
            cellClass: 'text-slate-400',
            headerTooltip: '상품 마스터의 입고단위 — 최소주문수량과 실제 발주 수량의 단위',
        },
        {
            field: 'minOdrQty', headerName: '최소주문수량', width: 120, editable: notDeleted,
            cellClass: 'ag-right-aligned-cell',
            headerTooltip: '부족량이 이보다 적어도 이만큼은 시킨다 — 발주단위 기준 (비우면 1)',
            valueFormatter: qty,
        },
        {
            field: 'leadDays', headerName: '리드타임', width: 100, editable: notDeleted,
            cellClass: 'ag-right-aligned-cell',
            headerTooltip: '발주일 + 이 일수 = 입고 예정일 (비우면 1일)',
            valueFormatter: (p) => (p.value == null || p.value === '') ? '' : `${p.value}일`,
        },
        {
            field: 'prty', headerName: '우선순위', width: 100, editable: notDeleted,
            cellClass: 'ag-right-aligned-cell',
            headerTooltip: '한 상품에 거래처가 여럿일 때 작은 쪽이 대표 — 자동발주는 대표 거래처에만 낸다 (비우면 1)',
            valueFormatter: (p) => (p.value == null || p.value === '') ? '' : p.value,
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
        const data = await prodVndrApi.list(cond);
        setRowData(data);
    };

    // 최초 1회 조회 (이후엔 조회 버튼으로 재조회) + 파생 표시용 마스터
    useEffect(() => {
        prodVndrApi.list().then(setRowData);
        prodApi.list().then(setProds);
    }, []);

    // ── 행 추가 ──────────────────────────────────────────────
    // 상품·거래처는 셀의 돋보기 버튼으로 고른다 — 행추가는 기본값만 채운 빈 행을 만든다
    const handleAddRow = () => addRow({
        prodCd: '', vndrCd: '', minQty: 0, maxQty: null, minOdrQty: 1, leadDays: 1, prty: 1,
    });

    // ── 저장 ────────────────────────────────────────────────
    // 서버 검증(ck_prod_vndr_qty · uq_prod_vndr)과 같은 규칙을 저장 전에 걸러준다
    const validateRows = (rows) => {
        for (const r of rows) {
            if (!r.prodCd) {
                toast.error('상품은 필수입니다.');
                return false;
            }
            if (!r.vndrCd) {
                toast.error(`거래처는 필수입니다: ${r.prodCd}`);
                return false;
            }
            if (r.minQty == null || r.minQty === '' || !(Number(r.minQty) >= 0)) {
                toast.error(`발주점은 0 이상 숫자여야 합니다: ${r.prodCd}`);
                return false;
            }
            if (r.maxQty == null || r.maxQty === '' || !(Number(r.maxQty) >= 1)) {
                toast.error(`발주 상한은 1 이상 숫자여야 합니다: ${r.prodCd}`);
                return false;
            }
            if (Number(r.minQty) > Number(r.maxQty)) {
                toast.error(`발주점은 발주 상한 이하여야 합니다: ${r.prodCd}`);
                return false;
            }
            if (r.minOdrQty !== null && r.minOdrQty !== '' && !(Number(r.minOdrQty) >= 1)) {
                toast.error(`최소주문수량은 1 이상이어야 합니다: ${r.prodCd}`);
                return false;
            }
            if (r.leadDays !== null && r.leadDays !== '' && !(Number(r.leadDays) >= 0)) {
                toast.error(`리드타임은 0 이상이어야 합니다: ${r.prodCd}`);
                return false;
            }
            if (r.prty !== null && r.prty !== '' && !(Number(r.prty) >= 1)) {
                toast.error(`우선순위는 1 이상이어야 합니다: ${r.prodCd}`);
                return false;
            }
        }
        // 상품×거래처 짝은 하나뿐(uq_prod_vndr) — 서버가 건건이 확인하기 전에 신규 행끼리 먼저 막는다
        const pairs = rows.filter(r => r._status === 'C').map(r => `${r.prodCd}/${r.vndrCd}`);
        const dup = pairs.find((pair, i) => pairs.indexOf(pair) !== i);
        if (dup) {
            toast.error(`상품·거래처가 중복됩니다: ${dup}`);
            return false;
        }
        return true;
    };

    const doSave = async (dirty) => {
        const numOrNull = (v) => (v == null || v === '') ? null : Number(v);
        try {
            const payload = dirty.map(r => ({
                ...r,
                minQty: numOrNull(r.minQty),
                maxQty: numOrNull(r.maxQty),
                minOdrQty: numOrNull(r.minOdrQty),
                leadDays: numOrNull(r.leadDays),
                prty: numOrNull(r.prty),
            }));
            await prodVndrApi.saveAll(payload);
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
                <Handshake size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">상품 거래처 관리</h2>
                <span className="text-xs text-slate-400 mt-0.5">상품×거래처 발주 기준 · 자동발주가 읽는다</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchList}>
                <SearchProd name="prodCd" />
                <SearchText name="prodNm" label="상품명" placeholder="서울우유" />
                <SearchText name="vndrCd" label="거래처" placeholder="VD-0001" />
            </SearchBar>

            {/* 그리드 툴바 */}
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

            {/* 상품·거래처 선택 팝업 — 고른 코드를 대상 행에 반영한다 (선택 시 스스로 닫힘) */}
            <ProdPickerModal
                open={prodPicker != null}
                onClose={() => setProdPicker(null)}
                onSelect={(p) => prodPicker.setDataValue('prodCd', p.prodCd)}
            />
            <VendorPickerModal
                open={vndrPicker != null}
                onClose={() => setVndrPicker(null)}
                onSelect={(v) => {
                    vndrPicker.setDataValue('vndrCd', v.vndrCd);
                    vndrPicker.setDataValue('vndrNm', v.vndrNm);
                }}
            />

            {/* 저장 확인 모달 */}
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

            {/* 그리드 — 고정 높이 대신 남은 화면 공간을 채운다 */}
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
