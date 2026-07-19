import {NavLink} from "react-router-dom";
import {
    ArrowLeftRight,
    Barcode,
    Box,
    ClipboardCheck,
    History,
    LayoutDashboard,
    MapPin,
    PackageOpen,
    Truck,
    Warehouse,
} from "lucide-react";

const MenuGroup = ({ title, children }) => (
    <div className="mb-5">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-2 px-4">
            {title}
        </div>
        <div className="space-y-0.5">{children}</div>
    </div>
);

const MenuItem = ({ to, label, icon: Icon, badge }) => (
    <NavLink
        to={to}
        className={({ isActive }) =>
            `flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
            ${
                isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                    : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
            }`
        }
    >
        <div className="flex items-center gap-3">
            {Icon && <Icon size={20} />}
            {label}
        </div>
        {badge && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {badge}
            </span>
        )}
    </NavLink>
);

export default function Sidebar() {
    return (
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
            {/* 로고 영역 */}
            <div className="flex items-center gap-3 px-6 h-20">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
                    <Warehouse size={24} className="text-white" />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800 leading-none">WMS</h3>
                    <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span> 운영 중
                    </p>
                </div>
            </div>

            {/* 메뉴 영역 */}
            <nav className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <MenuGroup title="모니터링">
                    <MenuItem to="/" label="대시보드" icon={LayoutDashboard} />
                    <MenuItem to="/stock/status" label="현재고 조회" icon={Box} />
                </MenuGroup>

                <MenuGroup title="마스터">
                    <MenuItem to="/master/sku" label="SKU 관리" icon={Barcode} />
                    <MenuItem to="/master/location" label="로케이션 관리" icon={MapPin} />
                </MenuGroup>

                <MenuGroup title="입고">
                    <MenuItem to="/inbound/asn" label="입고예정(ASN)" icon={Truck} />
                    <MenuItem to="/inbound/receiving" label="입고검수" icon={ClipboardCheck} />
                    <MenuItem to="/inbound/putaway" label="적치" icon={PackageOpen} />
                </MenuGroup>

                <MenuGroup title="재고">
                    <MenuItem to="/stock/history" label="재고 이력" icon={History} />
                    <MenuItem to="/stock/move" label="이동/조정" icon={ArrowLeftRight} />
                </MenuGroup>

                <MenuGroup title="출고">
                    <MenuItem to="/outbound/orders" label="출고 주문" icon={ClipboardCheck} />
                    <MenuItem to="/outbound/picking" label="피킹" icon={PackageOpen} />
                </MenuGroup>
            </nav>

            {/* 하단 사용자 정보 */}
            <div className="p-4 bg-slate-50 border-t border-slate-200">
                <div className="flex items-center gap-3 px-2 py-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                        A
                    </div>
                    <span className="text-sm font-semibold text-slate-700">관리자</span>
                </div>
            </div>
        </aside>
    );
}
