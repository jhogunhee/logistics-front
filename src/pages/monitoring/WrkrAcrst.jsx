import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Users } from 'lucide-react';

import { wrkrAcrstApi } from '@/api/wrkrAcrstApi';
import { usePage } from '@/hooks/usePage';
import { WORK_TYP_META } from '@/constants/badgeMeta';
import { WORK_TYP_OPTIONS } from '@/constants/codeOptions';
import { daysAheadStr, fmtDt, num, todayStr } from '@/utils/format';
import SearchBar, { SearchSelect, SearchDateRange } from '@/components/common/SearchBar';
import { Badge } from '@/components/common/Badge';
import { StatTile } from '@/components/common/StatTile';
import Pager from '@/components/common/Pager';

/** 표시 순서 = 업무 흐름 순서. 메타의 키 순서를 그대로 쓴다 */
const WORK_TYPS = Object.keys(WORK_TYP_META);

// 서버 페이징이라 그리드 헤더 정렬을 끈다 — 한 페이지 안에서만 정렬되면 사용자가 속는다
const DETAIL_COL_DEF = { sortable: false };

const NO_ROWS = '<span class="text-sm text-slate-400">기간 안에 실적이 없습니다</span>';

/** 기간의 모든 날짜. 실적이 없는 날도 추이에 자리를 차지해야 「쉰 날」이 보인다 */
const daysBetween = (from, to) => {
    if (!from || !to) return [];
    const days = [];
    for (const d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1)) {
        days.push(d.toISOString().slice(0, 10));
    }
    return days;
};

const cntOf = (row, workTyp) => row?.byWorkTyp?.[workTyp]?.cnt ?? 0;

const WorkTypCell = (p) => (p.value ? <Badge meta={WORK_TYP_META} value={p.value} show="label" /> : '');

const DETAIL_COLUMN_DEFS = [
    // 페이지가 넘어가도 순번이 이어지게 앞 페이지 건수(context.offset)를 더한다
    { headerName: 'No.', width: 60, valueGetter: (p) => p.context.offset + p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'workDtm', headerName: '작업일시', width: 140, valueFormatter: (p) => fmtDt(p.value) },
    {
        field: 'workTyp', headerName: '작업', width: 100,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: WorkTypCell,
    },
    { field: 'prodCd', headerName: '상품 코드', width: 115 },
    { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 160 },
    { field: 'lotNo', headerName: 'Lot번호', width: 140 },
    {
        field: 'locCd', headerName: '로케이션', width: 200,
        headerTooltip: '이동을 동반하는 작업은 출발지 → 도착지로 표시',
        valueGetter: (p) => (p.data.fromLocCd && p.data.toLocCd)
            ? `${p.data.fromLocCd} → ${p.data.toLocCd}`
            : p.data.locCd,
    },
    {
        field: 'qty', headerName: '처리수량', width: 90,
        cellClass: 'ag-right-aligned-cell font-bold text-slate-700',
        valueFormatter: (p) => num(p.value),
    },
    { field: 'rfnDocNo', headerName: 'Ref No.', width: 170 },
];

export default function WrkrAcrst() {
    const [cond, setCond] = useState({ loginId: '', workTyp: '', dateFrom: daysAheadStr(-6), dateTo: todayStr() });
    const [summary, setSummary] = useState([]);
    const [daily, setDaily] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [detail, setDetail] = useState({ rows: [], totCnt: 0 });
    const [picked, setPicked] = useState(null);
    const { page, size, setPage } = usePage(30);

    // 조회된 기간의 조건 — 추이의 가로축은 「지금 입력칸의 값」이 아니라 「조회한 값」이어야 한다
    const [shownCond, setShownCond] = useState(cond);

    const totCnt = useMemo(() => summary.reduce((s, r) => s + r.totCnt, 0), [summary]);
    const totQty = useMemo(() => summary.reduce((s, r) => s + r.totQty, 0), [summary]);
    const workerOptions = useMemo(() => [
        { value: '', label: '전체' },
        ...workers.map(w => ({ value: w.loginId, label: w.usrNm ? `${w.usrNm} (${w.loginId})` : w.loginId })),
    ], [workers]);

    // 실적이 하나도 없는 작업 종류는 칸을 만들지 않는다 — 10종을 늘 펼치면 대부분 0으로 채워진다
    const activeTyps = useMemo(
        () => WORK_TYPS.filter(t => summary.some(r => cntOf(r, t) > 0)),
        [summary]);

    const summaryColumnDefs = useMemo(() => [
        { field: 'loginId', headerName: '작업자 ID', width: 120, cellClass: 'font-bold text-slate-700' },
        {
            field: 'usrNm', headerName: '이름', width: 110,
            // 퇴사자는 계정을 지운다 — 실적은 남고 이름만 없다
            cellRenderer: (p) => p.value ?? <span className="text-slate-300">삭제된 계정</span>,
        },
        {
            field: 'totCnt', headerName: '총 건수', width: 90,
            cellClass: 'ag-right-aligned-cell font-bold text-indigo-600',
            valueFormatter: (p) => num(p.value),
        },
        {
            field: 'totQty', headerName: '총 처리수량', width: 110,
            cellClass: 'ag-right-aligned-cell text-slate-600',
            valueFormatter: (p) => num(p.value),
        },
        ...activeTyps.map(t => ({
            headerName: WORK_TYP_META[t].label, width: 92,
            valueGetter: (p) => cntOf(p.data, t),
            cellClass: (p) => `ag-right-aligned-cell ${p.value ? 'text-slate-700' : 'text-slate-300'}`,
            valueFormatter: (p) => (p.value ? num(p.value) : '-'),
        })),
    ], [activeTyps]);

    const fetchAll = async (next = cond) => {
        const [summaryRows, dailyRows, workerRows] = await Promise.all([
            wrkrAcrstApi.summary(next),
            wrkrAcrstApi.daily(next),
            wrkrAcrstApi.workers(next),
        ]);
        setSummary(summaryRows);
        setDaily(dailyRows);
        setWorkers(workerRows);
        setShownCond(next);
        setPicked(null);
        setDetail({ rows: [], totCnt: 0 });
    };

    // 조회 버튼은 1페이지부터, 페이저는 그 페이지로 — 조건이 바뀌었는데 3페이지에 머물면 빈 화면이 된다
    const fetchDetail = async (loginId, nextPage = 1) => {
        setPage(nextPage);
        setDetail(await wrkrAcrstApi.detail({ ...shownCond, loginId }, { page: nextPage, size }));
    };

    useEffect(() => {
        Promise.all([wrkrAcrstApi.summary(cond), wrkrAcrstApi.daily(cond), wrkrAcrstApi.workers(cond)])
            .then(([summaryRows, dailyRows, workerRows]) => {
                setSummary(summaryRows);
                setDaily(dailyRows);
                setWorkers(workerRows);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── 드릴다운 ──

    const handleRowClick = (e) => {
        setPicked(e.data);
        fetchDetail(e.data.loginId, 1);
    };

    return (
        <div className="flex flex-col gap-4 h-full min-h-[38rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Users size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">작업자 실적</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    재고이력의 작성자를 작업 종류별로 집계 — 실행 1회가 1건이다
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={() => fetchAll(cond)}>
                <SearchDateRange from="dateFrom" to="dateTo" label="작업일자" />
                <SearchSelect name="loginId" label="작업자" options={workerOptions} />
                <SearchSelect name="workTyp" label="작업 종류" options={WORK_TYP_OPTIONS} />
            </SearchBar>

            {/* 요약 지표 */}
            <div className="flex gap-3 shrink-0">
                <StatTile label="총 작업건수" value={num(totCnt)} accent="text-indigo-600" />
                <StatTile label="총 처리수량" value={num(totQty)} />
                <StatTile label="작업자" value={num(summary.length)} sub="명" />
                <StatTile label="작업 종류" value={num(activeTyps.length)} sub={`/ ${WORK_TYPS.length}종`} />
            </div>

            {/* 상: 작업자별 요약 + 추이 / 하: 드릴다운.
                고른 행이 없으면 아래 패널을 아예 만들지 않으므로 그룹을 새로 마운트한다(key) —
                패널 수가 바뀌는데 같은 그룹을 쓰면 저장된 비율이 남은 패널에 잘못 얹힌다 */}
            <PanelGroup key={picked ? 'with-detail' : 'summary-only'} direction="vertical"
                        autoSaveId="wrkr-acrst-split-v1" className="flex-1 min-h-0">
                <Panel defaultSize={picked ? 50 : 100} minSize={30} className="flex gap-3 min-h-0">
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <p className="text-xs font-bold text-slate-400 px-1 shrink-0">
                            작업자별 — 행을 누르면 그 작업자의 실적 내역이 아래에 열린다
                        </p>
                        <div className="flex-1 min-h-0">
                            <AgGridReact
                                rowData={summary}
                                columnDefs={summaryColumnDefs}
                                rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                                onRowClicked={handleRowClick}
                                rowHeight={34}
                                headerHeight={38}
                                overlayNoRowsTemplate={NO_ROWS}
                            />
                        </div>
                    </div>
                    <DailyTrend rows={daily} days={daysBetween(shownCond.dateFrom, shownCond.dateTo)} />
                </Panel>

                {picked && (
                    <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                        <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                    </PanelResizeHandle>
                )}

                {picked && (
                    <Panel defaultSize={50} minSize={25} className="flex flex-col gap-2 min-h-0">
                        <div className="flex items-center gap-2 px-1 shrink-0">
                            <span className="text-sm font-bold text-slate-700">
                                {picked.usrNm ?? picked.loginId} 실적 내역
                            </span>
                            <span className="text-xs text-slate-400">{num(detail.totCnt)}건</span>
                            <button onClick={() => setPicked(null)}
                                    className="ml-auto text-xs text-slate-400 hover:text-indigo-600">
                                닫기
                            </button>
                        </div>
                        <div className="flex-1 min-h-0">
                            <AgGridReact
                                rowData={detail.rows}
                                columnDefs={DETAIL_COLUMN_DEFS}
                                defaultColDef={DETAIL_COL_DEF}
                                context={{ offset: (page - 1) * size }}
                                rowHeight={34}
                                headerHeight={38}
                            />
                        </div>
                        <Pager page={page} size={size} totCnt={detail.totCnt}
                               onChange={(next) => fetchDetail(picked.loginId, next)} />
                    </Panel>
                )}
            </PanelGroup>
        </div>
    );
}

/**
 * 일자별 추이 — 하루가 막대 하나이고, 작업 종류로 쌓는다. 조회 기간의 모든 날을 그리므로
 * 빈 막대가 곧 「그날은 실적이 없다」다 (행이 없는 날을 건너뛰면 쉰 날이 사라진다).
 */
function DailyTrend({ rows, days }) {
    const byDate = useMemo(() => Object.fromEntries(rows.map(r => [r.workDt, r])), [rows]);
    const max = useMemo(() => Math.max(1, ...rows.map(r => r.totCnt)), [rows]);
    const typs = useMemo(
        () => WORK_TYPS.filter(t => rows.some(r => (r.byWorkTyp?.[t]?.cnt ?? 0) > 0)),
        [rows]);

    return (
        <div className="w-[360px] shrink-0 flex flex-col gap-1">
            <p className="text-xs font-bold text-slate-400 px-1">일자별 추이 (건수)</p>
            <div className="flex-1 min-h-0 overflow-hidden bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                <div className="flex-1 min-h-[4rem] flex items-end gap-1">
                    {days.map(day => {
                        const row = byDate[day];
                        return (
                            <div key={day} className="flex-1 h-full flex flex-col justify-end gap-px"
                                 title={`${day} — ${row ? `${row.totCnt}건` : '실적 없음'}`}>
                                {typs.map(t => {
                                    const cnt = row?.byWorkTyp?.[t]?.cnt ?? 0;
                                    if (!cnt) return null;
                                    return <div key={t} className={`${WORK_TYP_META[t].bar} rounded-[1px]`}
                                                style={{ height: `${(cnt / max) * 100}%` }} />;
                                })}
                                {/* 실적이 없는 날도 바닥에 자국을 남긴다 — 빈 칸이면 그날이 있었는지도 안 보인다 */}
                                {!row && <div className="h-px bg-slate-200" />}
                            </div>
                        );
                    })}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 tabular-nums shrink-0">
                    <span>{days[0]?.slice(5)}</span>
                    <span>{days[days.length - 1]?.slice(5)}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-2 shrink-0">
                    {typs.map(t => (
                        <span key={t} className="flex items-center gap-1 text-[11px] text-slate-500">
                            <span className={`w-2 h-2 rounded-sm ${WORK_TYP_META[t].bar}`} />
                            {WORK_TYP_META[t].label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
