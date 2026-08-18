import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Layers, ListPlus, Minus, Plus, ScrollText, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbWaveApi } from '@/api/outbWaveApi';
import { outbOrderApi } from '@/api/outbOrderApi';
import { strategyApi } from '@/api/strategyApi';
import { useCodes } from '@/hooks/useCodes';
import { WAVE_STATUS_META, WAV_REG_TYP_META, OUTB_STATUS_META } from '@/constants/badgeMeta';
import { fmtDt, num } from '@/utils/format';
import SearchBar, { SearchText } from '@/components/common/SearchBar';
import ConfirmModal from '@/components/common/ConfirmModal';
import { Badge } from '@/components/common/Badge';
import ExecutionHistory from '@/components/strategy/ExecutionHistory';
import WaveOrderPickerModal from '@/components/outbound/WaveOrderPickerModal';
import WaveStrategyRunner from '@/components/outbound/WaveStrategyRunner';

const centered = { display: 'flex', alignItems: 'center', justifyContent: 'center' };

/**
 * 웨이브 목록. 다른 그리드와 같은 단일 행이고, 컬럼 순서가 곧 폭 우선순위다 —
 * 좌측 컬럼이 좁아 뒤쪽 일자 컬럼은 가로 스크롤로 밀리므로, <b>웨이브를 고를 때 필요한 것</b>
 * (번호 · 상태 · 주문 수 · 생성 전략)을 앞에 둬 기본 폭에서 스크롤 없이 보이게 한다.
 */
const WAVE_COLUMN_DEFS = [
    { field: 'wavNo', headerName: '웨이브번호', width: 168, cellClass: 'font-bold text-slate-700' },
    {
        field: 'status', headerName: '상태', width: 74, cellStyle: centered,
        headerTooltip: '편성중 = 주문을 담고 뺄 수 있음 / 지시발행 = 피킹지시가 나가 편성이 잠김',
        cellRenderer: (p) => <Badge meta={WAVE_STATUS_META} value={p.value} show="label" />,
    },
    {
        field: 'orderCount', headerName: '주문', width: 96, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '편성된 주문 수. 「할당 N」은 할당이 시작된 주문 수 — 그 주문은 뺄 수 없고 웨이브도 해체할 수 없다',
        // 웨이브 상태는 할당을 기록하지 않으므로(편성중/지시발행 둘뿐) 편성 변경 가능 여부는 이 파생값으로 보여준다
        cellRenderer: (p) => (
            <>
                {num(p.value)}
                {p.data.alocStartedCount > 0 && (
                    <span className="text-amber-600 font-bold" title={`할당이 시작된 주문 ${p.data.alocStartedCount}건`}>
                        {' '}· 할당 {num(p.data.alocStartedCount)}
                    </span>
                )}
            </>
        ),
    },
    {
        field: 'wavStgyId', headerName: '생성 전략', flex: 1, minWidth: 140,
        headerTooltip: '이 웨이브를 만든 웨이브 전략. 비어 있으면 화면에서 수동 생성한 웨이브',
        // 전략은 삭제될 수 있고 웨이브의 전략 참조는 느슨한 참조라, 이름을 못 찾아도 id로 남겨 추적을 끊지 않는다
        cellRenderer: (p) => (p.value == null
            ? <span className="text-slate-400">수동 생성</span>
            : <span className="text-slate-600">{p.context.stgyNm(p.value) ?? `전략 #${p.value} (삭제됨)`}</span>),
    },
    { field: 'createdAt', headerName: '생성일시', width: 130, valueFormatter: (p) => fmtDt(p.value) },
    {
        field: 'issuedDt', headerName: '지시발행', width: 130,
        headerTooltip: '피킹지시가 발행된 시각. 발행 이후에는 편성을 바꿀 수 없다',
        valueFormatter: (p) => fmtDt(p.value),
    },
];

/** 미편성 후보(주문 담기 팝업)·웨이브 소속 주문 그리드의 공통 컬럼. 편입 출처는 웨이브 소속 목록에만 의미가 있어 따로 붙인다 */
const orderColumns = () => [
    { headerName: 'No.', width: 56, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'outbNo', headerName: '출고번호', width: 150, cellClass: 'font-bold text-slate-700' },
    { field: 'storeNm', headerName: '점포', flex: 1, minWidth: 110 },
    {
        field: 'outbTyp', headerName: '출고유형', width: 100,
        headerTooltip: '웨이브 전략의 편성 조건 기준값',
        valueFormatter: (p) => p.context.outbTypNm(p.value) ?? p.value,
    },
    {
        field: 'vhclFltno', headerName: '차량편수', width: 90,
        headerTooltip: '웨이브 전략의 편성 조건 기준값. 비어 있으면 배차 미정',
        cellRenderer: (p) => (p.value
            ? (p.context.vhclFltnoNm(p.value) ?? p.value)
            : <span className="text-slate-400">배차미정</span>),
    },
    { field: 'expctDe', headerName: '출고예정일', width: 105 },
    { field: 'lineCount', headerName: '라인', width: 70, cellClass: 'ag-right-aligned-cell text-slate-500', valueFormatter: (p) => num(p.value) },
    {
        field: 'totalOrderQty', headerName: '주문수량', width: 100,
        cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value),
    },
];

const UNASSIGNED_COLUMN_DEFS = orderColumns();

const WAVE_ORDER_COLUMN_DEFS = [
    ...orderColumns(),
    {
        field: 'status', headerName: '상태', width: 74, cellStyle: centered,
        headerTooltip: '할당이 시작된(신규가 아닌) 주문은 웨이브에서 뺄 수 없어 체크가 막힌다',
        cellRenderer: (p) => <Badge meta={OUTB_STATUS_META} value={p.value} show="label" />,
    },
    {
        field: 'wavRegTyp', headerName: '편입', width: 80, cellStyle: centered,
        headerTooltip: '전략 실행으로 편입됐는지, 화면에서 수동으로 담았는지. 수동 편입분은 전략 조건과 맞지 않을 수 있다',
        cellRenderer: (p) => <Badge meta={WAV_REG_TYP_META} value={p.value} show="label" />,
    },
];

/**
 * 웨이브 편성 (SC — 출고). 출고주문을 <b>피킹지시 발행 단위</b>인 웨이브로 묶는다.
 *
 * 편성 경로는 셋이다 — 수동(담기, {@link WaveOrderPickerModal}) · 전략 선택실행 · 전략 자동실행
 * ({@link WaveStrategyRunner}). 이 화면은 웨이브 목록 · 소속 주문 두 그리드와 담기/빼기/해체를 맡는다.
 *
 * 전략 실행 진입점이 전략관리 화면이 아니라 여기 있는 이유는, 실행이 전략 정의를 고치는 일이 아니라
 * 실제 편성을 만드는 업무 처리이기 때문이다 (호출 API도 업무 도메인에 있다).
 */
export default function Wave() {
    // 공통코드 (출고유형 · 차량편수) — 조건 기준값의 주인은 코드관리라 화면에 하드코딩하지 않는다
    const outbTyps = useCodes('OUTB_TYP');
    const vhclFltnos = useCodes('VHCL_FLTNO');

    // ── 검색 조건 — 웨이브 목록에만 걸린다. 주문 조건은 주문 담기 팝업 안에 있다 ──
    const [cond, setCond] = useState({ wavNo: '' });

    // ── 웨이브 목록 ──────────────────────────────────────────
    const [waves, setWaves] = useState([]);
    const [selectedWave, setSelectedWave] = useState(null);
    const waveGridRef = useRef(null);
    const pendingWaveRef = useRef(null); // 재조회 후 같은 웨이브를 다시 선택하기 위한 wavId

    // ── 주문 목록 — 선택 웨이브 소속. 미편성은 건수만 보여주고 목록은 담기 팝업에서 본다 ──
    const [unassigned, setUnassigned] = useState([]);
    const [waveOrders, setWaveOrders] = useState([]);
    const waveOrderGridRef = useRef(null);
    const [pickerWave, setPickerWave] = useState(null); // 주문 담기 팝업 대상 웨이브 (null이면 닫힘)

    // ── 전략 실행 — 카드는 WaveStrategyRunner, 여기는 전략 목록(생성 전략 이름 표시용)과 실행 이력만 ──
    const [strategies, setStrategies] = useState([]);
    const [execHistory, setExecHistory] = useState(null); // null=닫힘 · 'browse'=이력 열람 · 'latest'=방금 실행 결과

    // ── 확인 모달 ────────────────────────────────────────────
    const [confirmDisband, setConfirmDisband] = useState(null);
    const [confirmUnassign, setConfirmUnassign] = useState(null);

    const gridContext = useMemo(() => ({
        outbTypNm: (cd) => outbTyps.nmByCd[cd],
        vhclFltnoNm: (cd) => vhclFltnos.nmByCd[cd],
        stgyNm: (id) => strategies.find(s => s.wavStgyId === id)?.stgyNm,
    }), [outbTyps, vhclFltnos, strategies]);
    const canEditWave = selectedWave?.status === 'PLANNED';

    // ── 조회 ─────────────────────────────────────────────────
    const fetchWaves = async (keepSelection = true) => {
        pendingWaveRef.current = keepSelection ? selectedWave?.wavId ?? null : null;
        if (!keepSelection) {
            setSelectedWave(null);
            setWaveOrders([]);
        }
        setWaves(await outbWaveApi.list(cond));
    };

    const fetchUnassigned = async () => {
        setUnassigned(await outbOrderApi.list({ status: 'CREATED', unassigned: true }));
    };

    const fetchWaveOrders = async (wavId) => {
        setWaveOrders(wavId == null ? [] : await outbOrderApi.list({ wavId }));
    };

    /**
     * 조회 버튼 — 웨이브 목록을 다시 읽는다 (선택은 유지).
     * 소속 주문은 여기서 직접 읽지 않는다 — 목록이 갱신되면 onWaveModelUpdated가 같은 웨이브를
     * 다시 선택하고 그 선택 이벤트가 읽는다. 여기서도 읽으면 검색 조건 때문에 선택이 풀리는 경우와
     * 경쟁해서, 선택되지 않은 웨이브의 주문이 우측에 남을 수 있다.
     */
    const search = async () => {
        await fetchWaves();
    };

    useEffect(() => {
        outbWaveApi.list({}).then(setWaves).catch(() => {});
        outbOrderApi.list({ status: 'CREATED', unassigned: true }).then(setUnassigned).catch(() => {});
        strategyApi.waveStrategies.list().then(setStrategies).catch(() => {});
    }, []);

    // 재조회 뒤 같은 웨이브를 다시 선택 — 담기/빼기 후에도 작업하던 웨이브가 풀리지 않게
    const onWaveModelUpdated = (p) => {
        if (pendingWaveRef.current == null) return;
        const wavId = pendingWaveRef.current;
        pendingWaveRef.current = null;
        p.api.forEachNode(n => { if (n.data.wavId === wavId) n.setSelected(true); });
    };

    const onWaveSelectionChanged = (e) => {
        const node = e.api.getSelectedNodes()[0];
        setSelectedWave(node?.data ?? null);
        fetchWaveOrders(node?.data?.wavId ?? null);
    };

    const checkedRows = (ref) => ref.current?.api.getSelectedRows() ?? [];

    // ── 편성 조작 ────────────────────────────────────────────
    const createWave = async () => {
        try {
            const wavId = await outbWaveApi.create([]);
            toast.success('빈 웨이브를 만들었습니다 — 주문을 담아 편성하세요.');
            pendingWaveRef.current = wavId;
            setWaves(await outbWaveApi.list(cond));
        } catch (e) {
            toast.error(e.message || '웨이브 생성에 실패했습니다.');
        }
    };

    // 담기 자체는 팝업이 처리하고, 여기선 담긴 뒤 세 목록을 다시 읽는다
    const onOrdersAdded = async () => {
        await Promise.all([fetchWaves(), fetchUnassigned(), fetchWaveOrders(selectedWave.wavId)]);
    };

    const handleUnassignClick = () => {
        if (!selectedWave) return;
        const rows = checkedRows(waveOrderGridRef);
        if (rows.length === 0) {
            toast('편성 해제할 주문을 체크하세요.');
            return;
        }
        setConfirmUnassign(rows);
    };

    const doUnassign = async (rows) => {
        try {
            await outbWaveApi.unassignOrders(selectedWave.wavId, rows.map(r => r.outbOrderId));
            toast.success(`주문 ${rows.length}건을 편성 해제했습니다.`);
            await Promise.all([fetchWaves(), fetchUnassigned(), fetchWaveOrders(selectedWave.wavId)]);
        } catch (e) {
            toast.error(e.message || '편성 해제에 실패했습니다.');
        }
    };

    // 전략 실행 뒤 — 웨이브·미편성이 함께 바뀌고 보고 있던 웨이브의 소속도 달라질 수 있다.
    // 결과는 따로 그리지 않고 실행 이력을 방금 건이 펼쳐진 채로 연다 (로그에 같은 내용이 남는다)
    const onStgyExecuted = async () => {
        await Promise.all([fetchWaves(), fetchUnassigned()]);
        if (selectedWave) fetchWaveOrders(selectedWave.wavId);
        setExecHistory('latest');
    };

    const doDisband = async (wave) => {
        try {
            await outbWaveApi.disband(wave.wavId);
            toast.success(`${wave.wavNo}를 해체했습니다 — 소속 주문은 미편성으로 돌아갑니다.`);
            await Promise.all([fetchWaves(false), fetchUnassigned()]);
        } catch (e) {
            toast.error(e.message || '해체에 실패했습니다.');
        }
    };

    return (
        // min-h — 노트북처럼 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Layers size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">웨이브 편성</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    출고주문을 피킹지시 발행 단위로 묶습니다 — 주문 1건은 웨이브 1개에만 속합니다
                </span>
                <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => setExecHistory('browse')} className="btn-ghost">
                        <ScrollText size={13} /> 실행 이력
                    </button>
                    <button onClick={createWave} className="btn-primary">
                        <Plus size={13} /> 새 웨이브
                    </button>
                </div>
            </div>

            {/* 검색 조건 — 웨이브 목록에만 걸린다. 주문 조건은 주문 담기 팝업 안에 있다 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={search}>
                <SearchText name="wavNo" label="웨이브번호" placeholder="WV-20260803-001" />
            </SearchBar>

            <WaveStrategyRunner strategies={strategies} onExecuted={onStgyExecuted} />

            {/*
              * 좌: 웨이브 목록 / 우: 선택 웨이브 소속 주문.
              * 미편성 후보는 상시 그리드로 두지 않고 「주문 담기」 팝업에서 본다 — 수동 편입은
              * 예외 경로라 자주 쓰지 않는데, 상시로 두면 세 그리드가 화면을 나눠 매번 보는
              * 웨이브 목록·소속 주문이 좁아진다. 미편성이 얼마나 남았는지는 담기 버튼의 건수로 보인다.
              */}
            <PanelGroup direction="horizontal" autoSaveId="outb-wave-split-v2" className="flex-1 min-h-0">
                <Panel defaultSize={33} minSize={16} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700">웨이브</span>
                        <span className="text-xs text-slate-500 font-medium">{waves.length}건</span>
                        <button
                            onClick={() => setConfirmDisband(selectedWave)}
                            disabled={!canEditWave || selectedWave.alocStartedCount > 0}
                            title={selectedWave?.alocStartedCount > 0
                                ? `할당이 시작된 주문이 ${selectedWave.alocStartedCount}건 있어 해체할 수 없습니다 — 할당을 먼저 해제하세요`
                                : '선택한 웨이브를 지우고 소속 주문을 전부 미편성으로 되돌립니다'}
                            className="ml-auto btn-danger disabled:text-slate-300 disabled:border-slate-200 disabled:hover:bg-white">
                            <Trash2 size={13} /> 해체
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={waveGridRef}
                            rowData={waves}
                            columnDefs={WAVE_COLUMN_DEFS}
                            context={gridContext}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                            onSelectionChanged={onWaveSelectionChanged}
                            onModelUpdated={onWaveModelUpdated}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="w-2.5 flex items-center justify-center group cursor-col-resize">
                    <div className="w-1 h-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={67} minSize={40} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">웨이브 소속 주문</span>
                        {/* 어느 웨이브를 편집 중인지만 짚는다 — 전략·생성일시는 왼쪽 목록이 이미 보여준다 */}
                        <span className="text-xs text-slate-400 truncate">
                            {selectedWave
                                ? (canEditWave
                                    ? selectedWave.wavNo
                                    : `${selectedWave.wavNo} — 피킹지시가 발행돼 편성을 바꿀 수 없습니다`)
                                : '왼쪽에서 작업할 웨이브를 선택하세요'}
                        </span>
                        <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">{waveOrders.length}건</span>
                        <button onClick={() => setPickerWave(selectedWave)} disabled={!canEditWave}
                                title="미편성 주문 중에서 골라 이 웨이브에 담습니다 (편입 출처: 수동)"
                                className="btn-primary shrink-0 disabled:bg-slate-200 disabled:text-slate-400">
                            <ListPlus size={13} /> 주문 담기
                            <span className="font-normal opacity-80">(미편성 {num(unassigned.length)})</span>
                        </button>
                        <button onClick={handleUnassignClick} disabled={!canEditWave}
                                title="체크한 주문을 이 웨이브에서 빼 미편성으로 되돌립니다"
                                className="btn-ghost shrink-0 disabled:text-slate-300 disabled:border-slate-200 disabled:hover:bg-white">
                            <Minus size={13} /> 빼기
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={waveOrderGridRef}
                            rowData={waveOrders}
                            columnDefs={WAVE_ORDER_COLUMN_DEFS}
                            context={gridContext}
                            rowHeight={34}
                            headerHeight={38}
                            rowSelection={{
                                mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false,
                                // 할당이 시작된 주문은 서버가 빼기를 거부한다 — 체크 단계에서 막아 눌러보고 아는 일을 없앤다
                                isRowSelectable: (node) => node.data.status === 'CREATED',
                            }}
                        />
                    </div>
                </Panel>
            </PanelGroup>

            {/* 주문 담기 팝업 — 열려 있는 동안만 마운트해 열 때마다 조건·후보가 새로 시작된다 */}
            {pickerWave && (
                <WaveOrderPickerModal
                    wave={pickerWave}
                    columnDefs={UNASSIGNED_COLUMN_DEFS}
                    context={gridContext}
                    outbTyps={outbTyps}
                    vhclFltnos={vhclFltnos}
                    onClose={() => setPickerWave(null)}
                    onAdded={onOrdersAdded}
                />
            )}

            {/* 편성 해제 확인 */}
            {confirmUnassign && (
                <ConfirmModal
                    title={`주문 ${confirmUnassign.length}건을 편성 해제할까요?`}
                    confirmText="편성 해제"
                    onCancel={() => setConfirmUnassign(null)}
                    onConfirm={() => { doUnassign(confirmUnassign); setConfirmUnassign(null); }}
                >
                    <p className="text-sm text-slate-500">
                        {selectedWave?.wavNo} · {confirmUnassign.slice(0, 3).map(o => o.outbNo).join(', ')}
                        {confirmUnassign.length > 3 && ` 외 ${confirmUnassign.length - 3}건`}
                    </p>
                    <p className="text-xs text-slate-400">주문은 지워지지 않고 미편성으로 돌아갑니다.</p>
                </ConfirmModal>
            )}

            {/* 웨이브 해체 확인 */}
            {confirmDisband && (
                <ConfirmModal
                    title="웨이브를 해체할까요?"
                    confirmText="해체"
                    danger
                    onCancel={() => setConfirmDisband(null)}
                    onConfirm={() => { doDisband(confirmDisband); setConfirmDisband(null); }}
                >
                    <p className="text-sm text-slate-500">
                        <b>{confirmDisband.wavNo}</b> · 소속 주문 {num(confirmDisband.orderCount)}건
                    </p>
                    <p className="text-xs text-slate-400">
                        웨이브 행이 삭제되고 소속 주문은 전부 미편성으로 돌아갑니다. 주문 자체는 지워지지 않습니다.
                    </p>
                </ConfirmModal>
            )}

            <ExecutionHistory
                open={execHistory != null}
                onClose={() => setExecHistory(null)}
                stgyTyp="WAV"
                stgyNmOf={gridContext.stgyNm}
                openLatest={execHistory === 'latest'}
            />
        </div>
    );
}
