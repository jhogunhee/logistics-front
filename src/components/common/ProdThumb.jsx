import { useState } from 'react';
import { ImageOff } from 'lucide-react';

/**
 * 상품 썸네일. 이미지가 없거나(미등록) 로드에 실패하면(객체 삭제 · URL 오타) 같은 크기의 폴백을 그린다.
 *
 * 폴백을 아이콘으로 그리는 이유 — 프로젝트에 placeholder 이미지 에셋이 없고, 그걸 하나 두면
 * 「없음」을 표현하려고 정적 파일과 그 경로를 관리해야 한다. 크기가 자리마다 달라서 하나로도 부족하다.
 *
 * `onError` 폴백이 이 컴포넌트의 핵심이다 — 상품을 지워도 Storage 객체는 남기는 정책이라
 * 반대로 객체만 사라지고 `prod.img_url`은 남는 상태가 정상적으로 생긴다. 그 상태를 화면이 흡수한다.
 *
 * 그리드 한 화면에 수십 개가 동시에 뜨므로 lazy 로드 · async 디코딩이 기본이다.
 */
/**
 * src가 바뀌면 안쪽을 통째로 새로 마운트해 실패 표시를 되돌린다 — ag-grid는 스크롤할 때
 * 같은 셀 인스턴스에 다른 행의 값을 넣으므로, 앞 행에서 깨진 이미지의 상태가 남으면
 * 멀쩡한 다음 상품이 「이미지 없음」으로 보인다.
 */
export const ProdThumb = (props) => <Thumb key={props.src} {...props} />;

const Thumb = ({ src, alt, size = 24, className = '' }) => {
    const [broken, setBroken] = useState(false);

    const box = `shrink-0 rounded bg-slate-100 border border-slate-200 ${className}`;
    const style = { width: size, height: size };

    if (!src || broken) {
        return (
            <span className={`${box} flex items-center justify-center text-slate-300`} style={style}
                  title={alt ? `${alt} — 이미지 없음` : '이미지 없음'}>
                <ImageOff size={Math.round(size * 0.55)} />
            </span>
        );
    }

    return (
        <img src={src} alt={alt ?? ''} title={alt} loading="lazy" decoding="async"
             onError={() => setBroken(true)}
             className={`${box} object-cover`} style={style} />
    );
};
