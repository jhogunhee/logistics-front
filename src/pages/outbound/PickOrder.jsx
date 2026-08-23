import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { AlertTriangle, ClipboardList, Send, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbPikngApi } from '@/api/outbPikngApi';
import { WAVE_STATUS_META, PIKNG_TASK_STATUS_META, INV_MOV_STATUS_META } from '@/constants/badgeMeta';
import { fmtDe, fmtDt, num, todayStr } from '@/utils/format';
import SearchBar, { SearchText, SearchDateRange, SearchSelect } from '@/components/common/SearchBar';
import ConfirmModal from '@/components/common/ConfirmModal';
import { Badge } from '@/components/common/Badge';

/**
 * 미발행 할당 강조 — <b>0이 아니면 언제나 강조한다.</b> 시간 임계를 두면 임계 미만 구간이
 * 화면에서 조용해지는데, 잊히는 일은 정확히 그 구간에서 시작한다. 세는 대상이 「비정상」이
 * 아니라 「아직 안 끝난 일」이라 상시 노출이 맞다.
 */
const PENDING_TIP = '아직 지시가 나가지 않은 할당 건수. 발행 전에는 발행 대상 수이고, 발행 후에 남아 있으면 '
    + '「할당은 됐는데 지시가 안 나간 것」이라 추가 발행 대상이다 — 0이 아니면 항상 강조한다';

const pendingCell = (p) => (p.value > 0
    ? <span className="font-bold text-indigo-600 tabular-nums">{num(p.value)}</span>
    : <span className="text-slate-300 tabular-nums">0</span>);

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
        headerTooltip: '편성중 = 발행 대상 / 지시발행 = 확인·취소·추가발행 대상 (발행 통째 취소는 실적 0일 때만 — 실적이 섞였으면 지시 단위로 취소한다)',
        cellRenderer: (p) => <Badge meta={WAVE_STATUS_META} value={p.value} show="label" />,
    },
    {
        field: 'remainQty', headerName: '미할당', width: 90, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '주문수량 − 할당수량. 발행돼도 이 잔량은 이 웨이브에서 채워지지 않는다 — 부족 출고로 진행 (백오더 없음)',
        cellRenderer: remainCell,
    },
    {
        field: 'pendingAllocCount', headerName: '미발행', width: 82, cellClass: 'ag-right-aligned-cell',
        headerTooltip: PENDING_TIP,
        cellRenderer: pendingCell,
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
        headerTooltip: '발행 후 진행 확인용 — 실적이 생기면 발행 통째 취소가 막힌다 (지시 단위 취소는 계속 열려 있다)',
        cellClass: (p) => `ag-right-aligned-cell tabular-nums ${p.value > 0 ? 'text-emerald-600 font-bold' : 'text-slate-300'}`,
        valueFormatter: (p) => num(p.value),
    },
    { field: 'issuedDt', headerName: '발행일시', flex: 1, minWidth: 120, valueFormatter: (p) => fmtDt(p.value) },
];

/** 하단 — 발행 전엔 할당 행(발행 미리보기, 순번 없음) / 발행 후엔 지시 행(스냅샷, srt_seq 순) */
const rowColumnDefs = (wavNo) => [
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
    {
        field: 'rplnStatus', headerName: '보충', width: 84,
        headerTooltip: '보관존 할당분의 짝 보충지시 — 「지시」면 보충이 끝나야 집품할 수 있다. 피킹존 할당은 비어 있다. '
            + '뱃지를 누르면 이 웨이브가 열린 수시보충 화면으로 간다',
        cellRenderer: (p) => {
            if (!p.value) return <span className="text-slate-300">—</span>;
            const badge = <Badge meta={INV_MOV_STATUS_META} value={p.value} show="label" />;
            if (!wavNo) return <span title={p.data.rplnNo}>{badge}</span>;
            return (
                <Link to={`/outbound/replenishment?wavNo=${encodeURIComponent(wavNo)}`}
                      title={`${p.data.rplnNo} — 수시보충 화면에서 확정합니다`}
                      className="hover:opacity-70 transition-opacity">
                    {badge}
                </Link>
            );
        },
    },
];

/**
 * 피킹지시 (SC — 출고). <b>웨이브의 할당 레코드를 로케이션 순으로 정렬해 지시로 발행한다.</b>
 *
 * 지시 행은 할당과 1:1이다 — 상품별로 뭉치는 배치 피킹이 없어, 집품 후 주문별 분류 공정도 없다.
 * 발행은 재고에 손대지 않는다(예약은 할당이 이미 잡았다). 그래서 취소도 문서 조작뿐이고
 * 실적 0인 지시만 대상이다. 취소 단위는 둘 — <b>발행취소</b>(웨이브 통째, 실적이 하나라도 있으면
 * 거부)와 <b>지시취소</b>(고른 지시만, 그 지시 자신의 실적만 본다). 뒤쪽이 없으면 한 개도 못 집은
 * 지시가 같은 웨이브의 다른 실적에 막혀 영영 닫히지 않는다.
 *
 * 할당이 0건인 주문이 섞인 웨이브는 발행이 거부된다 — 그대로 발행하면 그 주문이 발행된
 * 웨이브에서 편성 변경을 못 받는다. 재할당·추가 발행은 발행 후에도 열려 있지만, 애초에
 * 할당이 0건인 주문을 실은 채 발행하면 현장은 그 주문을 볼 수 없다.
 * 부분할당은 막지 않는다 — 미할당 잔량은 부족 출고로 진행한다(백오더 없음).
 */
export default function PickOrder() {
    const [cond, setCond] = useState({ wavNo: '', status: [], expctDeFrom: todayStr(), expctDeTo: todayStr() });
    const [waves, setWaves] = useState([]);
    const [detail, setDetail] = useState(null);      // { wavId, wavNo, status, rows, noAllocOrders }
    const [confirmIssue, setConfirmIssue] = useState(null);
    const [confirmCancel, setConfirmCancel] = useState(null);
    const [confirmTaskCancel, setConfirmTaskCancel] = useState(null);
    const [confirmAddIssue, setConfirmAddIssue] = useState(null);
    const [checkedTaskCount, setCheckedTaskCount] = useState(0);
    // 발행 결과 — 피킹 로케이션이 없어 빠진 할당은 토스트로 흘리지 않고 모달로 짚는다 (웨이브가 아니라 할당 단위로 빠졌다)
    const [issueResult, setIssueResult] = useState(null);
    const waveGridRef = useRef(null);
    const rowGridRef = useRef(null);
    // 재조회 뒤 보고 있던 웨이브를 다시 열기 위한 wavId (할당 화면과 같은 방식)
    const pendingWaveRef = useRef(null);
    const rowColumns = useMemo(() => rowColumnDefs(detail?.wavNo ?? null), [detail?.wavNo]);

    const fetchWaves = async (keepSelection = true) => {
        pendingWaveRef.current = keepSelection ? detail?.wavId ?? null : null;
        if (!keepSelection) setDetail(null);
        setWaves(await outbPikngApi.taskWaves(cond));
    };

    const fetchDetail = async (wavId) => {
        setCheckedTaskCount(0);   // 웨이브를 갈아타면 이전 체크는 사라진다
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

    /** 체크가 곧 발행·취소 대상이다. 마지막으로 체크한 웨이브의 상세를 아래에 편다 */
    const onWaveSelectionChanged = (e) => {
        const rows = e.api.getSelectedRows();
        const target = rows[rows.length - 1] ?? null;
        if (target?.wavId !== detail?.wavId) fetchDetail(target?.wavId ?? null).catch(() => {});
    };

    const checkedWaves = () => waveGridRef.current?.api.getSelectedRows() ?? [];

    // 피킹 로케이션이 없어 이번 발행에서 빠진 할당 — 고정 로케이션을 등록하거나 피킹존 자리를 비운 뒤 추가 발행한다
    const showNoDestination = (res) => {
        const skipped = res.waves.flatMap(w => w.noDestination.map(a => `${w.wavNo} · ${a}`));
        if (skipped.length > 0) setIssueResult(skipped);
    };

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
            toast.success(`웨이브 ${res.waveCount}건에 피킹지시 ${num(res.taskCount)}건을 발행했습니다.`
                + (res.rplnCount > 0 ? ` 보충지시 ${num(res.rplnCount)}건이 함께 나갔습니다.` : ''));
            showNoDestination(res);
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
        // 서버도 같은 검증을 한다 — 체크 단계에서 막되, 남은 출구를 함께 알려 막다른 길로 보내지 않는다
        const picked = rows.find(w => w.pikngQty > 0);
        if (picked) {
            toast.error(`피킹이 시작된 웨이브는 발행을 통째로 취소할 수 없습니다: ${picked.wavNo}`
                + ' — 아래 지시 목록에서 아직 한 개도 집지 않은 지시만 골라 「지시취소」하세요.');
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
    // 발행 후에도 할당이 붙을 수 있다(결품 종결이 잔량을 키우거나 재할당이 들어온다).
    // 서버가 발행 후에만 채워 보낸다 — 발행 전에는 rows가 곧 미발행 할당이다
    const pending = detail?.pendingRows ?? [];
    // 발행 후에는 지시 행 뒤에 미발행 할당을 이어 붙인다 — 「이 웨이브에 아직 안 나간 것이 있다」가
    // 한 화면에서 보여야 한다
    const detailRows = detail?.status === 'ISSUED' ? [...detail.rows, ...pending] : (detail?.rows ?? []);

    // ── 추가 발행 ────────────────────────────────────────────
    const handleAddIssueClick = () => {
        if (!detail || pending.length === 0) {
            toast('추가로 발행할 할당이 없습니다.');
            return;
        }
        setConfirmAddIssue(detail);
    };

    const doAddIssue = async (wave) => {
        try {
            const res = await outbPikngApi.issueAdditional([wave.wavId]);
            toast.success(`지시 ${num(res.taskCount)}건을 추가 발행했습니다 — 집품 순번은 기존 뒤에 이어집니다.`
                + (res.rplnCount > 0 ? ` 보충지시 ${num(res.rplnCount)}건이 함께 나갔습니다.` : ''));
            showNoDestination(res);
            pendingWaveRef.current = wave.wavId;
            await search();
        } catch (e) {
            toast.error(e.message || '추가 발행에 실패했습니다.');
        }
    };

    // ── 지시취소 (지시 단위) ──────────────────────────────────
    const handleTaskCancelClick = () => {
        const rows = rowGridRef.current?.api.getSelectedRows() ?? [];
        if (rows.length === 0) {
            toast('취소할 지시를 체크하세요.');
            return;
        }
        setConfirmTaskCancel(rows);
    };

    const doTaskCancel = async (rows) => {
        try {
            const res = await outbPikngApi.cancelTasks(rows.map(r => r.taskId));
            toast.success(`지시 ${num(res.cancelledCount)}건을 취소했습니다`
                + ' — 예약은 할당이 그대로 쥐고 있습니다 (해제가 열렸을 뿐).');
            await search();
        } catch (e) {
            toast.error(e.message || '지시취소에 실패했습니다.');
        }
    };

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

            {/* 검색 — 어느 웨이브를 발행할지만 정한다. 발행 대상은 선택 웨이브의 미발행 전량이라
                주문 쪽 축(출고번호·상품·점포)을 두어도 「어느 웨이브냐」만 답한다 — 웨이브번호와 중복이다 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={search}>
                <SearchText name="wavNo" label="웨이브번호" placeholder="WV-20260820-001" />
                <SearchSelect name="status" label="웨이브상태" options={[
                    { value: '', label: '전체' },
                    { value: 'PLANNED', label: '편성중' },
                    { value: 'ISSUED', label: '지시발행' },
                ]} multiple />
                <SearchDateRange from="expctDeFrom" to="expctDeTo" label="출고예정일" />
            </SearchBar>

            {/*
              * 좌: 웨이브(체크 = 발행/취소 대상) / 우: 선택 웨이브의 지시 대상·지시 행.
              * 발행 전 목록이 발행될 순서 그대로 정렬돼 있어 그 자체가 발행 미리보기다.
              */}
            <PanelGroup direction="vertical" autoSaveId="outb-pick-order-split-v1" className="flex-1 min-h-0">
                <Panel defaultSize={40} minSize={20} className="flex flex-col gap-2 min-h-0">
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

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={60} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">
                            {detail?.status === 'ISSUED' ? '지시 내역' : '지시 대상'}
                        </span>
                        <span className="text-xs text-slate-400 truncate">
                            {detail ? `${detail.wavNo} · 집품 순서(로케이션 순)대로 표시` : '위에서 웨이브를 선택하세요'}
                        </span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">
                            {detail?.status === 'ISSUED'
                                ? `선택 ${checkedTaskCount} / 지시 ${detail.rows.length}건${pending.length > 0 ? ` · 미발행 ${pending.length}건` : ''}`
                                : `${detail?.rows.length ?? 0}건`}
                        </span>
                        {detail?.status === 'ISSUED' && pending.length > 0 && (
                            <button onClick={handleAddIssueClick} className="btn-primary shrink-0"
                                    title="아직 지시가 나가지 않은 할당을 지시로 냅니다 — 집품 순번은 기존 뒤에 이어붙습니다">
                                <Send size={13} /> 추가 발행 {pending.length}
                            </button>
                        )}
                        {detail?.status === 'ISSUED' && (
                            <button onClick={handleTaskCancelClick} className="btn-ghost shrink-0"
                                    title="체크한 지시만 취소합니다 — 아직 한 개도 집지 않은 지시가 대상입니다. 같은 웨이브의 다른 지시가 이미 집혔어도 상관없습니다">
                                <Undo2 size={13} /> 지시취소
                            </button>
                        )}
                    </div>
                    {/* 미발행 할당 — 지시 목록(rows)에는 안 나오므로 배너가 유일한 신호다. 0이 아니면 항상 띄운다 */}
                    {detail?.status === 'ISSUED' && pending.length > 0 && (
                        <div className="text-[11px] bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 leading-relaxed shrink-0">
                            <span className="inline-flex items-center gap-1 font-bold text-indigo-700">
                                <Send size={12} /> 아직 지시가 나가지 않은 할당 {pending.length}건
                            </span>
                            <span className="text-slate-500"> — 「추가 발행」을 눌러야 현장에 나갑니다. 그전까지 그 물량은 예약만 잡힌 채 움직이지 않습니다.</span>
                        </div>
                    )}
                    {/* 할당 0건 주문 — 라인 목록에는 아예 나타나지 않으므로 배너로 설명한다 (발행 차단 사유) */}
                    {noAlloc.length > 0 && (
                        <div className="text-[11px] bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 leading-relaxed shrink-0">
                            <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                                <AlertTriangle size={12} /> 할당이 없는 주문 {noAlloc.length}건 —
                                {detail?.status === 'ISSUED' ? ' 추가 발행이 막힙니다.' : ' 이 웨이브는 발행할 수 없습니다.'}
                            </span>
                            <span className="text-slate-500">
                                {detail?.status === 'ISSUED'
                                    ? ' 지시취소 후 할당해제로 할당이 사라진 주문입니다 — 할당 화면에서 다시 할당하세요: '
                                    : ' 웨이브에서 빼거나 할당 후 다시 시도하세요: '}
                            </span>
                            {noAlloc.map(o => (
                                <span key={o.outbNo} className="mr-2 text-rose-700 font-medium">{o.outbNo} ({o.storeNm})</span>
                            ))}
                        </div>
                    )}
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={rowGridRef}
                            rowData={detailRows}
                            columnDefs={rowColumns}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={detail?.status === 'ISSUED' ? {
                                mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false,
                                // 취소 대상은 「지시 상태 + 실적 0」뿐이다 — 실적이 있으면 결품 종결(피킹 화면)의 몫이고,
                                // 완료된 지시는 작업 여지가 없다. 취소된 지시는 애초에 이 목록에 오지 않는다(서버가 거른다)
                                isRowSelectable: (node) => node.data.status === 'DIRECTED' && node.data.cmplQty === 0,
                            } : undefined}
                            onSelectionChanged={(e) => setCheckedTaskCount(e.api.getSelectedRows().length)}
                            // 미발행 할당 행은 지시 id가 없다 — 아직 지시가 아니라는 것을 색으로 구분한다
                            getRowClass={(p) => (detail?.status === 'ISSUED' && p.data.taskId == null
                                ? 'bg-indigo-50/60' : '')}
                        />
                    </div>
                </Panel>
            </PanelGroup>

            {/* 발행 확인 — 미할당 잔량이 있으면 「알고 발행」하게 한다 */}
            {issueResult && (
                <ConfirmModal
                    title="피킹 로케이션이 없어 빠진 할당이 있습니다"
                    confirmText="확인"
                    onCancel={() => setIssueResult(null)}
                    onConfirm={() => setIssueResult(null)}
                >
                    <p className="text-sm text-slate-500">
                        아래 <b>{issueResult.length}건</b>은 보관존에 잡힌 할당인데 옮겨 둘 피킹존 자리가 없어 이번 발행에서 빠졌습니다.
                        웨이브의 나머지는 발행됐습니다.
                    </p>
                    <ul className="text-xs text-slate-700 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed max-h-40 overflow-auto">
                        {issueResult.map(s => <li key={s}>{s}</li>)}
                    </ul>
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                        상품의 고정 로케이션을 등록하거나 피킹존 자리를 비운 뒤 <b>추가 발행</b>하면 나갑니다. 그때까지 「미발행」으로 남습니다.
                    </p>
                </ConfirmModal>
            )}

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
                            지금 발행하는 지시에는 담기지 않습니다 — 부족한 채 출고로 진행됩니다.
                            발행 후에 채우려면 할당 화면에서 다시 할당한 뒤 <b>추가 발행</b>해야 합니다.
                        </p>
                    )}
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        발행 후에는 <b>편성 변경만</b> 잠깁니다 — 되돌리려면 피킹 전에 발행취소하세요.
                        할당은 발행 뒤에도 계속 붙일 수 있고(추가분은 「추가 발행」으로 나갑니다),
                        할당해제는 그 할당의 지시를 취소한 뒤에 열립니다(웨이브 전체가 아니라 할당 하나 단위입니다).
                        여러 웨이브를 함께 발행해도 <b>한 트랜잭션</b>입니다.
                    </p>
                </ConfirmModal>
            )}

            {/* 추가 발행 확인 — 「순번이 뒤에 붙는다」를 짚는다 (현장 동선이 1차 → 추가분 순이다) */}
            {confirmAddIssue && (
                <ConfirmModal
                    title="추가 발행할까요?"
                    confirmText="추가 발행"
                    onCancel={() => setConfirmAddIssue(null)}
                    onConfirm={() => { doAddIssue(confirmAddIssue); setConfirmAddIssue(null); }}
                >
                    <p className="text-sm text-slate-500">
                        아직 지시가 나가지 않은 할당 <b>{pending.length}건</b>(지시수량{' '}
                        <b>{num(pending.reduce((s, r) => s + r.drctQty, 0))}</b>)을 지시로 냅니다.
                    </p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        웨이브는 <b>지시발행 상태 그대로</b>이고 기존 지시는 건드리지 않습니다.
                        집품 순번은 <b>기존 뒤에 이어붙습니다</b> — 1차 동선을 다 돈 뒤의 추가분입니다.
                    </p>
                </ConfirmModal>
            )}

            {/* 지시 단위 취소 확인 — 「예약은 아직 잡혀 있다」를 반드시 짚는다 (다음 걸음이 할당해제다) */}
            {confirmTaskCancel && (
                <ConfirmModal
                    title="선택한 지시를 취소할까요?"
                    confirmText="지시취소"
                    danger
                    onCancel={() => setConfirmTaskCancel(null)}
                    onConfirm={() => { doTaskCancel(confirmTaskCancel); setConfirmTaskCancel(null); }}
                >
                    <p className="text-sm text-slate-500">
                        지시 <b>{confirmTaskCancel.length}건</b>(지시수량 <b>{num(confirmTaskCancel.reduce((s, r) => s + r.drctQty, 0))}</b>)을
                        취소합니다. 지시 행은 삭제되지 않고 <b>취소</b> 상태로 남고(이력 보존),
                        그 할당은 <b>미발행 할당</b>으로 이 목록에 다시 나타납니다.
                    </p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        재고는 움직이지 않고 <b>예약도 아직 풀리지 않습니다</b> — 예약을 쥐고 있는 것은 지시가 아니라 할당입니다.
                        취소는 그 할당의 <b>해제를 열어줄 뿐</b>입니다.
                    </p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        다음 걸음은 둘입니다 — 같은 재고로 다시 내보내려면 <b>추가 발행</b>,
                        예약을 풀어 다른 주문에 쓰려면 <b>할당 화면에서 할당해제</b>.
                    </p>
                </ConfirmModal>
            )}

            {/* 발행취소 확인 */}
            {confirmCancel && (
                <ConfirmModal
                    title="피킹지시를 취소할까요?"
                    confirmText="발행취소"
                    danger
                    onCancel={() => setConfirmCancel(null)}
                    onConfirm={() => { doCancel(confirmCancel); setConfirmCancel(null); }}
                >
                    <p className="text-sm text-slate-500">
                        웨이브 <b>{confirmCancel.length}건</b>의 지시 <b>전량</b>을 취소하고 편성중으로 되돌립니다.
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
