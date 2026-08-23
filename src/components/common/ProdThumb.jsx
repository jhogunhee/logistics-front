import { useState } from 'react';
import { ImageOff } from 'lucide-react';

import { PROD_THUMB_TINT, PROD_THUMB_TINT_FALLBACK, prodIconOf } from '@/constants/prodIcons';

/**
 * 상품 썸네일. `prod.img_url` 한 칸이 세 가지를 담고, 값의 생김새로 갈린다 —
 * `emoji:🥛` 아이콘(화면이 넣는 유일한 형태) / `https://…` 나 `/…` 이미지 주소.
 * 저장하는 쪽이 무엇을 골랐든 부르는 화면 다섯은 이 컴포넌트에 값만 넘기면 된다.
 *
 * 이미지가 없거나(미등록) 로드에 실패하면(객체 삭제 · URL 오타) 같은 크기의 폴백을 그린다.
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

const Thumb = ({ src, alt, tmpZon, size = 30, className = '' }) => {
    const [broken, setBroken] = useState(false);
    const style = { width: size, height: size };

    /*
     * 아이콘 이름이면 파일을 부르지 않는다 — 네트워크 요청도 onError도 없어서 깨질 일이 없다.
     * 배경 타일은 여기서 그린다. 아이콘은 그림과 달리 자기 배경이 없어 맨몸으로 두면
     * 그리드에서 글자처럼 떠 보이고, 정적 파일 썸네일과 크기감도 맞지 않는다.
     */
    const icon = prodIconOf(src);
    if (icon) {
        // 타일 색은 온도대를 따른다 — 이모지든 그림이든 같은 프레임에 들어가 한 세트로 읽힌다.
        // 글자라서 네트워크 요청도 onError도 없다.
        const tint = PROD_THUMB_TINT[tmpZon] ?? PROD_THUMB_TINT_FALLBACK;
        return (
            <span className={`shrink-0 rounded border flex items-center justify-center leading-none
                              select-none ${tint} ${className}`}
                  style={{ ...style, fontSize: Math.round(size * 0.62) }}
                  title={alt ? `${alt} — ${icon.label}` : icon.label}>
                {icon.ch}
            </span>
        );
    }

    // 이미지가 없을 때만 회색 박스를 그린다 — 「빈 자리」라는 표시가 그 박스다
    if (!src || broken) {
        return (
            <span className={`shrink-0 rounded bg-slate-100 border border-slate-200
                              flex items-center justify-center text-slate-300 ${className}`}
                  style={style} title={alt ? `${alt} — 이미지 없음` : '이미지 없음'}>
                <ImageOff size={Math.round(size * 0.55)} />
            </span>
        );
    }

    /*
     * 그림이 있으면 테두리도 바탕도 두지 않는다 — 상품 이미지는 저마다 자기 배경을 갖고 있어서
     * 회색 박스를 덧대면 액자가 두 겹이 되고, 그만큼 그림이 작아 보인다.
     * object-cover라 정사각형이 아닌 사진은 가운데를 채우도록 잘린다.
     */
    return (
        <img src={src} alt={alt ?? ''} title={alt} loading="lazy" decoding="async"
             onError={() => setBroken(true)}
             className={`shrink-0 rounded object-cover ${className}`} style={style} />
    );
};
