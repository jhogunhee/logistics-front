import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Monitor } from 'lucide-react';

import { useAuth } from '@/auth/AuthContext';
import { menuIcon } from '@/layout/menuIcons';

/**
 * 카드 설명 — mnu 테이블에는 설명 컬럼이 없어(메뉴 목록이 담을 것은 「무엇이 있나」까지다)
 * 여기 남는다. 경로가 키다. 없으면 설명 줄만 빠지고 카드는 그대로 그려진다.
 */
const DESC = {
    '/m/receiving': '하차 실물의 상품을 스캔해 수량·제조일자 입력',
    '/m/putaway': 'RCV-STAGE에서 지시된 보관 로케이션으로',
    '/m/stock-inquiry': '로케이션·상품을 스캔해 그 자리 재고 확인',
    '/m/stock-move': '이동지시 확정 — 출발 로케이션에서 도착 로케이션으로',
    '/m/stock-count': '실사 카운트 — 블라인드 방식으로 실물 수량 입력',
    '/m/replenishment': '수시보충 확정 — 보관존에서 피킹존으로, 짝 피킹지시가 열림',
    '/m/picking': '집품 — 보관 로케이션에서 집어 SHIP-STAGE로',
    '/m/shipping': '상차 — 주문 라벨을 스캔해 SHIP-STAGE 반출 확정',
};

/**
 * PDA 홈 — 작업 종류를 고른다. 현장 화면이라 큰 터치 카드뿐이다.
 *
 * 무엇을 보여줄지는 서버가 정한다(mnu의 dvsn='PDA' + mnu_role). 배치는 srt_seq 순이고,
 * 시드가 데스크톱 사이드바와 같은 업무 흐름 순서(입고 → 재고 → 출고)를 준다 — 작업자가
 * 「물건이 흐르는 순서」로 찾게 하고, 두 화면을 오가도 위치 감각이 유지되게 한다.
 *
 * <b>조회(INQ)에게는 PDA 메뉴를 하나도 켜 두지 않았다</b> — PDA는 실물을 앞에 두고 실적을
 * 쌓는 자리이고, INQ는 감사·교육처럼 창고에 들어가지 않는 사람에게 주는 역할이다.
 * 그 판단은 이제 코드가 아니라 권한 화면에서 바뀐다.
 */
export default function MobileHome() {
    const { menus } = useAuth();

    const groups = useMemo(() => {
        const byGroup = new Map();
        menus.filter(m => m.dvsn === 'PDA')
            .slice()
            .sort((a, b) => a.srtSeq - b.srtSeq)
            .forEach(m => {
                if (!byGroup.has(m.grpNm)) byGroup.set(m.grpNm, []);
                byGroup.get(m.grpNm).push({
                    to: m.scrnPth, label: m.mnuNm, desc: DESC[m.scrnPth] ?? '', icon: menuIcon(m.iconNm),
                });
            });
        return [...byGroup.entries()].map(([title, items]) => ({ title, items }));
    }, [menus]);

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
