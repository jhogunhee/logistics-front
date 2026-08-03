import { TEMP_ZONE_META } from '@/api/prodApi';
import { LOC_TYPE_META } from '@/api/locApi';
import { ROW_STATUS_META } from '@/constants/rowStatus';

/**
 * 코드값 뱃지. 화면 12곳에 9줄짜리가 그대로 복붙돼 있던 것을 모았다.
 *
 * 라벨과 색은 `*_META` 상수가 갖는다 — 표시 스타일을 프론트 상수가 보유한다는 것은
 * 이미 정해진 사항이다(`docs/schema.sql`의 code_group 주석). 메타에 없는 값이면
 * 아무것도 렌더하지 않는다(null) — 공통코드에 값이 추가됐는데 여기 안 넣으면 빈 칸이 된다.
 */
export const Badge = ({ meta, value }) => {
    const m = meta?.[value];
    if (!m) return null;
    return (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${m.badge}`}>
            {m.label} {value}
        </span>
    );
};

/** 온도대 (DRY/CHL/FRZ) */
export const TempZoneBadge = ({ value }) => <Badge meta={TEMP_ZONE_META} value={value} />;

/** 로케이션 유형 (STAGE/STORAGE) */
export const LocTypeBadge = ({ value }) => <Badge meta={LOC_TYPE_META} value={value} />;

/**
 * 그리드 편집 행 상태 (C/U/D). 뱃지가 아니라 글자색만 바꾸는 형태라 위 Badge와 모양이 다르다 —
 * 코드값 뱃지는 서버가 준 값이고 이건 화면이 만든 편집 상태라 시각적으로 구분한다.
 */
export const RowStatusCell = ({ value }) => {
    const m = ROW_STATUS_META[value];
    if (!m) return null;
    return <span className={`text-[11px] font-bold ${m.cls}`}>{m.label}</span>;
};
