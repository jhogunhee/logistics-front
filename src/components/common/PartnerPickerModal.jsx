import { useEffect, useMemo, useState } from 'react';
import { Building2, Search, Store, X } from 'lucide-react';

import { storeApi } from '@/api/storeApi';
import { vendorApi } from '@/api/vendorApi';

/**
 * 받아 둔 목록 — 모듈에 둔다. 팝업은 닫히면 언마운트되므로 컴포넌트 안에 두면
 * 열 때마다 다시 받는다. 마스터라 세션 중에 바뀔 일이 드물어 한 번이면 족하다.
 */
let cachedRows = null;

/**
 * 상대처(벤더 · 점포) 선택 팝업.
 *
 * 벤더와 점포를 <b>한 목록에 합쳐</b> 보여준다. 입고 문서의 상대처는 정상 발주면 벤더,
 * 반품입고면 점포이고(`ck_ib_order_vndr_store`가 둘 중 하나만 채워지게 강제한다),
 * 서버의 상대처 검색도 <b>이름 하나로 둘 다</b> 훑는다
 * (`vendor.vndrNm contains … or store.storeNm contains …`).
 * 그런데 화면에는 벤더 피커만 있어 <b>반품입고 상대처는 손으로 타이핑</b>해야 했다 —
 * 서버가 이미 답할 수 있는 절반을 화면이 물어보지 못하던 자리다.
 *
 * 넘겨주는 값은 <b>이름</b>이다(id가 아니다). 서버 계약이 이름 부분일치라, 고른 값을
 * 그대로 검색어로 쓰면 기존 화면들과 같은 방식이 된다.
 *
 * 목록은 처음 열 때 한 번만 받고 검색은 클라이언트에서 건다 — 마스터라 건수가 적고
 * 자주 바뀌지 않아서, 타이핑마다 서버를 때리는 것보다 즉시 반응하는 쪽이 낫다.
 *
 * @param open     열림 여부
 * @param onClose  닫기
 * @param onSelect 선택 확정. `{ kind: 'VENDOR' | 'STORE', code, name }`을 넘긴다
 */

export default function PartnerPickerModal({ open, ...props }) {
    // 안쪽을 갈아 끼워 검색어·탭이 열 때마다 초기 상태로 돌아간다 —
    // effect에서 상태를 되돌리는 것보다 단순하고, 닫힌 사이의 잔상이 남지 않는다
    return open ? <PartnerPicker {...props} /> : null;
}

function PartnerPicker({ onClose, onSelect }) {
    const [rows, setRows] = useState(cachedRows);   // null = 아직 안 받아옴
    const [kind, setKind] = useState('ALL');        // ALL | VENDOR | STORE
    const [keyword, setKeyword] = useState('');

    useEffect(() => {
        if (rows !== null) return undefined;
        let ignore = false;
        Promise.all([vendorApi.list(), storeApi.list()])
            .then(([vendors, stores]) => {
                if (ignore) return;
                cachedRows = [
                    // 부가정보 한 칸으로 합친다 — 벤더는 담당자·연락처, 점포는 그룹·유형이라
                    // 컬럼을 나누면 한쪽이 늘 비고 헤더 이름도 한쪽에만 맞는다
                    ...vendors.map(v => ({
                        key: `V${v.vendorId}`, kind: 'VENDOR', code: v.vndrCd, name: v.vndrNm,
                        sub: [v.picNm, v.telNo].filter(Boolean).join(' · ') || '-',
                    })),
                    ...stores.map(s => ({
                        key: `S${s.storeId}`, kind: 'STORE', code: s.storeCd, name: s.storeNm,
                        sub: [s.storeGrp, s.storeTyp].filter(Boolean).join(' · ') || '-',
                    })),
                ];
                setRows(cachedRows);
            })
            // 한쪽이 실패해도 빈 목록으로 열어 둔다 — 검색 조건 하나라 화면을 막을 이유가 없다
            .catch(() => { if (!ignore) setRows([]); });   // 실패는 캐시하지 않는다 — 다음에 다시 받는다
        return () => { ignore = true; };
    }, [rows]);

    const filtered = useMemo(() => {
        if (!rows) return [];
        const kw = keyword.trim().toLowerCase();
        return rows.filter(r => (kind === 'ALL' || r.kind === kind)
            // 코드·이름·담당자 어디에 걸려도 찾히게 한다 — 한 칸으로 끝내는 게 실사용에 편하다
            && (!kw || r.code.toLowerCase().includes(kw)
                || r.name.toLowerCase().includes(kw)
                || r.sub.toLowerCase().includes(kw)));
    }, [rows, keyword, kind]);

    const TABS = [{ v: 'ALL', label: '전체' }, { v: 'VENDOR', label: '벤더' }, { v: 'STORE', label: '점포' }];

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/20" onMouseDown={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-[720px] max-h-[80vh] flex flex-col"
                 onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Building2 size={16} className="text-indigo-600" />
                        <h3 className="text-base font-bold text-slate-800">상대처 선택</h3>
                        <span className="text-xs text-slate-400">행을 클릭하면 선택됩니다</span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)}
                               placeholder="코드 · 이름 · 담당자로 검색" autoFocus
                               className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm
                                          focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
                    </div>
                    {/* 벤더·점포를 가르는 탭 — 합쳐 두면 이름이 비슷할 때 어느 쪽인지 좁히기 어렵다 */}
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium shrink-0">
                        {TABS.map(t => (
                            <button key={t.v} type="button" onClick={() => setKind(t.v)}
                                    className={`px-3 py-2 ${kind === t.v
                                        ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3 px-6 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-500 shrink-0">
                    <span className="w-16 shrink-0">구분</span>
                    <span className="w-28 shrink-0">코드</span>
                    <span className="flex-1 min-w-0">이름</span>
                    <span className="w-52 shrink-0">담당자 · 연락처 / 그룹 · 유형</span>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
                    {rows === null && <div className="py-16 text-center text-sm text-slate-400">불러오는 중…</div>}
                    {rows !== null && filtered.length === 0 && (
                        <div className="py-16 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                            <Search size={20} className="text-slate-300" />
                            조건에 맞는 상대처가 없습니다
                        </div>
                    )}
                    {filtered.map(r => (
                        <div key={r.key}
                             onClick={() => { onSelect(r); onClose(); }}
                             className="flex items-center gap-3 px-6 py-2 cursor-pointer hover:bg-slate-50">
                            <span className="w-16 shrink-0">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    r.kind === 'VENDOR' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                    {r.kind === 'VENDOR' ? <Building2 size={10} /> : <Store size={10} />}
                                    {r.kind === 'VENDOR' ? '벤더' : '점포'}
                                </span>
                            </span>
                            {/* 코드가 길면 잘라 낸다 — 테스트로 들어간 긴 코드가 이름 칸을 덮은 적이 있다 */}
                            <span className="w-28 shrink-0 truncate text-sm font-medium text-slate-700" title={r.code}>{r.code}</span>
                            <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{r.name}</span>
                            <span className="w-52 shrink-0 truncate text-sm text-slate-500">{r.sub}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
