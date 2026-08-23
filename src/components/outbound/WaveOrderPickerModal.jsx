import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ListPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbWaveApi } from '@/api/outbWaveApi';
import { outbOrderApi } from '@/api/outbOrderApi';
import SearchBar, { SearchText, SearchSelect, SearchDateRange } from '@/components/common/SearchBar';

/**
 * 주문 담기 팝업 — 미편성 주문을 골라 선택한 웨이브에 수동 편성한다.
 *
 * 미편성 후보를 본 화면의 상시 그리드가 아니라 팝업으로 둔 이유: 수동 편입은 전략 조건과
 * 맞지 않는 주문을 예외로 담는 경로라 자주 쓰지 않는데, 상시 그리드로 두면 화면이 세 그리드로
 * 갈라져 정작 매번 보는 웨이브 목록·소속 주문이 좁아진다. 검색 조건도 이 안에만 있어
 * "이 조건은 후보를 거른다"가 위치로 드러난다. (수동할당의 {@link AllocCandidateModal}과 같은 결정)
 *
 * @param wave        담을 웨이브 (편성중). 열려 있는 동안만 마운트한다
 * @param columnDefs  후보 그리드 컬럼 (소속 주문 그리드와 같은 정의를 화면이 넘긴다)
 * @param context     그리드 컨텍스트 (코드 명칭 변환)
 * @param outbTyps    출고유형 코드셋 (검색 옵션)
 * @param vhclFltnos  차량편수 코드셋 (검색 옵션)
 * @param onClose     닫기
 * @param onAdded     담기 성공 후 (목록 재조회)
 */
export default function WaveOrderPickerModal({ wave, columnDefs, context, outbTyps, vhclFltnos, onClose, onAdded }) {
    const [cond, setCond] = useState({ outbNo: '', outbTyp: '', vhclFltno: '', expctDeFrom: '', expctDeTo: '' });
    const [rows, setRows] = useState([]);
    const [checkedCount, setCheckedCount] = useState(0);
    const [saving, setSaving] = useState(false);
    const gridRef = useRef(null);

    // 웨이브에 이미 담긴 주문의 출고예정일 — 웨이브는 같은 날짜 주문만 묶으므로 후보를 이 날짜로 고정한다.
    // 빈 웨이브(NULL)면 첫 담기가 날짜를 정하므로 조건을 자유로 두고, 담기 시점에 단일 날짜인지 확인한다.
    const lockedDe = wave.expctDe;

    const fetchRows = (c) => outbOrderApi.list({
        ...c,
        ...(lockedDe ? { expctDeFrom: lockedDe, expctDeTo: lockedDe } : {}),
        status: 'CREATED', unassigned: true,
    }).then(setRows);

    useEffect(() => {
        fetchRows({}).catch(() => {});
    }, []);

    const search = () => fetchRows(cond).catch(() => {});

    const add = async () => {
        const picked = gridRef.current?.api.getSelectedRows() ?? [];
        if (picked.length === 0) {
            toast('담을 주문을 체크하세요.');
            return;
        }
        if (new Set(picked.map(r => r.expctDe)).size > 1) {
            toast.error('출고예정일이 다른 주문은 한 웨이브에 담을 수 없습니다 — 같은 날짜끼리 담으세요.');
            return;
        }
        setSaving(true);
        try {
            await outbWaveApi.addOrders(wave.wavId, picked.map(r => r.outbOrderId));
            toast.success(`${wave.wavNo}에 주문 ${picked.length}건을 담았습니다.`);
            onAdded();
            onClose();
        } catch (e) {
            toast.error(e.message || '편성에 실패했습니다.');
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
                        <ListPlus size={16} className="text-indigo-600" />
                        <h3 className="text-base font-bold text-slate-800">주문 담기</h3>
                        <span className="text-xs text-slate-400">
                            {lockedDe
                                ? `${wave.wavNo} · ${lockedDe} 출고분 웨이브 — 같은 출고예정일의 미편성 주문만 담을 수 있습니다`
                                : `${wave.wavNo} · 아직 어느 웨이브에도 속하지 않은 신규 주문 중에서 고릅니다`}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 py-3 flex flex-col gap-3 flex-1 min-h-0">
                    <SearchBar cond={cond} setCond={setCond} onSearch={search}>
                        <SearchText name="outbNo" label="출고번호" placeholder="OB-20260803-001" />
                        {!lockedDe && <SearchDateRange from="expctDeFrom" to="expctDeTo" label="출고예정일" />}
                        <SearchSelect name="outbTyp" label="출고유형" options={outbTyps.searchOptions} />
                        <SearchSelect name="vhclFltno" label="차량편수" options={vhclFltnos.searchOptions} />
                    </SearchBar>
                    <div className="h-[24rem]">
                        <AgGridReact
                            ref={gridRef}
                            rowData={rows}
                            columnDefs={columnDefs}
                            context={context}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false }}
                            onSelectionChanged={(e) => setCheckedCount(e.api.getSelectedRows().length)}
                        />
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-3">
                    <span className="text-xs text-slate-500">
                        미편성 {rows.length}건 · 선택 <b className="text-slate-700">{checkedCount}</b>건
                    </span>
                    <span className="text-[11px] text-slate-400">담은 주문의 편입 출처는 「수동」으로 남습니다</span>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button onClick={onClose} className="btn-ghost">취소</button>
                        <button onClick={add} disabled={saving || checkedCount === 0}
                                className="btn-primary disabled:bg-slate-200 disabled:text-slate-400">
                            {saving ? '담는 중…' : '담기'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
