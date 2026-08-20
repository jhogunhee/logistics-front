import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { AlertTriangle, ClipboardList, Send, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbPikngApi } from '@/api/outbPikngApi';
import { WAVE_STATUS_META, PIKNG_TASK_STATUS_META } from '@/constants/badgeMeta';
import { fmtDe, fmtDt, num, todayStr } from '@/utils/format';
import SearchBar, { SearchText, SearchDateRange, SearchProd, SearchSelect } from '@/components/common/SearchBar';
import ConfirmModal from '@/components/common/ConfirmModal';
import { Badge } from '@/components/common/Badge';

/** 미할당 잔량 강조 — 발행을 막지는 않지만(주문 단위 가드만 있다) 부족 출고의 예고다 */
const remainCell = (p) => (p.value > 0
    ? <span className="font-bold text-amber-600 tabular-nums">{num(p.value)}</span>
    : <span className="text-slate-300 tabular-nums">0</span>);

/**
 * 웨이브 목록. 발행 대상을 고를 때 필요한 것(번호 · 상태 · 미할당 잔량)을 앞에 둬
 * 기본 폭에서 스크롤 없이 보이게 한다 (할당 화면과 같은 원칙).
 */
const WAVE_COLUMN_DEFS = [
    { field: 'wavNo', headerName: '웨이브번호', width: 168, cellClass: 'font-bold text-slate-700' },
    {
        field: 'status', headerName: '상태', width: 92,
        headerTooltip: '편성중 = 발행 대상 / 지시발행 = 확인·취소 대상 (피킹 실적이 없을 때만 취소 가능)',
        cellRenderer: (p) => <Badge meta={WAVE_STATUS_META} value={p.value} show="label" />,
    },
    {
        field: 'remainQty', headerName: '미할당', width: 90, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '주문수량 − 할당수량. 발행돼도 이 잔량은 이 웨이브에서 채워지지 않는다 — 부족 출고로 진행 (백오더 없음)',
        cellRenderer: remainCell,
    },
    { field: 'expctDe', headerName: '출고예정일', width: 105, valueFormatter: (p) => fmtDe(p.value) },
    {
        field: 'orderCount', headerName: '주문', width: 70,
        cellClass: 'ag-right-aligned-cell text-slate-500', valueFormatter: (p) => num(p.value),
    },
    {
        field: 'odrQty', headerName: '주문수량', width: 100,
        cellClass: 'ag-right-aligned-cell tabular-nums', valueFormatter: (p) => num(p.value),
    },
    {
        field: 'alocQty', headerName: '할당수량', width: 100,
        cellClass: 'ag-right-aligned-cell tabular-nums text-slate-600', valueFormatter: (p) => num(p.value),
    },
    {
        field: 'pikngQty', headerName: '피킹수량', width: 100,
        headerTooltip: '발행 후 진행 확인용 — 실적이 생기면 지시취소가 막힌다',
        cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 0 ? 'text-emerald-600 font-bold' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
    { field: 'issuedDt', headerName: '발행일시', flex: 1, minWidth: 120, valueFormatter: (p) => fmtDt(p.value) },
];

/** 하단 — 발행 전엔 할당 행(발행 미리보기, 순번 없음) / 발행 후엔 지시 행(스냅샷, srt_seq 순) */
const ROW_COLUMN_DEFS = [
    {
        field: 'srtSeq', headerName: '순번', width: 64,
        headerTooltip: '집품 순서 — 발행 시점에 로케이션 순(pikng_prty → loc_cd)으로 고정된다',
        cellClass: 'text-slate-500 tabular-nums',
        cellRenderer: (p) => (p.value ?? <span className="text-slate-300">—</span>),
    },
    { field: 'locCd', headerName: '로케이션', width: 130, cellClass: 'font-medium text-slate-700' },
    { field: 'outbNo', headerName: '출고번호', width: 150, cellClass: 'font-bold text-slate-700' },
    { field: 'storeNm', headerName: '점포', flex: 1, minWidth: 110 },
    { field: 'prodCd', headerName: '상품코드', width: 110, cellClass: 'text-slate-600' },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 130 },
    { field: 'lotNo', headerName: 'Lot', width: 150, cellClass: 'text-slate-500' },
    { field: 'expiryDt', headerName: '유통기한', width: 105, valueFormatter: (p) => fmtDe(p.value) },
    {
        field: 'drctQty', headerName: '지시수량', width: 96,
        headerTooltip: '발행 전에는 할당수량 — 발행되면 이 값 그대로 지시수량이 된다',
        cellClass: 'ag-right-aligned-cell tabular-nums', valueFormatter: (p) => num(p.value),
    },
    {
        field: 'cmplQty', headerName: '피킹수량', width: 96,
        cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 0 ? 'text-emerald-600 font-bold' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
    {
        field: 'status', headerName: '상태', width: 84,
        cellRenderer: (p) => <Badge meta={PIKNG_TASK_STATUS_META} value={p.value} show="label" />,
    },
];

/**
 * 피킹지시 (SC — 출고). <b>웨이브의 할당 레코드를 로케이션 순으로 정렬해 지시로 발행한다.</b>
 *
 * 지시 행은 할당과 1:1이다 — 상품별로 뭉치는 배치 피킹이 없어, 집품 후 주문별 분류 공정도 없다.
 * 발행은 재고에 손대지 않는다(예약은 할당이 이미 잡았다). 그래서 취소도 문서 조작뿐이고,
 * 웨이브 단위 · 피킹 실적 0일 때만 가능하다.
 *
 * 할당이 0건인 주문이 섞인 웨이브는 발행이 거부된다 — 그대로 발행하면 그 주문이 발행된
 * 웨이브에 갇혀(편성 변경은 편성중에만, 발행된 웨이브는 할당 대상이 아님) 영영 진행하지 못한다.
 * 부분할당은 막지 않는다 — 미할당 잔량은 부족 출고로 진행한다(백오더 없음).
 */
export default function PickOrder() {
    const [cond, setCond] = useState({ wavNo: '', outbNo: '', prodCd: '', storeCd: '', status: '', expctDeFrom: todayStr(), expctDeTo: todayStr() });
    const [waves, setWaves] = useState([]);
    const [detail, setDetail] = useState(null);      // { wavId, wavNo, status, rows, noAllocOrders }
    const [confirmIssue, setConfirmIssue] = useState(null);
    const [confirmCancel, setConfirmCancel] = useState(null);
    const waveGridRef = useRef(null);
    // 재조회 뒤 보고 있던 웨이브를 다시 열기 위한 wavId (할당 화면과 같은 방식)
    const pendingWaveRef = useRef(null);

    const fetchWaves = async (keepSelection = true) => {
        pendingWaveRef.current = keepSelection ? detail?.wavId ?? null : null;
        if (!keepSelection) setDetail(null);
        setWaves(await outbPikngApi.taskWaves(cond));
    };

    const fetchDetail = async (wavId) => {
        setDetail(wavId == null ? null : await outbPikngApi.taskDetail(wavId));
    };

    const search = async () => {
        try {
            await fetchWaves();
            if (detail) await fetchDetail(detail.wavId);
        } catch (e) {
            toast.error(e.message || '조회에 실패했습니다.');
        }
    };

    // 최초 1회 조회 (검색조건 기본값 = 출고예정일 오늘)
    useEffect(() => {
        outbPikngApi.taskWaves(cond).then(setWaves).catch(() => {});
    }, []);

    const onWaveModelUpdated = (p) => {
        if (pendingWaveRef.current == null) return;
        const wavId = pendingWaveRef.current;
        pendingWaveRef.current = null;
        p.api.forEachNode(n => { if (n.data.wavId === wavId) n.setSelected(true); });
    };

    /** 체크가 곧 발행·취소 대상이다. 마지막으로 체크한 웨이브의 상세를 우측에 편다 */
    const onWaveSelectionChanged = (e) => {
        const rows = e.api.getSelectedRows();
        const target = rows[rows.length - 1] ?? null;
        if (target?.wavId !== detail?.wavId) fetchDetail(target?.wavId ?? null).catch(() => {});
    };

    const checkedWaves = () => waveGridRef.current?.api.getSelectedRows() ?? [];

    // ── 발행 ─────────────────────────────────────────────────
    const handleIssueClick = () => {
        const rows = checkedWaves().filter(w => w.status === 'PLANNED');
        if (rows.length === 0) {
            toast('발행할 편성중 웨이브를 체크하세요.');
            return;
        }
        setConfirmIssue(rows);
    };

    const doIssue = async (rows) => {
        try {
            const res = await outbPikngApi.issue(rows.map(r => r.wavId));
            toast.success(`웨이브 ${res.waveCount}건에 피킹지시 ${num(res.taskCount)}건을 발행했습니다.`);
            await search();
        } catch (e) {
            toast.error(e.message || '피킹지시 발행에 실패했습니다.');
        }
    };

    // ── 발행취소 ─────────────────────────────────────────────
    const handleCancelClick = () => {
        const rows = checkedWaves().filter(w => w.status === 'ISSUED');
        if (rows.length === 0) {
            toast('취소할 발행 웨이브를 체크하세요.');
            return;
        }
        // 서버도 같은 검증을 한다 — 체크 단계에서 막아 눌러보고 아는 일을 없앤다
        const picked = rows.find(w => w.pikngQty > 0);
        if (picked) {
            toast.error(`피킹이 시작된 웨이브는 취소할 수 없습니다: ${picked.wavNo}`);
            return;
        }
        setConfirmCancel(rows);
    };

    const doCancel = async (rows) => {
        try {
            const res = await outbPikngApi.cancel(rows.map(r => r.wavId));
            toast.success(`웨이브 ${res.waveCount}건의 지시 ${num(res.cancelledCount)}건을 취소했습니다 — 편성중으로 돌아갑니다.`);
            await search();
        } catch (e) {
            toast.error(e.message || '지시취소에 실패했습니다.');
        }
    };

    const noAlloc = detail?.noAllocOrders ?? [];

    return (
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <ClipboardList size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">피킹지시</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    웨이브의 할당을 로케이션 순으로 정렬해 집품 지시를 발행합니다 — 재고는 움직이지 않습니다
                </span>
            </div>

            {/* 검색 — 조건은 웨이브를 거른다 (할당 화면과 같은 규칙) */}
            <SearchBar cond={cond} setCond={setCond} onSearch={search}>
                <SearchText name="wavNo" label="웨이브번호" placeholder="WV-20260820-001" />
                <SearchSelect name="status" label="상태" options={[
                    { value: '', label: '전체' },
                    { value: 'PLANNED', label: '편성중' },
                    { value: 'ISSUED', label: '지시발행' },
                ]} />
                <SearchText name="outbNo" label="출고번호" placeholder="OB-20260820-001" />
                <SearchProd name="prodCd" />
                <SearchText name="storeCd" label="점포코드" placeholder="ST-0001" />
                <SearchDateRange from="expctDeFrom" to="expctDeTo" label="출고예정일" />
            </SearchBar>

            {/*
              * 좌: 웨이브(체크 = 발행/취소 대상) / 우: 선택 웨이브의 지시 대상·지시 행.
              * 발행 전 목록이 발행될 순서 그대로 정렬돼 있어 그 자체가 발행 미리보기다.
              */}
            <PanelGroup direction="horizontal" autoSaveId="outb-pick-order-split" className="flex-1 min-h-0">
                <Panel defaultSize={38} minSize={16} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">웨이브</span>
                        <span className="text-xs text-slate-400 truncate">
                            할당된 편성중 + 지시발행
                        </span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">{waves.length}건</span>
                        <button onClick={handleCancelClick} className="btn-ghost shrink-0"
                                title="체크한 발행 웨이브의 지시를 취소합니다 — 피킹 실적이 없을 때만">
                            <Undo2 size={13} /> 발행취소
                        </button>
                        <button onClick={handleIssueClick} className="btn-primary shrink-0"
                                title="체크한 편성중 웨이브의 할당 전량을 지시로 발행합니다">
                            <Send size={13} /> 피킹지시 발행
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={waveGridRef}
                            rowData={waves}
                            columnDefs={WAVE_COLUMN_DEFS}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: true }}
                            onSelectionChanged={onWaveSelectionChanged}
                            onModelUpdated={onWaveModelUpdated}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="w-2.5 flex items-center justify-center group cursor-col-resize">
                    <div className="w-1 h-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={62} minSize={40} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">
                            {detail?.status === 'ISSUED' ? '지시 내역' : '지시 대상'}
                        </span>
                        <span className="text-xs text-slate-400 truncate">
                            {detail ? `${detail.wavNo} · 집품 순서(로케이션 순)대로 표시` : '왼쪽에서 웨이브를 선택하세요'}
                        </span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">
                            {detail?.rows.length ?? 0}건
                        </span>
                    </div>
                    {/* 할당 0건 주문 — 라인 목록에는 아예 나타나지 않으므로 배너로 설명한다 (발행 차단 사유) */}
                    {noAlloc.length > 0 && (
                        <div className="text-[11px] bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 leading-relaxed shrink-0">
                            <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                                <AlertTriangle size={12} /> 할당이 없는 주문 {noAlloc.length}건 — 이 웨이브는 발행할 수 없습니다.
                            </span>
                            <span className="text-slate-500"> 웨이브에서 빼거나 할당 후 다시 시도하세요: </span>
                            {noAlloc.map(o => (
                                <span key={o.outbNo} className="mr-2 text-rose-700 font-medium">{o.outbNo} ({o.storeNm})</span>
                            ))}
                        </div>
                    )}
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            rowData={detail?.rows ?? []}
                            columnDefs={ROW_COLUMN_DEFS}
                            rowHeight={34}
                            headerHeight={38}
                        />
                    </div>
                </Panel>
            </PanelGroup>

            {/* 발행 확인 — 미할당 잔량이 있으면 「알고 발행」하게 한다 */}
            {confirmIssue && (
                <ConfirmModal
                    title="피킹지시를 발행할까요?"
                    confirmText="발행"
                    onCancel={() => setConfirmIssue(null)}
                    onConfirm={() => { doIssue(confirmIssue); setConfirmIssue(null); }}
                >
                    <p className="text-sm text-slate-500">
                        웨이브 <b>{confirmIssue.length}건</b>의 할당 <b>{num(confirmIssue.reduce((s, w) => s + w.alocQty, 0))}</b>개를
                        로케이션 순으로 정렬해 지시로 발행합니다.
                    </p>
                    {confirmIssue.some(w => w.remainQty > 0) && (
                        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                            미할당 잔량 <b>{num(confirmIssue.reduce((s, w) => s + w.remainQty, 0))}</b>개는 이 웨이브에서
                            더 채워지지 않습니다 — 발행된 웨이브는 할당 대상이 아니라서, 부족한 채 출고로 진행됩니다.
                            잔량을 채우려면 발행 전에 할당을 먼저 하세요.
                        </p>
                    )}
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        발행 후 편성 변경과 할당 변경(추가 할당·해제)이 잠깁니다 — 되돌리려면 피킹 전에 발행취소하세요.
                        여러 웨이브를 함께 발행해도 <b>한 트랜잭션</b>입니다.
                    </p>
                </ConfirmModal>
            )}

            {/* 취소 확인 */}
            {confirmCancel && (
                <ConfirmModal
                    title="피킹지시를 취소할까요?"
                    confirmText="발행취소"
                    danger
                    onCancel={() => setConfirmCancel(null)}
                    onConfirm={() => { doCancel(confirmCancel); setConfirmCancel(null); }}
                >
                    <p className="text-sm text-slate-500">
                        웨이브 <b>{confirmCancel.length}건</b>의 지시 전량을 취소하고 편성중으로 되돌립니다.
                    </p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        재고는 움직이지 않습니다 — 예약은 할당이 그대로 쥐고 있습니다.
                        취소 후 편성·할당을 고치고 다시 발행할 수 있습니다.
                    </p>
                </ConfirmModal>
            )}
        </div>
    );
}
