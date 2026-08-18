import { Info } from 'lucide-react';

/** 마스터 영역 필드 (라벨 위 / 입력 아래) */
export default function FormField({ label, required, hint, children, className = '' }) {
    return (
        <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
            <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                {label}
                {required && <span className="text-red-500 font-black">*</span>}
                {/* 힌트는 아이콘 툴팁으로 — 문구 줄을 없애 마스터 영역 높이를 상품 리스트에 양보 */}
                {hint && (
                    <span title={hint} className="cursor-help">
                        <Info size={12} className="text-slate-300" />
                    </span>
                )}
            </label>
            {children}
        </div>
    );
}
