import { useMemo } from 'react';

import { CODE128_QUIET, code128Bars } from '@/utils/code128';

/**
 * Code128 바코드 (SVG). 라벨 인쇄 화면이 쓰고, 인쇄 창으로는 이 SVG 마크업이 그대로 복사된다.
 *
 * 비트맵이 아니라 SVG인 이유 — 인쇄기 해상도에서 바 경계가 뭉개지면 인식률이 떨어진다.
 * `shapeRendering="crispEdges"`도 같은 이유로, 화면에서 안티앨리어싱이 바를 흐리게 만드는 것을 막는다.
 *
 * @param value       바코드에 담을 문자열 (ASCII 32~126)
 * @param moduleWidth 최소 단위(모듈) 1개의 픽셀 폭 — 이 값이 곧 바코드의 굵기다
 * @param height      바의 높이
 */
export function Barcode({ value, moduleWidth = 2, height = 44 }) {
    const enc = useMemo(() => code128Bars(value), [value]);

    if (!enc) {
        return (
            <span className="inline-flex items-center px-2 py-1 rounded bg-rose-50 text-rose-600 text-xs font-bold">
                바코드로 만들 수 없는 코드입니다
            </span>
        );
    }

    const width = (enc.modules + CODE128_QUIET * 2) * moduleWidth;
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
             shapeRendering="crispEdges" role="img" aria-label={`바코드 ${value}`}>
            <rect width={width} height={height} fill="#ffffff" />
            {enc.bars.map((b, i) => (
                <rect key={i} x={(CODE128_QUIET + b.x) * moduleWidth} y={0}
                      width={b.w * moduleWidth} height={height} fill="#000000" />
            ))}
        </svg>
    );
}
