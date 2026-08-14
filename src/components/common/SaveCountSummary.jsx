/**
 * 저장 확인 모달의 신규/수정/삭제 건수 요약 한 줄.
 * prefix로 대상 이름(선택 상품·그룹 등)을 앞에 붙일 수 있다.
 */
export default function SaveCountSummary({ rows, prefix }) {
    return (
        <p className="text-sm text-slate-500">
            {prefix}
            신규 <b className="text-blue-500">{rows.filter(r => r._status === 'C').length}</b>건 ·
            수정 <b className="text-amber-500">{rows.filter(r => r._status === 'U').length}</b>건 ·
            삭제 <b className="text-red-500">{rows.filter(r => r._status === 'D').length}</b>건
        </p>
    );
}
