import { Construction } from "lucide-react";

/** 아직 구현 전인 화면의 자리표시자. 실제 화면 구현 시 라우트에서 교체한다. */
export default function Placeholder({ title }) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-3">
            <Construction size={40} />
            <p className="text-base font-bold text-slate-500">{title}</p>
            <p className="text-sm">준비 중인 화면입니다.</p>
        </div>
    );
}
