import { useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Unlink, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbAllocApi } from '@/api/outbAllocApi';
import { fmtDe, num } from '@/utils/format';
import ConfirmModal from '@/components/common/ConfirmModal';

const COLUMN_DEFS = [
    { field: 'outbNo', headerName: '출고번호', width: 150, cellClass: 'font-bold text-slate-700' },
    { field: 'prodCd', headerName: '상품코드', width: 110, cellClass: 'text-slate-600' },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 130 },
    { field: 'locCd', headerName: '로케이션', width: 130, cellClass: 'font-medium text-slate-700' },
    { field: 'lotNo', headerName: 'Lot', width: 160, cellClass: 'text-slate-500' },
    { field: 'expiryDt', headerName: '유통기한', width: 110, valueFormatter: (p) => fmtDe(p.value) },
    {
        field: 'alocQty', headerName: '할당수량', width: 100,
        cellClass: 'ag-right-aligned-cell tabular-nums', valueFormatter: (p) => num(p.value),
    },
    {
        field: 'pikngQty', headerName: '피킹수량', width: 100, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '피킹이 시작된 할당은 해제할 수 없다 — 실물이 이미 나갔거나 나가는 중이다',
        cellRenderer: (p) => (p.value > 0
            ? <span className="font-bold text-emerald-600 tabular-nums">{num(p.value)}</span>
            : <span className="text-slate-300 tabular-nums">0</span>),
    },
    {
        field: 'alocStgyId', headerName: '출처', width: 90,
        headerTooltip: '전략 = 할당 전략이 만든 행 / 기본·수동 = 전략 없이 만들어진 행 '
            + '(수동할당이거나, 매칭되는 전략이 없어 기본 동작으로 할당된 행)',
        cellRenderer: (p) => (p.value != null
            ? <span className="text-indigo-600 font-medium">전략</span>
            : <span className="text-slate-400">기본·수동</span>),
    },
];

/**
 * 할당 내역 팝업 — 선택한 웨이브의 할당 레코드를 보고, 체크해서 해제한다.
 *
 * 본 화면의 상시 그리드가 아니라 팝업인 이유: 해제는 잘못 할당했을 때의 예외 경로라 자주
 * 쓰지 않는데, 상시 그리드로 두면 화면이 세 그리드로 갈라져 정작 매번 보는 웨이브·라인이
 * 좁아진다. (웨이브 편성의 {@link WaveOrderPickerModal}과 같은 결정)
 *
 * 할당 레코드에는 라인 정보가 없어(로케이션·Lot뿐) 라인 그리드 옆이 아니면 어느 주문의
 * 할당인지 안 읽힌다 — 여기서 라인을 조인해 출고번호·상품 컬럼을 붙인다.
 *
 * @param detail      웨이브 상세 { wavId, wavNo, lines, allocs }. 해제 후 부모가 다시 읽으면 목록도 따라 갱신된다
 * @param onClose     닫기
 * @param onReleased  해제 성공 후 (목록 재조회) — 팝업은 열린 채 결과를 보여준다
 */
export default function AllocRecordsModal({ detail, onClose, onReleased }) {
    const [checkedCount, setCheckedCount] = useState(0);
    const [confirmRelease, setConfirmRelease] = useState(null);
    const [saving, setSaving] = useState(false);
    const gridRef = useRef(null);

    const rows = useMemo(() => {
        const lineOf = new Map(detail.lines.map(l => [l.outbLineId, l]));
        return detail.allocs.map(a => {
            const line = lineOf.get(a.outbLineId);
            return { ...a, outbNo: line?.outbNo, prodCd: line?.prodCd, prodNm: line?.prodNm };
        });
    }, [detail]);

    const handleReleaseClick = () => {
        const picked = gridRef.current?.api.getSelectedRows() ?? [];
        if (picked.length === 0) {
            toast('해제할 할당을 체크하세요.');
            return;
        }
        setConfirmRelease(picked);
    };

    const doRelease = async (picked) => {
        setSaving(true);
        try {
            await outbAllocApi.release(picked.map(r => r.outbAllocId));
            toast.success(`할당 ${picked.length}건을 해제했습니다 — 재고 예약이 풀립니다.`);
            await onReleased();
        } catch (e) {
            toast.error(e.message || '할당 해제에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/20" onMouseDown={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-[1000px] max-h-[85vh] flex flex-col"
                 onMouseDown={(e) => e.stopPropagation()}>

                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Unlink size={16} className="text-indigo-600" />
                        <h3 className="text-base font-bold text-slate-800">할당 내역</h3>
                        <span className="text-xs text-slate-400">
                            {detail.wavNo} · 체크해서 해제하면 재고 예약이 되돌아갑니다
                        </span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 py-3 flex flex-col gap-3 flex-1 min-h-0">
                    <div className="h-[24rem]">
                        <AgGridReact
                            ref={gridRef}
                            rowData={rows}
                            columnDefs={COLUMN_DEFS}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{
                                mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false,
                                // 피킹이 시작된 할당은 서버가 해제를 거부한다 — 체크 단계에서 막아 눌러보고 아는 일을 없앤다
                                isRowSelectable: (node) => node.data.pikngQty === 0,
                            }}
                            onSelectionChanged={(e) => setCheckedCount(e.api.getSelectedRows().length)}
                        />
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-3">
                    <span className="text-xs text-slate-500">
                        할당 {rows.length}건 · 선택 <b className="text-slate-700">{checkedCount}</b>건
                    </span>
                    <span className="text-[11px] text-slate-400">피킹이 시작된 할당은 체크할 수 없습니다</span>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button onClick={onClose} className="btn-ghost">닫기</button>
                        <button onClick={handleReleaseClick} disabled={saving || checkedCount === 0}
                                className="btn-danger disabled:text-slate-300 disabled:border-slate-200 disabled:hover:bg-white">
                            <Unlink size={13} /> {saving ? '해제 중…' : '해제'}
                        </button>
                    </div>
                </div>

                {confirmRelease && (
                    <ConfirmModal
                        title="할당을 해제할까요?"
                        confirmText="해제"
                        danger
                        onCancel={() => setConfirmRelease(null)}
                        onConfirm={() => { doRelease(confirmRelease); setConfirmRelease(null); }}
                    >
                        <p className="text-sm text-slate-500">
                            할당 <b>{confirmRelease.length}건</b>({num(confirmRelease.reduce((s, a) => s + a.alocQty, 0))}개)을 지우고
                            재고 예약을 되돌립니다.
                        </p>
                        <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                            재고는 물리적으로 움직이지 않고 가용수량만 복원됩니다.
                            해제 후 주문에 할당이 한 건도 남지 않으면 그 주문은 할당 이전(생성) 상태로 돌아갑니다.
                        </p>
                    </ConfirmModal>
                )}
            </div>
        </div>
    );
}
