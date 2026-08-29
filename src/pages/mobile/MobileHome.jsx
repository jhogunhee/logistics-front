import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Calculator, ChevronRight, ClipboardCheck, Layers, Monitor, PackageOpen, PackagePlus, Search, Send } from 'lucide-react';

import { useAuth } from '@/auth/AuthContext';

/**
 * PDA에 열린 작업 화면들 — 실행(실적을 쌓는 행위)만 올린다. 지시 발행·관리는 데스크톱 몫.
 * 배치는 데스크톱 사이드바와 같은 업무 흐름 순서(입고 → 재고 → 출고)다 — 작업자가
 * 「물건이 흐르는 순서」로 찾게 하고, 두 화면 사이를 오가도 위치 감각이 유지되게 한다.
 *
 * roles는 백엔드 규칙표(SecurityConfig)의 접두와 짝이다 — 입고 화면은 /inbound, 재고는
 * /inventory, 출고는 /outbound를 부른다. 데스크톱 사이드바와 달리 그룹 단위 roles를 두지
 * 않는다 — 항목이 여덟뿐이라 2단으로 거를 이유가 없다.
 *
 * <b>현재고 조회는 담당을 가리지 않되 조회(INQ)에게는 열지 않는다.</b> 백엔드는 GET을 전부
 * authenticated로 두므로 이 제한은 백엔드가 아니라 여기만의 판단이다 — PDA는 실물을 앞에 두고
 * 일하는 현장 단말이고, INQ는 감사·교육처럼 창고에 들어가지 않는 사람에게 주는 역할이다.
 * 그래서 여덟 화면 모두 실행 역할에게만 보인다(INQ가 /m에 오면 안내만 뜬다).
 */
const GROUPS = [
    {
        title: '입고',
        items: [
            { to: '/m/receiving', label: '입고검수', desc: '하차 실물의 상품을 스캔해 수량·제조일자 입력', icon: ClipboardCheck,
              roles: ['ADMR', 'CENT_ADMR', 'IB_PIC'] },
            { to: '/m/putaway', label: '적치', desc: 'RCV-STAGE에서 지시된 보관 로케이션으로', icon: Layers,
              roles: ['ADMR', 'CENT_ADMR', 'IB_PIC'] },
        ],
    },
    {
        title: '재고',
        items: [
            // 현장에서 「이 자리에 뭐가 있나」는 담당을 가리지 않아 실행 역할 전부에게 연다
            { to: '/m/stock-inquiry', label: '현재고 조회', desc: '로케이션·상품을 스캔해 그 자리 재고 확인', icon: Search,
              roles: ['ADMR', 'CENT_ADMR', 'IB_PIC', 'INV_PIC', 'OUTB_PIC'] },
            { to: '/m/stock-move', label: '재고이동', desc: '이동지시 확정 — 출발 로케이션에서 도착 로케이션으로', icon: ArrowLeftRight,
              roles: ['ADMR', 'CENT_ADMR', 'INV_PIC'] },
            { to: '/m/stock-count', label: '재고조사', desc: '실사 카운트 — 블라인드 방식으로 실물 수량 입력', icon: Calculator,
              roles: ['ADMR', 'CENT_ADMR', 'INV_PIC'] },
        ],
    },
    {
        title: '출고',
        items: [
            { to: '/m/replenishment', label: '보충', desc: '수시보충 확정 — 보관존에서 피킹존으로, 짝 피킹지시가 열림', icon: PackagePlus,
              roles: ['ADMR', 'CENT_ADMR', 'OUTB_PIC'] },
            { to: '/m/picking', label: '피킹', desc: '집품 — 보관 로케이션에서 집어 SHIP-STAGE로', icon: PackageOpen,
              roles: ['ADMR', 'CENT_ADMR', 'OUTB_PIC'] },
            { to: '/m/shipping', label: '출고확정', desc: '상차 — 주문 라벨을 스캔해 SHIP-STAGE 반출 확정', icon: Send,
              roles: ['ADMR', 'CENT_ADMR', 'OUTB_PIC'] },
        ],
    },
];

/** PDA 홈 — 작업 종류를 고른다. 현장 화면이라 큰 터치 카드뿐이다 */
export default function MobileHome() {
    const { hasRole } = useAuth();

    // 항목을 거른 뒤 빈 그룹은 제목째 뺀다 — 카드 없는 「출고」 글자만 남으면 고장으로 보인다
    const groups = useMemo(() => GROUPS
        .map(g => ({ ...g, items: g.items.filter(i => !i.roles || hasRole(i.roles)) }))
        .filter(g => g.items.length > 0), [hasRole]);

    // 현장 작업이 하나도 없는 역할(조회) — 빈 화면을 주면 로딩 실패로 보인다.
    // 데스크톱으로 보내는 것이 답이라 그 길을 같이 준다(상단바 아이콘은 작아서 눈에 안 띈다)
    if (groups.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 h-full text-center px-6">
                <span className="w-14 h-14 rounded-2xl bg-slate-200 text-slate-400 flex items-center justify-center">
                    <Monitor size={26} />
                </span>
                <p className="font-bold text-slate-700">현장 작업 권한이 없습니다</p>
                <p className="text-sm text-slate-500">
                    PDA 화면은 실물을 앞에 두고 실적을 쌓는 자리입니다.<br />
                    조회는 데스크톱 화면에서 하세요.
                </p>
                <Link to="/" className="mt-1 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">
                    데스크톱 화면으로
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 h-full overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-800">작업 선택</h2>
            {groups.map(g => (
                <div key={g.title} className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-slate-400 px-1">{g.title}</p>
                    {g.items.map(t => (
                        <Link key={t.to} to={t.to}
                              className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4
                                         active:bg-indigo-50 transition-colors">
                            <span className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                <t.icon size={22} />
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className="block font-bold text-slate-800">{t.label}</span>
                                <span className="block text-xs text-slate-500 truncate">{t.desc}</span>
                            </span>
                            <ChevronRight size={18} className="text-slate-300 shrink-0" />
                        </Link>
                    ))}
                </div>
            ))}
        </div>
    );
}
