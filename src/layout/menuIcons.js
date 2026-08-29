import {
    ArrowLeftRight,
    Barcode,
    Box,
    Calculator,
    CheckCircle2,
    ClipboardCheck,
    ClipboardList,
    FileInput,
    FileOutput,
    FilePlus,
    Handshake,
    Hash,
    History,
    Layers,
    LayoutDashboard,
    LayoutGrid,
    List,
    ListChecks,
    ListTree,
    MapPin,
    PackageCheck,
    PackageOpen,
    PackagePlus,
    PauseCircle,
    Pin,
    Printer,
    Repeat,
    Ruler,
    ScrollText,
    Send,
    Settings2,
    ShieldCheck,
    Shuffle,
    SlidersHorizontal,
    Smartphone,
    Sparkles,
    Split,
    Store,
    Tags,
    Truck,
    Users,
    Waves,
} from 'lucide-react';

/**
 * 아이콘 이름 → lucide 컴포넌트. 메뉴는 DB(mnu.icon_nm)로 갔지만 아이콘은 컴포넌트라 담을 수 없어
 * 이름표만 여기 남는다. 메뉴가 늘어도 「새 아이콘 종류」가 필요할 때만 바뀐다.
 * 메뉴 관리 화면의 아이콘 드롭다운도 이 키 목록을 쓴다.
 */
export const MENU_ICONS = {
    ArrowLeftRight, Barcode, Box, Calculator, CheckCircle2, ClipboardCheck, ClipboardList,
    FileInput, FileOutput, FilePlus, Handshake, Hash, History, Layers, LayoutDashboard,
    LayoutGrid, List, ListChecks, ListTree, MapPin, PackageCheck, PackageOpen, PackagePlus,
    PauseCircle, Pin, Printer, Repeat, Ruler, ScrollText, Send, Settings2, ShieldCheck,
    Shuffle, SlidersHorizontal, Smartphone, Sparkles, Split, Store, Tags, Truck, Users, Waves,
};

/** 이름표에 없으면 기본 아이콘 — 시드나 관리 화면의 오타로 메뉴가 통째로 안 그려지지 않게 한다 */
export function menuIcon(name) {
    const found = MENU_ICONS[name];
    if (!found && import.meta.env.DEV) {
        console.warn(`[menu] 이름표에 없는 아이콘: ${name}`);
    }
    return found ?? MENU_ICONS.Box;
}
