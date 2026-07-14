import { Box, PackageOpen, Truck } from "lucide-react";

const StatCard = ({ title, value, icon: Icon }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            {Icon && <Icon size={22} />}
        </div>
        <div>
            <p className="text-xs text-slate-400 font-medium">{title}</p>
            <p className="text-xl font-bold text-slate-800">{value}</p>
        </div>
    </div>
);

export default function Dashboard() {
    // TODO: 백엔드 API 연동 후 실제 집계로 교체
    return (
        <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4">대시보드</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard title="금일 입고 진행" value="-" icon={Truck} />
                <StatCard title="금일 출고 진행" value="-" icon={PackageOpen} />
                <StatCard title="총 재고 SKU" value="-" icon={Box} />
            </div>
        </div>
    );
}
