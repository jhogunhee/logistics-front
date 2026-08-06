import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
    ArrowDown, ArrowUp, Layers, Play, Plus, Rocket, ScrollText, Trash2, X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import SearchBar, { SearchItem, SearchText, SearchDateRange } from '@/components/common/SearchBar';
import DropdownSelect from '@/components/common/DropdownSelect';
import ConfirmModal from '@/components/common/ConfirmModal';
import ExecutionHistory from '@/components/strategy/ExecutionHistory';
import WaveOrderTrace from '@/components/strategy/WaveOrderTrace';
import { outbWaveApi } from '@/api/outbWaveApi';
import { outbOrderApi } from '@/api/outbOrderApi';
import { WAVE_STATUS_META, WAV_REG_TYP_META } from '@/constants/badgeMeta';
import { strategyApi } from '@/api/strategyApi';
import { codeApi, toSearchOptions } from '@/api/codeApi';
import { Badge } from '@/components/common/Badge';
import { fmtDt, num } from '@/utils/format';

const centered = { display: 'flex', alignItems: 'center', justifyContent: 'center' };

/**
 * 웨이브 목록. 다른 그리드와 같은 단일 행이고, 컬럼 순서가 곧 폭 우선순위다 —
 * 좌측 컬럼이 좁아 뒤쪽 일자 컬럼은 가로 스크롤로 밀리므로, <b>웨이브를 고를 때 필요한 셋</b>
 * (번호 · 상태 · 생성 전략)을 앞에 둬 기본 폭에서 스크롤 없이 보이게 한다.
 */
const WAVE_COLUMN_DEFS = [
    { field: 'wavNo', headerName: '웨이브번호', width: 168, cellClass: 'font-bold text-slate-700' },
    {
        field: 'status', headerName: '상태', width: 74, cellStyle: centered,
        headerTooltip: '편성중 = 주문을 담고 뺄 수 있음 / 지시발행 = 피킹지시가 나가 편성이 잠김',
        cellRenderer: (p) => <Badge meta={WAVE_STATUS_META} value={p.value} show="label" />,
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

/** 좌·우 주문 그리드의 공통 컬럼. 편입 출처는 웨이브 소속 목록에만 의미가 있어 따로 붙인다 */
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
    { field: 'lineCount', headerName: '라인', width: 70, cellClass: 'ag-right-aligned-cell text-slate-500' },
    {
        field: 'totalOrderQty', headerName: '주문수량', width: 100,
        cellClass: 'ag-right-aligned-cell', valueFormatter: (p) => num(p.value),
    },
];

const UNASSIGNED_COLUMN_DEFS = orderColumns();

const WAVE_ORDER_COLUMN_DEFS = [
    ...orderColumns(),
    {
        field: 'wavRegTyp', headerName: '편입', width: 80, cellStyle: centered,
        headerTooltip: '전략 실행으로 편입됐는지, 화면에서 수동으로 담았는지. 수동 편입분은 전략 조건과 맞지 않을 수 있다',
        cellRenderer: (p) => <Badge meta={WAV_REG_TYP_META} value={p.value} show="label" />,
    },
];

/**
 * 웨이브 편성 (SC — 출고). 출고주문을 <b>피킹지시 발행 단위</b>인 웨이브로 묶는다.
 *
 * 편성 경로는 셋이다 — 수동(담기) · 전략 선택실행 · 전략 자동실행. 전략은 조건(출고유형·차량편수)에
 * 맞는 미편성 주문을 걸러 전략마다 웨이브를 하나 만들고, 우선순위가 낮은(=먼저 실행되는) 전략이
 * 주문을 선점한다. 편입 0건인 전략은 웨이브를 만들지 않으므로 재실행해도 빈 웨이브가 쌓이지 않는다.
 *
 * 전략 실행 진입점이 전략관리 화면이 아니라 여기 있는 이유는, 실행이 전략 정의를 고치는 일이 아니라
 * 실제 편성을 만드는 업무 처리이기 때문이다 (호출 API도 업무 도메인에 있다).
 */
export default function Wave() {
    // ── 검색 조건 — 한 검색바지만 웨이브 조회와 주문 조회로 나뉘어 들어간다 ──
    const [cond, setCond] = useState({
        wavNo: '', wavStatus: '',
        outbNo: '', outbTyp: '', vhclFltno: '', dateFrom: '', dateTo: '',
    });

    // ── 웨이브 목록 ──────────────────────────────────────────
    const [waves, setWaves] = useState([]);
    const [selectedWave, setSelectedWave] = useState(null);
    const waveGridRef = useRef(null);
    const pendingWaveRef = useRef(null); // 재조회 후 같은 웨이브를 다시 선택하기 위한 wavId

    // ── 주문 목록 (좌: 미편성 / 우: 선택 웨이브 소속) ────────
    const [unassigned, setUnassigned] = useState([]);
    const [waveOrders, setWaveOrders] = useState([]);
    const unassignedGridRef = useRef(null);
    const waveOrderGridRef = useRef(null);

    // ── 전략 실행 ────────────────────────────────────────────
    const [strategies, setStrategies] = useState([]);
    const [execStgyId, setExecStgyId] = useState('');   // '' = 전 전략 자동실행
    const [execRange, setExecRange] = useState({ expctDeFrom: '', expctDeTo: '' });
    const [execResult, setExecResult] = useState(null);   // 실행 결과 (전략별)
    const [previewResult, setPreviewResult] = useState(null); // 미리보기 결과 (주문별 판정 근거)
    const [execHistoryOpen, setExecHistoryOpen] = useState(false);

    // ── 확인 모달 ────────────────────────────────────────────
    const [confirmExec, setConfirmExec] = useState(null);
    const [confirmDisband, setConfirmDisband] = useState(null);
    const [confirmUnassign, setConfirmUnassign] = useState(null);

    // 공통코드 (출고유형 · 차량편수) — 조건 기준값의 주인은 코드관리라 화면에 하드코딩하지 않는다
    const [outbTyps, setOutbTyps] = useState([]);
    const [vhclFltnos, setVhclFltnos] = useState([]);

    const codeNm = (list, cd) => list.find(c => c.codeCd === cd)?.codeNm;
    const gridContext = useMemo(() => ({
        outbTypNm: (cd) => codeNm(outbTyps, cd),
        vhclFltnoNm: (cd) => codeNm(vhclFltnos, cd),
        stgyNm: (id) => strategies.find(s => s.wavStgyId === id)?.stgyNm,
    }), [outbTyps, vhclFltnos, strategies]);

    // ── 조회 ─────────────────────────────────────────────────
    // 조건을 통째로 넘기지 않고 조회마다 쓸 것만 골라 보낸다 — 웨이브 조건이 주문 API로,
    // 주문 조건이 웨이브 API로 새는 것을 막는다 (status는 양쪽에서 의미가 다르다)
    const waveParams = () => ({ wavNo: cond.wavNo, status: cond.wavStatus });

    const fetchWaves = async (keepSelection = true) => {
        pendingWaveRef.current = keepSelection ? selectedWave?.wavId ?? null : null;
        if (!keepSelection) {
            setSelectedWave(null);
            setWaveOrders([]);
        }
        setWaves(await outbWaveApi.list(waveParams()));
    };

    const fetchUnassigned = async () => {
        setUnassigned(await outbOrderApi.list({
            outbNo: cond.outbNo,
            outbTyp: cond.outbTyp,
            vhclFltno: cond.vhclFltno,
            dateFrom: cond.dateFrom,
            dateTo: cond.dateTo,
            status: 'CREATED',
            unassigned: true,
        }));
    };

    const fetchWaveOrders = async (wavId) => {
        setWaveOrders(wavId == null ? [] : await outbOrderApi.list({ wavId }));
    };

    /**
     * 조회 버튼 — 웨이브 목록과 미편성 후보를 함께 다시 읽는다 (선택은 유지).
     * 소속 주문은 여기서 직접 읽지 않는다 — 목록이 갱신되면 onWaveModelUpdated가 같은 웨이브를
     * 다시 선택하고 그 선택 이벤트가 읽는다. 여기서도 읽으면 검색 조건 때문에 선택이 풀리는 경우와
     * 경쟁해서, 선택되지 않은 웨이브의 주문이 우측에 남을 수 있다.
     */
    const search = async () => {
        await Promise.all([fetchWaves(), fetchUnassigned()]);
    };

    useEffect(() => {
        outbWaveApi.list({}).then(setWaves).catch(() => {});
        outbOrderApi.list({ status: 'CREATED', unassigned: true }).then(setUnassigned).catch(() => {});
        strategyApi.waveStrategies.list().then(setStrategies).catch(() => {});
        codeApi.list('OUTB_TYP').then(setOutbTyps).catch(() => {});
        codeApi.list('VHCL_FLTNO').then(setVhclFltnos).catch(() => {});
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
            setWaves(await outbWaveApi.list(waveParams()));
        } catch (e) {
            toast.error(e.message || '웨이브 생성에 실패했습니다.');
        }
    };

    const addOrders = async () => {
        if (!selectedWave) {
            toast('주문을 담을 웨이브를 먼저 선택하세요.');
            return;
        }
        const rows = checkedRows(unassignedGridRef);
        if (rows.length === 0) {
            toast('담을 주문을 체크하세요.');
            return;
        }
        try {
            await outbWaveApi.addOrders(selectedWave.wavId, rows.map(r => r.outbOrderId));
            toast.success(`${selectedWave.wavNo}에 주문 ${rows.length}건을 담았습니다.`);
            await Promise.all([fetchWaves(), fetchUnassigned(), fetchWaveOrders(selectedWave.wavId)]);
        } catch (e) {
            toast.error(e.message || '편성에 실패했습니다.');
        }
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

    const doDisband = async (wave) => {
        try {
            await outbWaveApi.disband(wave.wavId);
            toast.success(`${wave.wavNo}를 해체했습니다 — 소속 주문은 미편성으로 돌아갑니다.`);
            await Promise.all([fetchWaves(false), fetchUnassigned()]);
        } catch (e) {
            toast.error(e.message || '해체에 실패했습니다.');
        }
    };

    // ── 전략 실행 / 미리보기 ─────────────────────────────────
    const rangePayload = () => ({
        expctDeFrom: execRange.expctDeFrom || null,
        expctDeTo: execRange.expctDeTo || null,
    });

    const execStgyNm = () => strategies.find(s => s.wavStgyId === Number(execStgyId))?.stgyNm;

    const runPreview = async () => {
        if (!execStgyId) {
            // 전 전략 미리보기는 「먼저 실행된 전략이 선점」을 재현할 수 없어(전략마다 대상이 달라진다)
            // 실행 결과와 어긋난 그림을 보여주게 된다. 그래서 개별 전략에만 연다.
            toast('미리보기는 전략을 하나 골랐을 때만 가능합니다 — 전체 실행은 선점 순서가 결과를 바꿉니다.');
            return;
        }
        try {
            setExecResult(null);
            setPreviewResult(await strategyApi.waveStrategies.previewSaved(Number(execStgyId), rangePayload()));
        } catch (e) {
            toast.error(e.message || '미리보기에 실패했습니다.');
        }
    };

    const doExec = async () => {
        try {
            const res = await outbWaveApi.stgyExec({
                wavStgyId: execStgyId ? Number(execStgyId) : null,
                ...rangePayload(),
            });
            setPreviewResult(null);
            setExecResult(res);
            const created = res.results.filter(r => r.wavId != null);
            if (created.length === 0) {
                toast(`대상 ${res.tgtCount}건 중 편입 0건 — 만들어진 웨이브가 없습니다.`);
            } else {
                toast.success(`웨이브 ${created.length}개 생성 · 주문 ${res.assignedCount}건 편성`);
            }
            await Promise.all([fetchWaves(), fetchUnassigned()]);
            if (selectedWave) fetchWaveOrders(selectedWave.wavId);
        } catch (e) {
            toast.error(e.message || '전략 실행에 실패했습니다.');
        }
    };

    const stgyOptions = [
        { value: '', label: '전체 전략 (우선순위 순)' },
        ...strategies.map(s => ({ value: String(s.wavStgyId), label: `${s.prty}. ${s.stgyNm}` })),
    ];

    const canEditWave = selectedWave?.status === 'PLANNED';

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Layers size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">웨이브 편성</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    출고주문을 피킹지시 발행 단위로 묶습니다 — 주문 1건은 웨이브 1개에만 속합니다
                </span>
                <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => setExecHistoryOpen(true)} className="btn-ghost">
                        <ScrollText size={13} /> 실행 이력
                    </button>
                    <button onClick={createWave} className="btn-primary">
                        <Plus size={13} /> 새 웨이브
                    </button>
                </div>
            </div>

            {/* 검색 조건 — 웨이브 목록(위)과 미편성 후보(아래)에 함께 적용된다 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={search}>
                <SearchText name="wavNo" label="웨이브번호" placeholder="WV-20260803-001" />
                <SearchItem label="웨이브상태">
                    <DropdownSelect
                        value={cond.wavStatus}
                        onChange={(v) => setCond(prev => ({ ...prev, wavStatus: v }))}
                        options={[
                            { value: '', label: '전체' },
                            { value: 'PLANNED', label: '편성중' },
                            { value: 'ISSUED', label: '지시발행' },
                        ]}
                        placeholder="전체"
                    />
                </SearchItem>
                <SearchText name="outbNo" label="출고번호" placeholder="OB-20260803-001" />
                <SearchDateRange from="dateFrom" to="dateTo" label="주문일" />
                <SearchItem label="출고유형">
                    <DropdownSelect
                        value={cond.outbTyp}
                        onChange={(v) => setCond(prev => ({ ...prev, outbTyp: v }))}
                        options={toSearchOptions(outbTyps)}
                        placeholder="전체"
                    />
                </SearchItem>
                <SearchItem label="차량편수">
                    <DropdownSelect
                        value={cond.vhclFltno}
                        onChange={(v) => setCond(prev => ({ ...prev, vhclFltno: v }))}
                        options={toSearchOptions(vhclFltnos)}
                        placeholder="전체"
                    />
                </SearchItem>
            </SearchBar>

            {/* 전략 실행 — 조건에 맞는 미편성 주문을 전략별 웨이브로 자동 편성한다 */}
            <div className="border border-slate-200 rounded-xl bg-white px-4 py-3 flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        <Rocket size={14} className="text-emerald-600" />
                        <span className="text-sm font-bold text-slate-700">전략 편성</span>
                    </div>
                    <div className="w-64">
                        <DropdownSelect
                            value={execStgyId}
                            onChange={(v) => { setExecStgyId(v); setPreviewResult(null); setExecResult(null); }}
                            options={stgyOptions}
                            placeholder="전략 선택"
                        />
                    </div>
                    {/* 출고예정일은 편성 조건이 아니라 판정할 대상 주문의 범위다 */}
                    <label className="text-xs font-bold text-slate-500" title="편성 조건이 아니라 대상 주문을 좁히는 실행 범위입니다">대상 출고예정일</label>
                    <input type="date" value={execRange.expctDeFrom}
                           onChange={(e) => setExecRange(prev => ({ ...prev, expctDeFrom: e.target.value }))}
                           className="w-36 input-base" />
                    <span className="text-slate-400">~</span>
                    <input type="date" value={execRange.expctDeTo}
                           onChange={(e) => setExecRange(prev => ({ ...prev, expctDeTo: e.target.value }))}
                           className="w-36 input-base" />
                    <span className="text-[11px] text-slate-400">비우면 미편성 주문 전체</span>

                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={runPreview} className="btn-ghost" title="DB를 바꾸지 않고 편입 여부만 판정합니다">
                            <Play size={13} /> 미리보기
                        </button>
                        <button onClick={() => setConfirmExec(true)} disabled={strategies.length === 0}
                                className="flex items-center gap-1 px-3 py-1.5 border border-emerald-200 rounded-lg text-[12px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:text-slate-300 disabled:border-slate-200">
                            <Rocket size={13} /> 전략 실행
                        </button>
                    </div>
                </div>

                {strategies.length === 0 && (
                    <span className="text-[11px] text-slate-400">
                        등록된 웨이브 전략이 없습니다 — 전략관리 화면에서 먼저 등록하거나, 아래에서 수동으로 편성하세요.
                    </span>
                )}

            </div>

            {/*
              * 좌: 웨이브 목록 / 우: 위 미편성 주문 — 아래 웨이브 소속 주문.
              *
              * 셋을 세로로 쌓으면 그리드마다 높이가 1/3씩밖에 안 남아 어느 것도 몇 행 못 보여준다.
              * 웨이브 목록은 컬럼이 적어 좁은 폭으로 충분하므로 좌측 컬럼으로 세워 세로를 통째로 쓰고,
              * 컬럼이 많은 주문 그리드 둘이 남은 폭 전부를 쓰며 세로를 반씩 나눈다.
              * 그래서 담기/빼기 방향도 좌우(→ ←)가 아니라 위아래(↓ ↑)다.
              */}
            <PanelGroup direction="horizontal" autoSaveId="outb-wave-split-v2" className="flex-1 min-h-0">
                <Panel defaultSize={33} minSize={16} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700">웨이브</span>
                        <span className="text-xs text-slate-500 font-medium">{waves.length}건</span>
                        <button
                            onClick={() => setConfirmDisband(selectedWave)}
                            disabled={!canEditWave}
                            title="선택한 웨이브를 지우고 소속 주문을 전부 미편성으로 되돌립니다"
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

                <Panel defaultSize={67} minSize={40} className="min-h-0">
                    <PanelGroup direction="vertical" autoSaveId="outb-wave-orders-split-v2" className="h-full">
                        {/* 위: 미편성 주문 */}
                        <Panel defaultSize={50} minSize={20} className="flex flex-col gap-2 min-h-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-700 shrink-0">미편성 주문</span>
                                <span className="text-xs text-slate-400 truncate">아직 어느 웨이브에도 속하지 않은 신규 주문</span>
                                <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">{unassigned.length}건</span>
                                <button onClick={addOrders} disabled={!canEditWave}
                                        title="체크한 주문을 선택한 웨이브에 담습니다 (편입 출처: 수동)"
                                        className="btn-primary shrink-0 disabled:bg-slate-200 disabled:text-slate-400">
                                    담기 <ArrowDown size={13} />
                                </button>
                            </div>
                            <div className="flex-1 min-h-0">
                                <AgGridReact
                                    ref={unassignedGridRef}
                                    rowData={unassigned}
                                    columnDefs={UNASSIGNED_COLUMN_DEFS}
                                    context={gridContext}
                                    rowHeight={34}
                                    headerHeight={38}
                                    rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false }}
                                />
                            </div>
                        </Panel>

                        <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                            <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                        </PanelResizeHandle>

                        {/* 아래: 선택 웨이브 소속 주문 */}
                        <Panel defaultSize={50} minSize={20} className="flex flex-col gap-2 min-h-0">
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
                                <button onClick={handleUnassignClick} disabled={!canEditWave}
                                        title="체크한 주문을 이 웨이브에서 빼 미편성으로 되돌립니다"
                                        className="btn-ghost shrink-0 disabled:text-slate-300 disabled:border-slate-200 disabled:hover:bg-white">
                                    <ArrowUp size={13} /> 빼기
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
                                    rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false }}
                                />
                            </div>
                        </Panel>
                    </PanelGroup>
                </Panel>
            </PanelGroup>

            {/* 전략 실행 확인 */}
            {confirmExec && (
                <ConfirmModal
                    title="웨이브 전략을 실행할까요?"
                    confirmText="실행"
                    onCancel={() => setConfirmExec(null)}
                    onConfirm={() => { doExec(); setConfirmExec(null); }}
                >
                    <p className="text-sm text-slate-500">
                        {execStgyId ? <b>{execStgyNm()}</b> : <b>등록된 전략 전부</b>}를 실행합니다.
                        {!execStgyId && ' 우선순위 순으로 돌며, 앞 전략이 가져간 주문은 뒤 전략의 후보에서 빠집니다.'}
                    </p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        조건에 맞는 미편성 주문이 새 웨이브로 편성됩니다 (실제 데이터가 바뀝니다).
                        편입 0건인 전략은 웨이브를 만들지 않으므로 다시 실행해도 빈 웨이브가 쌓이지 않습니다.
                    </p>
                </ConfirmModal>
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
                        <b>{confirmDisband.wavNo}</b> · 소속 주문 {confirmDisband.orderCount}건
                    </p>
                    <p className="text-xs text-slate-400">
                        웨이브 행이 삭제되고 소속 주문은 전부 미편성으로 돌아갑니다. 주문 자체는 지워지지 않습니다.
                    </p>
                </ConfirmModal>
            )}

            {/*
              * 실행 결과 — 전략별로 웨이브를 만들었는지, 안 만들었으면 왜인지.
              * 미리보기와 같은 이유로 모달이다: 결과 줄 수가 전략 수만큼 늘어나는데 이 화면은
              * 상단이 커지면 아래 그리드 3개(웨이브·미편성·소속)가 그만큼 눌린다.
              * 편성 결과 자체는 목록에 이미 반영돼 있고, 이 모달은 "왜 이렇게 됐나"를 읽는 곳이다.
              */}
            {execResult && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/20"
                     onMouseDown={() => setExecResult(null)}>
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[620px] max-h-[85vh] flex flex-col gap-4"
                         onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Rocket size={16} className="text-emerald-600" />
                                <h3 className="text-lg font-bold text-slate-800">전략 실행 결과</h3>
                                <span className="text-xs text-slate-400">
                                    대상 {execResult.tgtCount}건 · 편성 {execResult.assignedCount}건
                                </span>
                            </div>
                            <button onClick={() => setExecResult(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
                            {execResult.results.map(r => (
                                <div key={r.wavStgyId} className="border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2 text-xs shrink-0">
                                    {r.wavId != null
                                        ? <span className="font-bold text-emerald-600 shrink-0">○ 생성</span>
                                        : <span className="font-bold text-slate-400 shrink-0">— 미생성</span>}
                                    <span className="font-bold text-slate-700 shrink-0">{r.stgyNm}</span>
                                    {r.wavId != null
                                        ? <span className="text-slate-500 font-mono">{r.wavNo} · 편입 {r.assignedCount}건</span>
                                        : <span className="text-slate-400">{r.skipRsn}</span>}
                                </div>
                            ))}
                        </div>
                        <p className="text-[11px] text-slate-400">
                            주문별 판정 근거는 <b>실행 이력</b>에서 조건 단위로 볼 수 있습니다.
                        </p>
                    </div>
                </div>
            )}

            {/*
              * 미리보기 결과 — 주문별 판정 근거. "왜 이 주문이 안 걸렸나"에 조건 단위로 답한다.
              * 카드 안이 아니라 모달인 이유: 근거 목록은 대상 주문 수만큼 길어지는데, 카드가 커지면
              * 그 아래 그리드 3개(웨이브·미편성·소속)가 눌려 화면이 못 쓰게 된다.
              */}
            {previewResult && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/20"
                     onMouseDown={() => setPreviewResult(null)}>
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[760px] max-h-[85vh] flex flex-col gap-4"
                         onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Play size={16} className="text-indigo-600" />
                                <h3 className="text-lg font-bold text-slate-800">미리보기 — {execStgyNm()}</h3>
                                <span className="text-xs text-slate-400">
                                    편입 {previewResult.matchedCount} / 대상 {previewResult.tgtCount} · DB 변경 없음
                                </span>
                            </div>
                            <button onClick={() => setPreviewResult(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
                            {previewResult.tgtCount === 0 && (
                                <p className="text-sm text-slate-400 text-center py-8">
                                    편성 대상 주문이 없습니다 — 미편성(신규) 주문만 대상입니다.
                                </p>
                            )}
                            {previewResult.orders.map((o, i) => <WaveOrderTrace key={i} order={o} />)}
                        </div>
                    </div>
                </div>
            )}

            <ExecutionHistory
                open={execHistoryOpen}
                onClose={() => setExecHistoryOpen(false)}
                stgyTyp="WAV"
                stgyId={execStgyId ? Number(execStgyId) : undefined}
            />
        </div>
    );
}
