import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Printer } from 'lucide-react';
import toast from 'react-hot-toast';

import { invApi } from '@/api/invApi';
import { locApi } from '@/api/locApi';
import { prodApi } from '@/api/prodApi';
import { LOC_TYPE_META, TEMP_ZONE_META } from '@/constants/badgeMeta';
import { fmtDe } from '@/utils/format';
import { isCode128B } from '@/utils/code128';
import { Badge } from '@/components/common/Badge';
import { Barcode } from '@/components/common/Barcode';
import SearchBar, { SearchText } from '@/components/common/SearchBar';

/**
 * 라벨 종류. 창고가 스스로 채번한 코드만 여기서 발행한다 — 상품에 이미 인쇄돼 오는
 * 제조사 바코드(GTIN)는 우리가 만드는 것이 아니라 마스터에 매핑해 둘 대상이다.
 */
const TABS = [
    { key: 'LOC', label: '로케이션', memo: '랙·통로에 붙인다. 적치·피킹·이동·실사가 이걸 찍어 자리를 확인한다' },
    { key: 'PROD', label: '상품', memo: '자체 라벨이 필요한 상품에 붙인다' },
    { key: 'LOT', label: 'Lot', memo: '검수가 채번한 Lot을 팔레트·박스에 붙인다. 재고가 있는 Lot만 나온다' },
    { key: 'FREE', label: '직접 입력', memo: '문서번호 등 목록에 없는 코드 — 한 줄에 하나씩' },
];

/** 라벨 크기 — 모듈 폭이 곧 바코드 굵기다. 좁은 통로에서 멀리 찍어야 하면 큰 것을 쓴다 */
const SIZES = [
    { key: 'S', label: '소', mw: 2, h: 36, code: 'text-xs' },
    { key: 'M', label: '중', mw: 3, h: 52, code: 'text-sm' },
    { key: 'L', label: '대', mw: 4, h: 70, code: 'text-base' },
];

const COLUMN_DEFS = {
    LOC: [
        { field: 'locCd', headerName: '로케이션', flex: 1, minWidth: 150, cellClass: 'font-bold text-slate-700' },
        { field: 'zonCd', headerName: '존', width: 130, cellClass: 'text-slate-600' },
        {
            field: 'locTyp', headerName: '유형', width: 110,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={LOC_TYPE_META} value={p.value} />,
        },
    ],
    PROD: [
        { field: 'prodCd', headerName: '상품 코드', width: 150, cellClass: 'font-bold text-slate-700' },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 180 },
        {
            field: 'tmpZon', headerName: '온도대', width: 100,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            cellRenderer: (p) => <Badge meta={TEMP_ZONE_META} value={p.value} />,
        },
    ],
    LOT: [
        { field: 'lotNo', headerName: 'Lot번호', width: 170, cellClass: 'font-bold text-slate-700' },
        { field: 'prodCd', headerName: '상품 코드', width: 130, cellClass: 'text-slate-600' },
        { field: 'prodNm', headerName: '상품명', flex: 1, minWidth: 160 },
        {
            field: 'expiryDt', headerName: '유통기한', width: 120,
            cellRenderer: (p) => (p.value ? fmtDe(p.value) : <span className="text-slate-400">미관리</span>),
        },
    ],
};

/**
 * Lot 번호는 상품 안에서만 유일하다(같은 번호가 다른 상품에도 있다). 재고는 로케이션까지
 * 쪼개져 오므로 (상품, Lot)으로 접어야 라벨이 중복되지 않는다.
 */
const dedupeLots = (rows) => {
    const byKey = new Map();
    for (const r of rows) {
        const id = `${r.prodCd}|${r.lotNo}`;
        if (!byKey.has(id)) {
            byKey.set(id, { _id: id, lotNo: r.lotNo, prodCd: r.prodCd, prodNm: r.prodNm, expiryDt: r.expiryDt });
        }
    }
    return [...byKey.values()];
};

const EMPTY_COND = { locCd: '', prodCd: '', prodNm: '', lotNo: '' };

/** 종류별 대상 조회. 행마다 _id를 붙여 그리드가 선택을 유지할 키로 쓴다 */
const load = async (kind, cond) => {
    if (kind === 'FREE') return [];
    if (kind === 'LOC') {
        return (await locApi.list({ locCd: cond.locCd })).map(r => ({ ...r, _id: r.locCd }));
    }
    if (kind === 'PROD') {
        return (await prodApi.list({ prodCd: cond.prodCd, prodNm: cond.prodNm })).map(r => ({ ...r, _id: r.prodCd }));
    }
    // Lot은 마스터 목록이 상품 단위라, 라벨을 붙일 대상인 「재고가 있는 Lot」을 현재고에서 뽑는다
    return dedupeLots(await invApi.list({ prodCd: cond.prodCd, lotNo: cond.lotNo }));
};

/** 선택 행 → 라벨 { code(바코드에 담을 값), memo(밑에 적을 설명) } */
const toLabel = (kind, row) => {
    if (kind === 'LOC') return { key: row._id, code: row.locCd, memo: `${row.zonCd} · ${LOC_TYPE_META[row.locTyp]?.label ?? row.locTyp}` };
    if (kind === 'PROD') return { key: row._id, code: row.prodCd, memo: row.prodNm };
    return { key: row._id, code: row.lotNo, memo: `${row.prodNm}${row.expiryDt ? ` · ~${fmtDe(row.expiryDt)}` : ''}` };
};

/**
 * 라벨 인쇄 (마스터). <b>PDA가 찍을 바코드를 발행하는 화면</b> — 로케이션 · 상품 · Lot 코드를
 * Code128 라벨로 만들어 인쇄한다. 창고를 세팅할 때 로케이션마다, 검수가 Lot을 채번할 때마다
 * 라벨이 있어야 현장 화면(스캔)이 성립하므로 그 짝을 이 화면이 맡는다.
 *
 * 인쇄는 새 창을 열어서 한다 — 앱 셸이 화면 높이에 맞춰 스크롤을 가두고 있어서, 그대로
 * 인쇄하면 보이는 만큼만 잘려 나온다. 새 창에는 라벨만 넣어 페이지가 자연스럽게 넘어가게 한다.
 */
export default function LabelPrint() {
    const [kind, setKind] = useState('LOC');
    const [cond, setCond] = useState({ locCd: '', prodCd: '', prodNm: '', lotNo: '' });
    const [rows, setRows] = useState([]);
    const [selected, setSelected] = useState([]);
    const [freeText, setFreeText] = useState('');
    const [sizeKey, setSizeKey] = useState('M');
    const sheetRef = useRef(null);

    const size = SIZES.find(s => s.key === sizeKey);
    const labels = useMemo(() => {
        if (kind !== 'FREE') return selected.map(r => toLabel(kind, r));
        // 직접 입력은 한 줄이 라벨 하나다. 빈 줄과 중복은 걸러 종이를 낭비하지 않는다
        const seen = new Set();
        return freeText.split('\n').map(l => l.trim()).filter(l => {
            if (!l || seen.has(l)) return false;
            seen.add(l);
            return true;
        }).map(code => ({ key: code, code, memo: '' }));
    }, [kind, selected, freeText]);
    const invalid = useMemo(() => labels.filter(l => !isCode128B(l.code)), [labels]);

    const search = () => {
        setSelected([]);
        load(kind, cond).then(setRows).catch(() => {});
    };

    useEffect(() => {
        load('LOC', EMPTY_COND).then(setRows).catch(() => {});
    }, []);

    const onSelectionChanged = (e) => setSelected(e.api.getSelectedRows());

    /** 탭 전환은 조건 필드부터 다르다 — 조건 · 입력 · 선택을 비우고 그 종류를 새로 조회한다 */
    const changeKind = (next) => {
        setKind(next);
        setCond(EMPTY_COND);
        setFreeText('');
        setSelected([]);
        setRows([]);
        load(next, EMPTY_COND).then(setRows).catch(() => {});
    };

    // ── 인쇄 ──────────────────────────────────────────────────
    const handlePrintClick = () => {
        if (labels.length === 0) {
            toast('인쇄할 라벨을 고르세요.');
            return;
        }
        if (invalid.length > 0) {
            toast.error(`바코드로 만들 수 없는 코드가 ${invalid.length}건 있습니다: ${invalid[0].code}`);
            return;
        }
        // 앱의 스타일시트를 그대로 넘겨야 새 창에서도 미리보기와 같은 모양으로 찍힌다.
        // link는 outerHTML 대신 해석된 절대주소를 쓴다 — 새 창은 about:blank라 상대경로가 풀리지 않는다
        const styles = [...document.querySelectorAll('style')].map(n => n.outerHTML).join('')
            + [...document.querySelectorAll('link[rel="stylesheet"]')]
                .map(n => `<link rel="stylesheet" href="${n.href}">`).join('');
        const win = window.open('', '_blank');
        if (!win) {
            toast.error('팝업이 차단됐습니다 — 이 사이트의 팝업을 허용한 뒤 다시 인쇄하세요.');
            return;
        }
        win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>라벨 인쇄</title>${styles}`
            + '<style>@page{margin:10mm}body{margin:0;background:#fff}</style></head>'
            + `<body>${sheetRef.current.outerHTML}</body>`
            + '<script>window.onload=function(){window.focus();window.print();};</script></html>');
        win.document.close();
    };

    return (
        <div className="flex flex-col gap-4 h-full min-h-[36rem]">
            {/* 타이틀 */}
            <div className="flex items-center gap-2">
                <Printer size={18} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">라벨 인쇄</h2>
                <span className="text-xs text-slate-400 mt-0.5">
                    PDA가 찍을 Code128 바코드를 발행합니다 — 화면의 라벨을 그대로 스캔해 볼 수도 있습니다
                </span>
            </div>

            {/* 탭 — 라벨 종류마다 대상 목록과 검색 조건이 다르다 */}
            <div className="flex items-center gap-3 shrink-0">
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => changeKind(t.key)}
                            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors
                                ${kind === t.key
                                    ? 'bg-white text-indigo-700 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'}`}>
                            {t.label}
                        </button>
                    ))}
                </div>
                <span className="text-xs text-slate-400 truncate">{TABS.find(t => t.key === kind).memo}</span>
            </div>

            {kind !== 'FREE' && (
                <SearchBar cond={cond} setCond={setCond} onSearch={search}>
                    {kind === 'LOC' && <SearchText name="locCd" label="로케이션" placeholder="DRY-A" />}
                    {kind === 'PROD' && <SearchText name="prodCd" label="상품 코드" placeholder="PROD-0001" />}
                    {kind === 'PROD' && <SearchText name="prodNm" label="상품명" placeholder="삼다수" />}
                    {kind === 'LOT' && <SearchText name="prodCd" label="상품 코드" placeholder="PROD-0001" />}
                    {kind === 'LOT' && <SearchText name="lotNo" label="Lot번호" placeholder="LOT-260718" />}
                </SearchBar>
            )}

            {/* 상: 대상 고르기 / 하: 라벨 미리보기 — 미리보기가 곧 인쇄물이다 */}
            <PanelGroup direction="vertical" autoSaveId="master-label-split-v1" className="flex-1 min-h-0">
                <Panel defaultSize={45} minSize={20} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">
                            {kind === 'FREE' ? '코드 입력' : '라벨 대상'}
                        </span>
                        <span className="text-xs text-slate-400 truncate">
                            {kind === 'FREE'
                                ? '한 줄에 하나씩 — 빈 줄과 중복은 알아서 걸러집니다'
                                : '체크한 것이 아래 라벨이 됩니다'}
                        </span>
                        {kind !== 'FREE' && (
                            <span className="text-xs text-slate-500 font-medium ml-auto shrink-0">
                                선택 {selected.length} / {rows.length}건
                            </span>
                        )}
                    </div>
                    <div className="flex-1 min-h-0">
                        {kind === 'FREE' ? (
                            <textarea
                                value={freeText}
                                onChange={(e) => setFreeText(e.target.value)}
                                placeholder={'OB-20260826-001\nIB-20260823-002'}
                                className="input-base w-full h-full font-mono resize-none"
                            />
                        ) : (
                            <AgGridReact
                                rowData={rows}
                                columnDefs={COLUMN_DEFS[kind]}
                                getRowId={(p) => p.data._id}
                                rowHeight={34}
                                headerHeight={38}
                                rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false }}
                                onSelectionChanged={onSelectionChanged}
                                overlayNoRowsTemplate={'<span class="text-sm text-slate-400">대상이 없습니다</span>'}
                            />
                        )}
                    </div>
                </Panel>

                <PanelResizeHandle className="h-2.5 flex items-center justify-center group cursor-row-resize">
                    <div className="h-1 w-16 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-data-[resize-handle-active]:bg-indigo-500 transition-colors" />
                </PanelResizeHandle>

                <Panel defaultSize={55} minSize={25} className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 shrink-0">라벨 미리보기</span>
                        <span className="text-xs text-slate-400 truncate">{labels.length}장</span>
                        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg ml-auto shrink-0">
                            {SIZES.map(s => (
                                <button
                                    key={s.key}
                                    onClick={() => setSizeKey(s.key)}
                                    title={`모듈 ${s.mw}px`}
                                    className={`px-2.5 py-1 rounded text-[12px] font-bold transition-colors
                                        ${sizeKey === s.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                        <button onClick={handlePrintClick} className="btn-primary shrink-0">
                            <Printer size={13} /> 인쇄
                        </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                        {labels.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center mt-10">
                                {kind === 'FREE' ? '위에 코드를 입력하세요' : '위에서 라벨로 만들 대상을 체크하세요'}
                            </p>
                        ) : (
                            // 인쇄 창으로 이 노드의 마크업을 그대로 복사한다 — 미리보기와 인쇄물이 어긋나지 않는다
                            <div ref={sheetRef} className="flex flex-wrap gap-2 content-start">
                                {labels.map(l => <LabelCard key={l.key} label={l} size={size} />)}
                            </div>
                        )}
                    </div>
                </Panel>
            </PanelGroup>
        </div>
    );
}

/** 라벨 한 장 — 바코드 + 코드값 + 설명. 코드값을 같이 찍는 것은 규격 권고다(바코드가 상하면 사람이 읽어 입력한다) */
function LabelCard({ label, size }) {
    return (
        <div className="border border-slate-300 rounded bg-white px-3 py-2 flex flex-col items-start break-inside-avoid">
            <Barcode value={label.code} moduleWidth={size.mw} height={size.h} />
            <span className={`mt-1 font-mono font-bold tracking-wide text-slate-900 ${size.code}`}>{label.code}</span>
            {label.memo && <span className="text-[11px] text-slate-500 max-w-full truncate">{label.memo}</span>}
        </div>
    );
}
