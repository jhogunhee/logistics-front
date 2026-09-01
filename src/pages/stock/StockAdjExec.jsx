import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { SlidersHorizontal, Plus, Trash2, PauseCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

import { invAdjApi } from '@/api/invAdjApi';
import { zonApi } from '@/api/zonApi';
import { useCodes } from '@/hooks/useCodes';
import { ETC_RSN_CD, HLD_RSN_GRP, INV_ADJ_RSN_GRP } from '@/constants/rsnCodes';
import { num } from '@/utils/format';
import SearchBar, { SearchText, SearchSelect, SearchProd, SearchLoc } from '@/components/common/SearchBar';
import SelectCellEditor from '@/components/common/SelectCellEditor';
import StockAdjAddLineModal from '@/components/stock/StockAdjAddLineModal';

const TABS = [
    { key: 'aval', label: '가용재고' },
    { key: 'hld', label: '보류 건' },
];

/** 라인의 정체성 — 같은 재고 행에 보류 건이 여럿 걸릴 수 있어 재고 키만으로는 부족하다 (서버의 LineKey와 같다) */
const lineKey = (r) => `${r.prodId}-${r.locId}-${r.lotId}-${r.hldId ?? ''}`;

/** 가용재고 행을 편집 라인으로 — 조정전수량은 가용이 아니라 보유수량이다 (조정후수량 계산의 기준) */
const avalToLine = (r) => ({
    ...r, hldId: null, hldNo: null, remainingQty: null,
    adjBfrQty: r.onHandQty, adjQty: null, adjAftQty: null, rsnCd: '', rsnDscr: '', _new: false,
});

/** 보류 건을 편집 라인으로 — 감소 한도는 가용이 아니라 그 건의 미해제 잔량이다 */
const hldToLine = (r) => ({
    ...r, hldId: r.invHldId, avalQty: null,
    adjBfrQty: r.onHandQty, adjQty: null, adjAftQty: null, rsnCd: '', rsnDscr: '', _new: false,
});

/** 직접 추가한 조합 — 장부에 없는 재고라 조정전수량 0, (+) 전용 */
const newToLine = (p) => ({
    ...p, hldId: null, hldNo: null, remainingQty: null,
    onHandQty: 0, alocQty: 0, hldQty: 0, avalQty: 0,
    adjBfrQty: 0, adjQty: null, adjAftQty: null, rsnCd: '', rsnDscr: '', _new: true,
});

/** 라인이 감소로 쓸 수 있는 상한 — 보류 라인은 그 건의 잔량, 가용 라인은 가용수량 */
const decreaseLimit = (r) => (r.hldId != null ? r.remainingQty : r.avalQty);

/**
 * 재고조정 실행.
 *
 * 장부와 실물이 맞는 상태에서 둘을 함께 증감시킨다 — 어긋난 것을 맞추는 재고조사와 시작 상태가
 * 반대다. 담기 경로가 셋인 이유도 거기서 나온다: 가용재고(±) · 보류 건(− 전용, 불량 반품 폐기) ·
 * 직접 추가(+ 전용). 보류 건을 지목하는 라인은 해제와 차감이 한 트랜잭션이라, 먼저 보류를 풀 때
 * 생기는 「폐기 대기분이 가용재고로 뜨는 창」이 없다.
 */
export default function StockAdjExec() {
    const rsn = useCodes(INV_ADJ_RSN_GRP);
    const hldRsn = useCodes(HLD_RSN_GRP);
    const [cond, setCond] = useState({ prodCd: '', locCd: '', lotNo: '', zonCd: '', rsnCd: '' });
    const [tab, setTab] = useState('aval');
    const [avalRows, setAvalRows] = useState([]);
    const [hldRows, setHldRows] = useState([]);
    const [lines, setLines] = useState([]);
    const [zonOptions, setZonOptions] = useState([{ value: '', label: '전체' }]);
    const [addOpen, setAddOpen] = useState(false);
    const [confirmTargets, setConfirmTargets] = useState(null);
    // 첫 조회가 끝나기 전에는 「없음」이 아니라 「불러오는 중」이다 — DB가 원격이라 이 창이 몇 초씩
    // 열리는데, 그동안 0건과 「조회된 데이터가 없습니다」가 떠서 대상이 없는 것으로 읽혔다.
    // 아래 조정 라인 그리드는 담기 전엔 비는 게 정상이라 이 값을 쓰지 않는다
    const [loading, setLoading] = useState(true);
    const topGridRef = useRef(null);
    const lineGridRef = useRef(null);

    const lineKeys = useMemo(() => new Set(lines.map(lineKey)), [lines]);
    const totalDown = lines.reduce((s, r) => s + Math.min(Number(r.adjQty) || 0, 0), 0);
    const totalUp = lines.reduce((s, r) => s + Math.max(Number(r.adjQty) || 0, 0), 0);

    useEffect(() => {
        zonApi.list().then(zons => setZonOptions([
            { value: '', label: '전체' },
            ...zons.map(z => ({ value: z.zonCd, label: `${z.zonCd} ${z.zonNm}` })),
        ]));
    }, []);

    const avalColumnDefs = useMemo(() => [
        { headerName: '', width: 42, checkboxSelection: true, headerCheckboxSelection: true },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 140 },
        { field: 'locCd', headerName: '로케이션', width: 120 },
        { field: 'lotNo', headerName: 'Lot번호', width: 140 },
        { field: 'expiryDt', headerName: '유통기한', width: 105, cellClass: 'text-slate-500' },
        {
            field: 'onHandQty', headerName: '보유', width: 85,
            headerTooltip: '조정전수량으로 담깁니다 — 조정후수량 = 보유 + 조정수량',
            cellClass: 'ag-right-aligned-cell font-bold', valueFormatter: (p) => num(p.value),
        },
        { field: 'alocQty', headerName: '예약', width: 75, cellClass: 'ag-right-aligned-cell text-slate-500', valueFormatter: (p) => num(p.value) },
        { field: 'hldQty', headerName: '보류', width: 75, cellClass: 'ag-right-aligned-cell text-slate-500', valueFormatter: (p) => num(p.value) },
        {
            field: 'avalQty', headerName: '가용', width: 85,
            headerTooltip: '가용 = 보유 − 예약 − 보류. 감소 조정의 상한 — 보류분을 없애려면 「보류 건」 탭에서 담아야 합니다',
            cellClass: 'ag-right-aligned-cell font-bold text-emerald-600', valueFormatter: (p) => num(p.value),
        },
    ], []);

    const hldColumnDefs = useMemo(() => [
        { headerName: '', width: 42, checkboxSelection: true, headerCheckboxSelection: true },
        { field: 'hldNo', headerName: '보류 번호', width: 145, cellClass: 'font-medium' },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 140 },
        { field: 'locCd', headerName: '로케이션', width: 120 },
        { field: 'lotNo', headerName: 'Lot번호', width: 140 },
        {
            field: 'rsnCd', headerName: '보류사유', width: 150,
            headerTooltip: '왜 묶였는지가 폐기 판단의 근거다 — 반품 검수의 불량분은 여기 「품질이상」·「파손」으로 들어온다',
            cellRenderer: (p) => (
                <span className="text-xs">
                    <b>{hldRsn.nm(p.value)}</b>
                    {p.data.rsnDscr && <span className="text-slate-400"> — {p.data.rsnDscr}</span>}
                </span>
            ),
        },
        { field: 'hldQty', headerName: '보류', width: 75, cellClass: 'ag-right-aligned-cell text-slate-500', valueFormatter: (p) => num(p.value) },
        { field: 'rlzQty', headerName: '해제', width: 75, cellClass: 'ag-right-aligned-cell text-slate-500', valueFormatter: (p) => num(p.value) },
        {
            field: 'remainingQty', headerName: '잔량', width: 85,
            headerTooltip: '미해제 잔량 = 보류 − 해제. 이 건으로 폐기할 수 있는 상한',
            cellClass: 'ag-right-aligned-cell font-bold text-rose-600', valueFormatter: (p) => num(p.value),
        },
    ], [hldRsn]);

    const lineColumnDefs = useMemo(() => [
        { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
        {
            headerName: '구분', width: 90,
            cellStyle: { display: 'flex', alignItems: 'center' },
            cellRenderer: (p) => {
                if (p.data.hldId != null) return <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">보류분</span>;
                if (p.data._new) return <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">신규</span>;
                return <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">가용</span>;
            },
        },
        { field: 'prodCd', headerName: '상품 코드', width: 115 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 130 },
        { field: 'locCd', headerName: '로케이션', width: 115 },
        { field: 'lotNo', headerName: 'Lot번호', width: 135 },
        {
            field: 'hldNo', headerName: '보류 번호', width: 140, cellClass: 'text-slate-500',
            cellRenderer: (p) => (p.value || <span className="text-slate-300">—</span>),
        },
        {
            field: 'adjBfrQty', headerName: '조정전', width: 85,
            headerTooltip: '담을 때의 보유수량. 저장 시점에 서버가 락을 걸고 다시 읽으므로, 그 사이 재고가 변하면 실적에는 서버 값이 남는다',
            cellClass: 'ag-right-aligned-cell text-slate-500', valueFormatter: (p) => num(p.value),
        },
        {
            headerName: '한도', width: 85,
            headerTooltip: '감소 상한 — 보류 라인은 그 건의 미해제 잔량, 가용 라인은 가용수량',
            cellClass: 'ag-right-aligned-cell text-slate-400',
            valueGetter: (p) => decreaseLimit(p.data),
            valueFormatter: (p) => (p.value == null ? '—' : num(p.value)),
        },
        {
            field: 'adjQty', headerName: '조정수량', width: 105, editable: true,
            headerTooltip: '부호를 넣습니다 — 양수 증가 / 음수 감소. 보류(−)·신규(+) 라인은 방향이 하나뿐이라 부호 없이 넣어도 그쪽으로 잡힙니다',
            cellClass: 'ag-right-aligned-cell bg-indigo-50 font-bold',
            cellRenderer: (p) => {
                if (p.value == null || p.value === '') return <span className="text-slate-300 font-normal">—</span>;
                const n = Number(p.value);
                return <span className={n < 0 ? 'text-rose-600' : 'text-emerald-600'}>{n > 0 ? `+${num(n)}` : num(n)}</span>;
            },
        },
        {
            field: 'adjAftQty', headerName: '조정후', width: 95, editable: true,
            headerTooltip: '조정수량과 양방향으로 계산됩니다 — 어느 쪽을 넣어도 나머지가 채워집니다',
            cellClass: 'ag-right-aligned-cell bg-indigo-50 font-bold',
            cellRenderer: (p) => (p.value == null || p.value === ''
                ? <span className="text-slate-300 font-normal">—</span>
                : num(Number(p.value))),
        },
        {
            field: 'rsnCd', headerName: '조정사유', width: 145, editable: true,
            cellEditor: SelectCellEditor,
            cellEditorParams: { values: rsn.values, labelMap: rsn.nmByCd, placeholder: '사유 선택' },
            cellClass: 'bg-indigo-50',
            cellRenderer: (p) => (p.value
                ? <span>{rsn.nm(p.value)}</span>
                : <span className="text-rose-500 font-bold">사유 필요</span>),
        },
        {
            field: 'rsnDscr', headerName: '기타 사유', width: 150,
            editable: (p) => p.data.rsnCd === ETC_RSN_CD,
            headerTooltip: '사유가 「기타」일 때만 입력합니다 (그 외 코드에서는 서버가 무시)',
            cellClass: (p) => (p.data.rsnCd === ETC_RSN_CD ? 'bg-indigo-50' : ''),
            cellRenderer: (p) => (p.data.rsnCd === ETC_RSN_CD
                ? (p.value || <span className="text-rose-500 font-bold">내용 필요</span>)
                : <span className="text-slate-300">—</span>),
        },
        {
            headerName: '', width: 50, pinned: 'right',
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => (
                <button onClick={() => removeLine(p.data)} className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                    <Trash2 size={13} />
                </button>
            ),
        },
    ], [rsn]);

    /**
     * 행 모양으로 가른다 — 탭 상태로 가르면 안 된다. getRowId는 AG Grid의 초기 속성이라
     * 마운트 시점(가용재고 탭) 함수가 남고, 보류 건 행이 재고 키로 id를 받으면 같은 재고 행의
     * 보류 두 건이 같은 id가 된다 — 병존 보류를 함께 폐기하는 것이 이 화면의 핵심 시나리오다.
     */
    const getTopRowId = (p) => (p.data.invHldId != null
        ? `H${p.data.invHldId}`
        : `A${p.data.prodId}-${p.data.locId}-${p.data.lotId}`);

    const fetchTargets = async () => {
        setLoading(true);
        try {
            const [aval, hld] = await Promise.all([
                invAdjApi.listTargets(cond),
                invAdjApi.listHldTargets(cond),
            ]);
            setAvalRows(aval);
            setHldRows(hld);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        Promise.all([invAdjApi.listTargets(cond), invAdjApi.listHldTargets(cond)])
            .then(([aval, hld]) => { setAvalRows(aval); setHldRows(hld); })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 조정사유 셀은 rsnCd를, 기타 사유 셀도 rsnCd를 보고 그려진다 — 제 값이 안 바뀐 셀은 그리드가
    // 다시 그리지 않으므로, 라인이 갈릴 때마다 강제로 다시 그린다 (보류등록·로트변경과 같은 판단)
    useEffect(() => {
        lineGridRef.current?.api?.refreshCells({ force: true });
    }, [lines]);

    /** 위 그리드에서 고른 행을 아래 편집 그리드로 담는다 — 이미 담긴 것은 건너뛴다 */
    const addSelected = () => {
        const selected = topGridRef.current?.api?.getSelectedRows() ?? [];
        if (selected.length === 0) {
            toast('담을 행을 선택하세요.');
            return;
        }
        const toLine = tab === 'hld' ? hldToLine : avalToLine;
        const fresh = selected.map(toLine).filter(r => !lineKeys.has(lineKey(r)));
        if (fresh.length === 0) {
            toast('이미 담긴 대상입니다.');
            return;
        }
        setLines(prev => [...prev, ...fresh]);
        topGridRef.current?.api?.deselectAll();
    };

    const removeLine = (row) => {
        const key = lineKey(row);
        setLines(prev => prev.filter(r => lineKey(r) !== key));
    };

    const pickNewLine = (picked) => {
        const line = newToLine(picked);
        if (lineKeys.has(lineKey(line))) {
            toast('이미 담긴 대상입니다.');
            return;
        }
        setLines(prev => [...prev, line]);
    };

    /**
     * 조정수량 ↔ 조정후수량 양방향 계산. 기본 텍스트 에디터는 문자열을 남기므로 빈 값은 null로,
     * 그 외는 숫자로 맞춘다. 결과가 0이면 상대 칸에 0을 명시해 빈칸이 되지 않게 한다.
     * 보류(−)·신규(+) 라인은 방향이 하나뿐이라 조정수량은 부호 없이 넣은 값을 그 방향으로 읽는다 —
     * 조정후수량은 값 자체가 방향을 가지므로(조정후 > 보유는 증가 의도다) 고치지 않고 저장 검증에 맡긴다.
     */
    const onLineValueChanged = (e) => {
        const key = lineKey(e.data);
        const bfr = Number(e.data.adjBfrQty) || 0;
        const toNum = (v) => (v === '' || v == null ? null : Number(v));
        setLines(prev => prev.map(r => {
            if (lineKey(r) !== key) return r;
            const next = { ...r, ...e.data };
            if (e.colDef.field === 'adjQty') {
                const q0 = toNum(e.data.adjQty);
                const dir = r.hldId != null ? -1 : (r._new ? 1 : 0);
                const q = q0 == null || q0 === 0 || dir === 0 ? q0 : dir * Math.abs(q0);
                return { ...next, adjQty: q, adjAftQty: q == null ? null : bfr + q };
            }
            if (e.colDef.field === 'adjAftQty') {
                const aft = toNum(e.data.adjAftQty);
                return { ...next, adjAftQty: aft, adjQty: aft == null ? null : aft - bfr };
            }
            return next;
        }));
    };

    const handleSubmit = () => {
        // 편집 중인 셀은 아직 행에 반영되지 않았다 — 열린 에디터를 닫고 나서 그리드에서 직접 걷는다
        lineGridRef.current?.api.stopEditing();
        const rows = [];
        lineGridRef.current?.api.forEachNode(n => rows.push(n.data));
        if (rows.length === 0) {
            toast('담긴 조정 라인이 없습니다.');
            return;
        }
        // 실행이 전량 롤백이라 걸린 행을 하나씩 알리면 고칠 때마다 다음 행이 새로 걸린다 —
        // 한 번에 다 보여줘서 한 번의 수정으로 다시 시도할 수 있게 한다
        const errors = [];
        for (const r of rows) {
            const where = `${r.prodCd} / ${r.locCd} / ${r.lotNo}${r.hldNo ? ` / ${r.hldNo}` : ''}`;
            const n = Number(r.adjQty);
            const limit = decreaseLimit(r);
            if (r.adjQty == null || !Number.isFinite(n) || n === 0) {
                errors.push(`${where}: 조정수량은 0일 수 없습니다.`);
            } else if (r.hldId != null && n > 0) {
                errors.push(`${where}: 보류분은 감소 조정만 할 수 있습니다.`);
            } else if (r._new && n < 0) {
                errors.push(`${where}: 장부에 없는 재고는 증가 조정만 할 수 있습니다.`);
            } else if (n < 0 && -n > limit) {
                errors.push(`${where}: 감소 한도(${num(limit)})를 초과했습니다.`
                    + (r.hldId == null && r.hldQty > 0 ? ' — 보류분은 「보류 건」 탭에서 담아야 합니다.' : ''));
            } else if (!r.rsnCd) {
                errors.push(`${where}: 조정사유를 선택하세요.`);
            } else if (r.rsnCd === ETC_RSN_CD && !String(r.rsnDscr ?? '').trim()) {
                errors.push(`${where}: 사유가 기타일 때는 사유 내용을 입력해야 합니다.`);
            }
        }
        if (errors.length > 0) {
            toast.error(errors.join('\n'), { style: { whiteSpace: 'pre-line' } });
            return;
        }
        setConfirmTargets(rows);
    };

    /** 담긴 라인을 한 번에 보낸다 — 서버가 전량 롤백하므로 부분 성공은 없다 */
    const doAdjust = async (targets) => {
        try {
            const nos = await invAdjApi.adjust(targets.map(r => ({
                prodId: r.prodId, locId: r.locId, lotId: r.lotId,
                adjQty: Number(r.adjQty),
                hldId: r.hldId ?? null,
                rsnCd: r.rsnCd,
                rsnDscr: r.rsnCd === ETC_RSN_CD ? String(r.rsnDscr).trim() : null,
            })));
            toast.success(`재고조정 ${nos.length}건을 실행했습니다 (${nos.join(', ')}).`);
            setLines([]);          // 성공 콜백에서만 비운다 — 실패 시 입력이 사라지면 재입력이 필요하다
            fetchTargets();
        } catch (e) {
            // 실패하면 재조회하지 않는다 — 전량 롤백이라 서버 값은 그대로이고,
            // 입력을 살려둬야 지적된 행만 고쳐서 다시 시도할 수 있다
            toast.error(e.message || '재고조정에 실패했습니다.');
        }
    };

    const topRows = tab === 'hld' ? hldRows : avalRows;

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">재고조정</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    장부와 실물을 함께 증감시킵니다(폐기·견본출고) — <b>세어보니 다르더라는 차이 정정은 → 재고조사</b>
                </span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={fetchTargets}>
                <SearchProd name="prodCd" />
                <SearchLoc name="locCd" />
                <SearchText name="lotNo" label="Lot번호" placeholder="LOT-260722-001" />
                <SearchSelect name="zonCd" label="존" options={zonOptions} />
                <SearchSelect name="rsnCd" label="보류사유" options={hldRsn.searchOptions} />
            </SearchBar>

            {/* 위: 대상 조회 (탭 2개) */}
            <div className="flex-1 min-h-0 flex flex-col gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                        {TABS.map(t => (
                            <button
                                key={t.key}
                                onClick={() => { setTab(t.key); topGridRef.current?.api?.deselectAll(); }}
                                className={`px-3 py-1 rounded-md text-xs font-bold transition-colors
                                    ${tab === t.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                {t.label}
                                <span className="ml-1.5 text-[11px] text-slate-400">
                                    {loading ? '…' : num(t.key === 'hld' ? hldRows.length : avalRows.length)}
                                </span>
                            </button>
                        ))}
                    </div>
                    <span className="text-[11px] text-slate-400">
                        {tab === 'hld'
                            ? '불량 반품 폐기가 여기입니다 — 담아서 조정하면 보류 해제와 장부 차감이 한 번에 처리됩니다'
                            : '보류분은 여기서 뺄 수 없습니다 — 「보류 건」 탭에서 담아야 해제 실적이 함께 남습니다'}
                    </span>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => setAddOpen(true)}
                            className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">
                            <Plus size={13} /> 직접 추가
                        </button>
                        <button
                            onClick={addSelected}
                            className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 rounded-lg text-xs font-bold text-white hover:bg-slate-800">
                            담기
                        </button>
                    </div>
                </div>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        ref={topGridRef}
                        loading={loading}
                        rowData={topRows}
                        columnDefs={tab === 'hld' ? hldColumnDefs : avalColumnDefs}
                        getRowId={getTopRowId}
                        rowSelection="multiple"
                        suppressRowClickSelection={true}
                        rowHeight={34}
                        headerHeight={38}
                    />
                </div>
            </div>

            {/* 아래: 조정 라인 편집 */}
            <div className="h-[46%] min-h-0 flex flex-col gap-2 border-t border-slate-200 pt-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-slate-500 font-medium">조정 라인 {num(lines.length)}건</span>
                    <span className="text-[11px] text-slate-400">
                        조정수량에 부호를 넣습니다 — 취소 경로가 없어 되돌리려면 반대 부호로 한 번 더 조정합니다
                    </span>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold">
                            <span className="text-rose-600">{num(totalDown)}</span>
                            <span className="text-slate-300 mx-1">/</span>
                            <span className="text-emerald-600">+{num(totalUp)}</span>
                        </span>
                        <button
                            onClick={handleSubmit}
                            className="flex items-center gap-1 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-colors">
                            <SlidersHorizontal size={14} /> 조정
                        </button>
                    </div>
                </div>
                <div className="flex-1 min-h-0">
                    <AgGridReact
                        ref={lineGridRef}
                        rowData={lines}
                        columnDefs={lineColumnDefs}
                        overlayNoRowsTemplate={'<span class="text-sm text-slate-400">위에서 대상을 골라 [담기]를 누르면 여기에 쌓입니다</span>'}
                        getRowId={(p) => lineKey(p.data)}
                        rowHeight={34}
                        headerHeight={38}
                        singleClickEdit={true}
                        stopEditingWhenCellsLoseFocus={true}
                        onCellValueChanged={onLineValueChanged}
                    />
                </div>
            </div>

            {/* 직접 추가 모달 */}
            {addOpen && (
                <StockAdjAddLineModal onClose={() => setAddOpen(false)} onPick={pickNewLine} />
            )}

            {/* 실행 확인 */}
            {confirmTargets && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/20"
                     onMouseDown={() => setConfirmTargets(null)}>
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[560px] flex flex-col gap-4"
                         onMouseDown={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-800">
                            재고조정 {confirmTargets.length}건을 실행하시겠습니까?
                        </h3>
                        <p className="text-sm text-slate-500">
                            장부 수량이 아래대로 바뀝니다. 취소는 없습니다 — 되돌리려면 반대 부호로 다시 조정합니다.
                        </p>
                        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                            {confirmTargets.map(r => (
                                <div key={lineKey(r)} className="flex flex-col gap-1 text-xs bg-slate-50 rounded-lg p-3">
                                    <div className="flex items-baseline gap-2 min-w-0">
                                        <b className="text-slate-700 truncate">{r.lotNo}</b>
                                        <span className="text-slate-400 truncate">{r.prodCd} {r.prodNm}</span>
                                        <span className="font-mono text-slate-400">{r.locCd}</span>
                                        <b className={`ml-auto shrink-0 ${Number(r.adjQty) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                            {num(r.adjBfrQty)} → {num(Number(r.adjBfrQty) + Number(r.adjQty))}
                                            <span className="ml-1 text-slate-400 font-normal">
                                                ({Number(r.adjQty) > 0 ? '+' : ''}{num(Number(r.adjQty))})
                                            </span>
                                        </b>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="w-16 text-slate-400 font-bold">사유</span>
                                        <b className="text-slate-600">{rsn.nm(r.rsnCd)}</b>
                                        {r.rsnCd === ETC_RSN_CD && <span className="text-slate-400 truncate">— {r.rsnDscr}</span>}
                                    </div>
                                    {r.hldId != null && (
                                        <div className="flex items-center gap-1.5 text-slate-500">
                                            <PauseCircle size={12} className="text-rose-500 shrink-0" />
                                            보류 <b className="text-slate-700">{r.hldNo}</b>에서 {num(-Number(r.adjQty))}개가
                                            함께 해제됩니다 (해제사유: 재고조정)
                                        </div>
                                    )}
                                    {r._new && (
                                        <div className="flex items-center gap-1.5 text-slate-500">
                                            <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                                            장부에 없던 재고 행이 <b className="text-slate-700">새로 생깁니다</b> — 온도대·적재가능수량은 검증하지 않습니다
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setConfirmTargets(null)} className="btn-modal-cancel">취소</button>
                            <button
                                onClick={() => { const t = confirmTargets; setConfirmTargets(null); doAdjust(t); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                                실행
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
