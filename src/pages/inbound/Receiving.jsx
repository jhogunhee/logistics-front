import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ClipboardCheck, History, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { ibOrderApi } from '@/api/ibOrderApi';
import { ASN_STATUS_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { eaQtyPerInbUomOf, fmtDt, num, todayStr, daysAheadStr } from '@/utils/format';
import SearchBar, { SearchItem, SearchText, SearchDateRange } from '@/components/common/SearchBar';
import { Badge } from '@/components/common/Badge';
import ConfirmModal from '@/components/common/ConfirmModal';
import VendorPickerModal from '@/components/common/VendorPickerModal';
import DateCellEditor from '@/components/common/DateCellEditor';

// 낱개(EA) 저장값(예정/누계/잔량)을 검수 입력 단위인 입고단위로 환산해 표시.
// 입고단위로 딱 안 떨어지는 값(단위 변경 전 데이터)은 소수로 그대로 보여준다 — 반올림해서 감추면 잔량이 왜곡된다
const inInbUom = (eaQty, line) => Math.round((eaQty / eaQtyPerInbUomOf(line)) * 100) / 100;

// 유통기한 미리보기 = 제조일자 + 유통기한일수 — 서버 계산(LotIssuer: mfgDt.plusDays(shelfLifeDays))과 같은 식.
// 문자열 파싱으로 로컬 날짜를 만든다 (new Date('YYYY-MM-DD')는 UTC라 KST에서 하루 밀릴 수 있다)
const expiryPreview = (mfgDt, shelfLifeDays) => {
    if (!mfgDt || shelfLifeDays == null) return null;
    const [y, m, d] = mfgDt.split('-').map(Number);
    const dt = new Date(y, m - 1, d + shelfLifeDays);
    const p = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

// 검수 이력 등 낱개(EA) 저장값 1건 표시: 입고단위로 떨어지면 "2 BOX (48 EA)" 병기, 아니면 낱개 그대로 "N EA".
// EA를 병기하는 이유 — 취소·재고 대조 시점엔 재고(EA)에서 얼마나 빠지는지가 보여야 한다.
// 입력 그리드에는 EA를 노출하지 않는다(셀 때는 세는 단위 하나만) — 병기는 장부를 만지는 자리 몫이다
const fmtStoredQty = (eaQty, line) => {
    if (!line) return `${num(eaQty)}개`;
    const unit = eaQtyPerInbUomOf(line);
    if (unit <= 1 || eaQty % unit !== 0) return `${num(eaQty)} EA`;
    return `${num(eaQty / unit)} ${line.inbUomCd} (${num(eaQty)} EA)`;
};

const HEADER_COLUMN_DEFS = [
    { headerName: 'No.', width: 60, valueGetter: (p) => p.node.rowIndex + 1, cellClass: 'text-slate-400' },
    { field: 'ibNo', headerName: '입고번호', width: 170 },
    {
        field: 'status', headerName: '입고진행상태', width: 130,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p) => <Badge meta={ASN_STATUS_META} value={p.value} show="label" />,
    },
    { field: 'vndrNm', headerName: '벤더', flex: 1, minWidth: 110 },
    { field: 'expctDe', headerName: '입고 예정일', width: 120 },
    {
        headerName: '검수 진행', width: 100, cellClass: 'ag-right-aligned-cell',
        headerTooltip: '전량 검수된 라인 / 전체 라인 (부분 검수중인 라인은 제외)',
        valueGetter: (p) => `${num(p.data.cmplLineCount)} / ${num(p.data.lineCount)}`,
    },
    // 수량 합계 컬럼은 두지 않는다 — 생수 2박스와 김밥 3개가 섞인 낱개 합계는 진행 파악에 도움이 안 된다
    {
        field: 'inspDt', headerName: '최종 검수일시', width: 150,
        headerTooltip: '이 입고건에서 마지막으로 검수한 시각 — 검수중인 건이 여럿일 때 하다 만 건을 찾는다',
        valueFormatter: (p) => fmtDt(p.value),
    },
];

export default function Receiving() {
    // 기본 검색 = 오늘 ~ +7일 (입고주문·출고주문·ASN 관리와 통일. 예정일이 과거인 지연 도착은 기본 조회에 안 잡힌다)
    const [cond, setCond] = useState({ ibNo: '', vndrNm: '', dateFrom: todayStr(), dateTo: daysAheadStr(7) });
    const [rowData, setRowData] = useState([]);
    const [lineRows, setLineRows] = useState([]);
    const [inspTarget, setInspTarget] = useState(null);
    const [receipts, setReceipts] = useState([]); // 선택한 입고건의 검수 이력 전부 (최근 순)
    const [violations, setViolations] = useState([]); // 검수 제약 위반 목록 — 저장 거부 응답의 violations
    const [tab, setTab] = useState('input'); // 'input' 검수 입력 / 'history' 검수 이력
    const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
    const [receiveConfirm, setReceiveConfirm] = useState(null); // 검수 저장 확인 모달 대상 라인들
    const [cancelReceiptTarget, setCancelReceiptTarget] = useState(null); // 검수 취소 확인 대상 (receipt 1건)
    const gridRef = useRef(null);
    const lineGridRef = useRef(null);
    // 재조회 후 행을 다시 선택하던 ref는 없앴다 — 헤더 그리드의 getRowId가 선택을 유지한다
    // 진행 중 상세 조회 무효화 토큰 — 응답 대기 중에 선택이 바뀌거나 비워지면 낡은 응답을 버린다
    const detailSeq = useRef(0);

    const canReceive = !!inspTarget && ['SCHEDULED', 'RECEIVING'].includes(inspTarget.status);
    const canCancelReceipt = !!inspTarget && inspTarget.status === 'RECEIVING';

    // 라인 그리드: 작업 순서대로 [식별 → 단위·예정·잔량 → 입력 3개(파란색, 연속 배치)]를 앞에 두고,
    // 환산·누계 등 참고용은 뒤로 보낸다 (입력 컬럼이 가로 스크롤 없이 바로 보이게)
    const lineColumnDefs = [
        { field: 'prodCd', headerName: '상품 코드', width: 105 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 180 },
        {
            field: 'tmpZon', headerName: '온도대', width: 90,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
        },
        {
            field: 'inbUomCd', headerName: '단위', width: 64,
            headerTooltip: '검수 입력 단위 = 입고단위(발주단위). 예정/잔량/검수누계도 이 단위로 환산해 표시',
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600">
                    {p.value}
                </span>
            ),
        },
        {
            headerName: '예정', width: 70, cellClass: 'ag-right-aligned-cell',
            headerTooltip: '입고 예정 수량 (입고단위)',
            valueGetter: (p) => inInbUom(p.data.expctQty, p.data),
            valueFormatter: (p) => num(p.value),
        },
        {
            headerName: '잔량', width: 70,
            headerTooltip: '예정 - 검수누계 (입고단위). 아직 도착하지 않았거나 검수 전인 수량',
            valueGetter: (p) => inInbUom(p.data.expctQty - p.data.rcvdQty, p.data),
            valueFormatter: (p) => num(p.value),
            cellClass: (p) => p.value < 0 ? 'ag-right-aligned-cell text-red-500 font-bold' : 'ag-right-aligned-cell',
        },
        {
            field: '_inspectQty', headerName: '검수수량', width: 95, editable: canReceive,
            cellDataType: 'number',
            cellEditor: 'agNumberCellEditor', cellEditorParams: { min: 1, precision: 0 },
            valueFormatter: (p) => num(p.value),
            cellClass: 'ag-right-aligned-cell bg-indigo-50',
            headerTooltip: '이번에 개수 확인한 입고단위 개수 — 잔량 이내 정수만 (전량 재고로 입고)',
        },
        {
            // 입고일자를 제조일자보다 앞에 둔다 — 제조일자 달력의 상한이 입고일자라 먼저 정해지는 게 맞고
            // (소급 등록 때 특히), 제조일자가 뒤로 가면서 만료일 미리보기(유통기한)와 바로 붙는다
            field: '_receiptDt', headerName: '입고일자', width: 110, editable: canReceive,
            cellDataType: false,   // 제조일자와 같은 이유 (아래 주석)
            cellEditor: DateCellEditor,
            cellClass: 'bg-indigo-50',
            headerTooltip: '실제 입고된 날 (소급 등록 시 과거로 변경). Lot 번호 채번 기준',
        },
        {
            field: '_mfgDt', headerName: '제조일자', width: 110,
            editable: (p) => canReceive && p.data.shelfLifeDays != null,
            // cellDataType는 끈다 (예전엔 'dateString'이었다). 그 설정은 ag-grid 기본 날짜
            // 에디터에 파서를 물리려던 것인데, 에디터를 DateCellEditor로 바꾼 지금은 방해만 한다 —
            // dateString의 valueParser가 「유효한 날짜가 아니면 버린다」라서 빈 문자열이 통과하지
            // 못하고, 제조일자를 지워도 옛 값이 그대로 남는다. 우리 에디터는 언제나
            // 'YYYY-MM-DD' 아니면 '' 만 내보내므로 타입 추론이 필요 없다.
            cellDataType: false,
            cellEditor: DateCellEditor,
            // 달력 상한 = 입고일자 (제조일자는 입고보다 미래일 수 없다 — 저장 검증과 같은 규칙)
            cellEditorParams: (p) => ({ max: p.data._receiptDt || todayStr() }),
            cellClass: 'bg-indigo-50',
            headerTooltip: '유통기한 = 제조일자 + 유통기한(일). 유통기한 미관리 상품은 입력 없음',
            cellRenderer: (p) => p.data.shelfLifeDays == null
                ? <span className="text-slate-400">미관리</span>
                : p.value,
        },
        // 낱개환산 컬럼은 뺐다 — 입력 중에는 입고단위 하나만 보인다. EA가 필요한 순간은
        // 저장 확인 모달(낱개 합계)과 검수 이력의 병기 표기가 맡는다.
        // 검수누계·검수이력 컬럼은 두지 않는다 — 잔량 = 예정 − 누계라 셋 중 둘이면 충분하고,
        // 누계 확인과 취소는 「검수 이력」 탭이 통째로 맡는다
        {
            // 일수(마스터값)가 아니라 계산된 만료일을 보여준다 — 제조일자를 넣는 순간 서버가 Lot에
            // 기록할 값이 미리 보여, 연도 오타 같은 오입력을 이 자리에서 잡는다. 입력 전에는 일수를 흐리게
            headerName: '유통기한', width: 110, cellClass: 'ag-right-aligned-cell',
            headerTooltip: '제조일자 + 유통기한일수 — 저장 시 Lot에 기록될 만료일 미리보기. 제조일자 입력 전에는 일수 표시',
            valueGetter: (p) => expiryPreview(p.data._mfgDt, p.data.shelfLifeDays),
            cellRenderer: (p) => {
                if (p.data.shelfLifeDays == null) return <span className="text-slate-400">미관리</span>;
                return p.value ?? <span className="text-slate-400">{num(p.data.shelfLifeDays)}일</span>;
            },
        },
    ];

    // 검수 이력 그리드. 어느 상품인지가 행마다 필요하다 — 입고건 전체를 한 자리에 모으기 때문이다
    const receiptColumnDefs = [
        {
            field: 'createdAt', headerName: '검수일시', width: 150,
            valueFormatter: (p) => fmtDt(p.value),
        },
        { field: 'prodCd', headerName: '상품 코드', width: 105 },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 180 },
        {
            headerName: '검수수량', width: 150,
            headerTooltip: '이 건에서 검수한 수량 — 입고단위, 괄호는 재고에서 빠질 낱개(EA) 환산. 취소된 건은 취소선으로 표시된다',
            valueGetter: (p) => fmtStoredQty(p.data.qty, p.data),
            // 취소된 건은 수량에 줄을 긋는다 — 흐리게만 두면 훑을 때 유효한 건과 섞여 보인다
            cellClass: (p) => p.data.cancelled
                ? 'ag-right-aligned-cell line-through text-slate-400'
                : 'ag-right-aligned-cell',
        },
        { field: 'lotNo', headerName: 'Lot번호', width: 140 },
        { field: 'receiptDt', headerName: '입고일자', width: 110 },
        {
            field: 'mfgDt', headerName: '제조일자', width: 110,
            cellRenderer: (p) => p.value ?? <span className="text-slate-400">미관리</span>,
        },
        {
            headerName: '취소', width: 80,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => p.data.cancelled
                ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-500">취소됨</span>
                : canCancelReceipt && (
                    <button
                        onClick={() => setCancelReceiptTarget(p.data)}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-800">
                        취소
                    </button>
                ),
        },
    ];

    const clearDetail = () => {
        detailSeq.current++;
        setInspTarget(null);
        setLineRows([]);
        setReceipts([]);
    };

    /**
     * 선택한 입고건의 라인과 검수 이력을 읽는다.
     * 선택할 때만이 아니라 검수 저장·취소 뒤에도 직접 부른다 — 헤더 그리드에 getRowId가 붙어
     * 목록을 다시 읽어도 선택이 유지되므로 selectionChanged가 다시 발생하지 않기 때문이다.
     * 원격 DB라 응답까지 초 단위가 걸린다 — 기다리는 사이 선택이 바뀌면(seq 불일치) 낡은 응답을 버린다.
     * 안 버리면 지워진 선택의 라인이 되살아나, 라인은 떠 있는데 검수 입력이 잠긴 화면이 된다.
     */
    const loadDetail = async (asn) => {
        const seq = ++detailSeq.current;
        setViolations([]);
        const receipts = await ibOrderApi.orderReceipts(asn.ibOrderId);
        if (seq !== detailSeq.current) return;
        setReceipts(receipts);
        const lines = await ibOrderApi.lines(asn.ibOrderId);
        if (seq !== detailSeq.current) return;
        // 입고일자는 전 라인, 제조일자는 유통기한 관리 상품만 입력
        // (입고일자만 기본값 오늘 — 제조일자는 거의 항상 과거라 오늘 기본값은 그럴듯한 오답, 직접 입력을 강제한다)
        setLineRows(lines.map(l => ({
            ...l,
            _inspectQty: null, // 숫자 에디터라 빈 값은 ''가 아니라 null (''는 텍스트로 추론돼 에디터가 안 붙는다)
            _receiptDt: todayStr(),
            _mfgDt: '',
        })));
    };

    // 검수 작업 화면이므로 검수/취소가 아직 의미 있는 것만 보여준다 (확정된 입고는 닫힌 문서라 제외)
    const fetchList = async (keepSelection = false) => {
        if (!keepSelection) {
            // 비우는 것은 응답 후가 아니라 조회를 누르는 순간이다 — 응답 뒤에 비우면 조회~응답 사이에
            // 사용자가 새로 선택한 것을 지워버려, 라인은 떠 있는데 검수 입력이 잠기는 경쟁이 생긴다(2026-08-14).
            // 그리드 선택도 같이 풀어야 한다 — getRowId가 하이라이트를 유지해서, 안 풀면 상태만 비워지고
            // 같은 행을 다시 클릭해도 selectionChanged가 울리지 않아 라인을 다시 못 연다.
            gridRef.current?.api?.deselectAll();
            clearDetail();
        }
        const data = await ibOrderApi.listForInsp(cond);
        const rows = data.filter(a => a.status !== 'CONFIRMED');
        setRowData(rows);

        if (!keepSelection) return;
        // 선택한 건의 헤더 값(상태·검수 진행)도 새로 받은 것으로 바꾼다 — 옛 값을 들고 있으면
        // 검수 진행·잔량 표시가 방금 저장한 것과 어긋나 보인다
        const fresh = rows.find(a => a.ibOrderId === inspTarget?.ibOrderId) ?? null;
        if (fresh) {
            setInspTarget(fresh);
            await loadDetail(fresh);
        } else {
            clearDetail();
        }
    };

    // 최초 1회 조회 (검색조건 기본값 = 오늘 ~ +7일)
    useEffect(() => {
        ibOrderApi.listForInsp(cond).then(data => {
            setRowData(data.filter(a => a.status !== 'CONFIRMED'));
        });
    }, []);

    // 헤더 행 선택 시 라인 조회 + 검수 입력 컬럼 초기화
    const onSelectionChanged = async (e) => {
        const node = e.api.getSelectedNodes()[0];
        if (!node) {
            clearDetail();
            return;
        }
        setInspTarget(node.data);
        await loadDetail(node.data);
    };

    // ── 검수 저장 ────────────────────────────────────────────
    const handleReceiveClick = () => {
        if (!canReceive) {
            toast.error('검수할 입고건을 선택하세요.');
            return;
        }
        lineGridRef.current.api.stopEditing();
        const rows = [];
        lineGridRef.current.api.forEachNode(n => rows.push(n.data));
        const targets = rows.filter(r => String(r._inspectQty ?? '').trim() !== '');
        if (targets.length === 0) {
            toast('검수수량을 입력한 라인이 없습니다.');
            return;
        }
        for (const r of targets) {
            const inspect = Number(r._inspectQty);
            if (!(inspect > 0) || !Number.isInteger(inspect)) {
                toast.error(`검수수량은 입고단위(${r.inbUomCd}) 1 이상 정수여야 합니다: ${r.prodCd}`);
                return;
            }
            // 과입고 차단 — 잔량 비교는 낱개(저장 단위 EA)로 한다 (서버도 같은 검증을 하지만 저장 전에 거른다)
            const remaining = r.expctQty - r.rcvdQty;
            if (inspect * eaQtyPerInbUomOf(r) > remaining) {
                toast.error(`검수수량이 잔량(${fmtStoredQty(remaining, r)})을 초과합니다: ${r.prodCd}`);
                return;
            }
            if (!String(r._receiptDt || '').trim()) {
                toast.error(`입고일자를 입력하세요: ${r.prodCd}`);
                return;
            }
            if (r.shelfLifeDays != null && !String(r._mfgDt || '').trim()) {
                toast.error(`제조일자를 입력하세요: ${r.prodCd}`);
                return;
            }
            if (r.shelfLifeDays != null && r._mfgDt > r._receiptDt) {
                toast.error(`제조일자가 입고일자보다 미래일 수 없습니다: ${r.prodCd}`);
                return;
            }
        }
        setReceiveConfirm(targets);
    };

    const doReceive = async (targets) => {
        try {
            setViolations([]);
            setLineRows(prev => prev.map(r => ({ ...r, _violationMsg: null })));
            await ibOrderApi.receive(inspTarget.ibOrderId, {
                lines: targets.map(r => ({
                    ibLineId: r.ibLineId,
                    inspectQty: Number(r._inspectQty),
                    receiptDt: r._receiptDt,
                    mfgDt: r.shelfLifeDays != null ? r._mfgDt : null,
                })),
            });
            toast.success(`${targets.length}개 라인 검수를 저장했습니다.`);
            fetchList(true);
        } catch (e) {
            // 검수 제약 위반 — 서버가 라인·규칙 단위 위반 목록을 함께 준다 (저장은 전체 거부됨).
            // 배너에 더해 위반 라인 행을 붉게 표시한다
            const v = e.response?.data?.violations;
            if (v?.length) {
                setViolations(v);
                setLineRows(prev => prev.map(r => {
                    const msgs = v.filter(x => x.ibLineId === r.ibLineId)
                        .map(x => `${x.ruleName}: ${x.message}`);
                    return { ...r, _violationMsg: msgs.length > 0 ? msgs.join('\n') : null };
                }));
            }
            toast.error(e.message || '검수 저장에 실패했습니다.');
        }
    };

    // 확인 모달 합계 — 라인마다 입력 단위(BOX/PLT)가 달라 낱개(EA)로 통일해 합산한다 (입고주문 화면과 같은 기준)
    const receiveSummary = (targets) =>
        targets.reduce((s, r) => s + Number(r._inspectQty) * eaQtyPerInbUomOf(r), 0);

    // ── 검수 이력 / 취소 ─────────────────────────────────────
    // 이력은 입고건 단위로 한 번에 받는다. 취소하면 라인 수량이 바뀌므로 목록·라인도 함께 다시 읽는다.
    // 확정된 입고는 결품까지 못박힌 닫힌 문서라 취소 불가 (서버도 같은 검증을 한다)
    const doCancelReceipt = async (receipt) => {
        try {
            await ibOrderApi.cancelReceipt(inspTarget.ibOrderId, receipt.invHistId);
            toast.success('검수를 취소했습니다.');
            await fetchList(true); // 라인 수량이 줄어드므로 목록·라인·이력을 함께 다시 읽는다
        } catch (e) {
            toast.error(e.message || '검수 취소에 실패했습니다.');
        }
    };

    // 검수 입력 탭에는 아직 할 일이 남은 라인만 둔다 — 전량 검수된 라인은 입력할 것이 없고,
    // 예전에 그 라인들을 남겨둔 이유(이력을 열어 취소해야 해서)는 이력 탭이 생기며 사라졌다
    const pendingLineRows = lineRows.filter(r => r.expctQty - r.rcvdQty > 0);

    return (
        // min-h — 노트북처럼 낮은 화면에선 그리드를 짜부라뜨리는 대신 카드 스크롤(Layout의 overflow-auto)이 생긴다
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <ClipboardCheck size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">입고 검수</h2>
                <span className="text-xs text-slate-400 mt-0.5">확정 전 입고만 표시 · 합격분은 RCV-STAGE로 입고 · 검수 취소는 확정 전, 적치 안 된 수량만 가능</span>
            </div>

            {/* 검색 조건 */}
            <SearchBar cond={cond} setCond={setCond} onSearch={() => fetchList()}>
                <SearchText name="ibNo" label="입고번호" placeholder="IB-20260717-001" />
                <SearchItem label="벤더">
                    <button
                        type="button"
                        onClick={() => setVendorPickerOpen(true)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-left flex items-center justify-between gap-2 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400">
                        <span className={`truncate ${cond.vndrNm ? 'text-slate-700' : 'text-slate-400'}`}>
                            {cond.vndrNm || '전체'}
                        </span>
                        {cond.vndrNm
                            ? <X
                                size={13}
                                title="벤더 조건 지우기"
                                className="shrink-0 text-slate-400 hover:text-slate-600"
                                onClick={(e) => { e.stopPropagation(); setCond(prev => ({ ...prev, vndrNm: '' })); }}
                            />
                            : <Search size={13} className="shrink-0 text-slate-400" />}
                    </button>
                </SearchItem>
                <SearchDateRange from="dateFrom" to="dateTo" label="입고예정일" />
            </SearchBar>

            {/* 상하 분할 + 드래그 스플리터 — 경계를 끌어 비율 조절 (비율은 localStorage에 기억됨) */}
            <PanelGroup direction="vertical" autoSaveId="wms-receiving-split-v3" className="flex-1 min-h-0">
                <Panel defaultSize={40} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center">
                        <span className="text-xs text-slate-500 font-medium">{num(rowData.length)}건</span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <AgGridReact
                            ref={gridRef}
                            rowData={rowData}
                            columnDefs={HEADER_COLUMN_DEFS}
                            rowHeight={34}
                            headerHeight={38}
                            // 행 식별자를 주지 않으면 목록이 다시 올 때 ag-grid가 전부 새 행으로 보고 선택을 버린다.
                            // 그러면 라인을 기다리는 사이(onSelectionChanged의 await) 선택이 풀려 inspTarget이
                            // null이 되고, 라인은 떠 있는데 검수 입력 칸이 잠긴다(canReceive가 inspTarget을 본다).
                            // StrictMode가 최초 조회를 두 번 돌리기 때문에 목록이 뜨자마자 클릭하면 바로 걸렸다.
                            getRowId={(p) => p.data.ibNo}
                            rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                            onSelectionChanged={onSelectionChanged}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={60} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                            {/* 입력과 이력을 탭으로 나눈다 — 이력이 자기 자리를 가지면 입력 탭은 남은 일만 들면 된다 */}
                            <div className="flex items-center gap-1 shrink-0">
                                {/* 두 숫자는 세는 대상이 다르다 — 입력은 남은 「라인」, 이력은 검수한 「건」이다.
                                    한 번 저장하면 라인마다 이력이 1건씩 생기고 분할입고면 더 늘어난다.
                                    나란히 놓으면 비교하게 되므로 단위를 글자로 붙여 구분한다 */}
                                {[
                                    { key: 'input', label: '검수 입력', count: pendingLineRows.length, unit: '줄', icon: ClipboardCheck },
                                    // 취소된 건은 목록엔 남기고(append-only 원장이라 지우지 않는다) 숫자에서는 뺀다 —
                                    // 3건 넣고 2건 취소했는데 「3건」으로 뜨면 들어온 양을 잘못 읽는다
                                    { key: 'history', label: '검수 이력', count: receipts.filter(r => !r.cancelled).length, unit: '건', icon: History },
                                ].map(t => (
                                    <button
                                        key={t.key}
                                        onClick={() => setTab(t.key)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-lg transition-colors ${
                                            tab === t.key
                                                ? 'bg-indigo-50 text-indigo-700'
                                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                                        <t.icon size={13} />
                                        {t.label}
                                        <span className={`text-[11px] font-bold ${tab === t.key ? 'text-indigo-400' : 'text-slate-400'}`}>
                                            {t.count}{t.unit}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <span className="text-xs text-slate-400 truncate">
                                {!inspTarget
                                    ? '위에서 입고건을 선택하세요'
                                    : tab === 'input'
                                        ? `${inspTarget.ibNo} · ${inspTarget.vndrNm} — 파란 컬럼에 이번 검수분 입력 (검수수량은 입고단위 개수)`
                                        : `${inspTarget.ibNo} · ${inspTarget.vndrNm} — 검수한 건을 되돌립니다 (적치된 수량이 있으면 거부)`}
                            </span>
                        </div>
                        {tab === 'input' && (
                            <button
                                onClick={handleReceiveClick}
                                className="btn-primary shrink-0">
                                <ClipboardCheck size={13} /> 검수 저장
                            </button>
                        )}
                    </div>
                    {/* 검수 제약 위반 배너 — 저장이 전체 거부됐음을 라인·규칙 단위로 보여준다 */}
                    {violations.length > 0 && (
                        <div className="border border-rose-200 bg-rose-50 rounded-xl px-4 py-3 flex flex-col gap-1.5 shrink-0">
                            <span className="text-xs font-bold text-rose-700">
                                검수 제약 위반 {violations.length}건 — 저장이 거부되었습니다 (전체 롤백)
                            </span>
                            {violations.map((v, i) => (
                                <div key={i} className="text-[11px] text-rose-600 leading-relaxed">
                                    <b>{v.prodCd}</b> · {v.ruleName} — {v.message}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex-1 min-h-0">
                        {tab === 'input' ? (
                            inspTarget && pendingLineRows.length === 0 ? (
                                // 빈 그리드만 남으면 고장 난 줄 안다 — 어디로 갔는지 말해준다
                                <div className="h-full flex flex-col items-center justify-center gap-1 text-slate-400">
                                    <ClipboardCheck size={22} />
                                    <span className="text-sm font-bold">검수할 라인이 없습니다</span>
                                    <span className="text-xs">전량 검수된 라인은 「검수 이력」 탭에서 확인·취소합니다</span>
                                </div>
                            ) : (
                                <AgGridReact
                                    ref={lineGridRef}
                                    rowData={pendingLineRows}
                                    columnDefs={lineColumnDefs}
                                    rowHeight={34}
                                    getRowId={(p) => String(p.data.ibLineId)}
                                    stopEditingWhenCellsLoseFocus={true}
                                    getRowStyle={(p) => p.data._violationMsg ? { background: '#fff1f2' } : undefined}
                                />
                            )
                        ) : (
                            <AgGridReact
                                rowData={receipts}
                                columnDefs={receiptColumnDefs}
                                rowHeight={34}
                                getRowId={(p) => String(p.data.invHistId)}
                                // 취소된 건은 원장에 그대로 남는다(append-only) — 지우지 않고 뒤로 물린다.
                                // 취소선과 「취소됨」 뱃지가 구분을 맡으므로 여기서는 살짝만 흐리게 한다
                                // (많이 흐리면 정작 무엇을 취소했는지 읽히지 않는다)
                                getRowStyle={(p) => p.data.cancelled ? { opacity: 0.6 } : undefined}
                            />
                        )}
                    </div>
                </Panel>
            </PanelGroup>

            {/* 벤더 선택 팝업 — 자유 입력 대신 팝업에서 고른다 (OMS 주문목록과 같은 방식, vndrNm contains 검색) */}
            <VendorPickerModal
                open={vendorPickerOpen}
                onClose={() => setVendorPickerOpen(false)}
                onSelect={(v) => setCond(prev => ({ ...prev, vndrNm: v.vndrNm }))}
            />

            {/* 검수 저장 확인 모달 */}
            {receiveConfirm && (
                <ConfirmModal
                    title="검수를 저장하시겠습니까?"
                    confirmText="저장"
                    onCancel={() => setReceiveConfirm(null)}
                    onConfirm={() => { doReceive(receiveConfirm); setReceiveConfirm(null); }}
                >
                    <p className="text-sm text-slate-500">
                        {receiveConfirm.length}개 라인 · 총 검수수량 <b className="text-emerald-600">{num(receiveSummary(receiveConfirm))}</b> 낱개
                    </p>
                    <p className="text-xs text-slate-400">검수수량은 RCV-STAGE 재고로 즉시 반영됩니다.</p>
                </ConfirmModal>
            )}

            {/* 검수 취소 확인 모달 */}
            {cancelReceiptTarget && (
                <div className="fixed inset-0 z-[60] flex items-start justify-center pt-16 bg-black/30">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-slate-800">검수를 취소하시겠습니까?</h3>
                        <p className="text-sm text-slate-500">
                            {cancelReceiptTarget.prodCd} {cancelReceiptTarget.prodNm} ·{' '}
                            <b>{fmtStoredQty(cancelReceiptTarget.qty, cancelReceiptTarget)}</b> · {cancelReceiptTarget.lotNo}
                        </p>
                        <p className="text-xs text-slate-400">이미 적치된 수량이 있으면 취소할 수 없습니다.</p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setCancelReceiptTarget(null)}
                                className="btn-modal-cancel">
                                닫기
                            </button>
                            <button
                                onClick={() => { doCancelReceipt(cancelReceiptTarget); setCancelReceiptTarget(null); }}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700">
                                검수취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
