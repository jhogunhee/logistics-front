import {BrowserRouter, Routes, Route} from "react-router-dom";
import {Toaster} from "react-hot-toast";

import Layout from "./layout/Layout";
import Login from "@/pages/auth/Login.jsx";
import Dashboard from "@/pages/dashboard/Dashboard.jsx";
import Placeholder from "@/pages/common/Placeholder.jsx";
import SkuMaster from "@/pages/master/SkuMaster.jsx";
import LocMaster from "@/pages/master/LocMaster.jsx";
import AsnList from "@/pages/inbound/AsnList.jsx";
import Receiving from "@/pages/inbound/Receiving.jsx";
import Putaway from "@/pages/inbound/Putaway.jsx";
import StockStatus from "@/pages/stock/StockStatus.jsx";
import InvHistory from "@/pages/stock/InvHistory.jsx";

export default function App() {
    return (
        <>
            <Toaster position="top-right"/>
            <BrowserRouter>
                <Routes>
                    {/* 로그인 (백엔드 인증 붙일 때 AuthRoute로 아래 영역을 감싼다) */}
                    <Route path="/login" element={<Login/>}/>

                    <Route element={<Layout/>}>
                        {/* 모니터링 */}
                        <Route index element={<Dashboard/>}/>

                        {/* 마스터 */}
                        <Route path="/master/sku" element={<SkuMaster/>}/>
                        <Route path="/master/location" element={<LocMaster/>}/>

                        {/* 입고: 입고예정(ASN) → 검수/입고 → 마감 → 적치 */}
                        <Route path="/inbound/asn" element={<AsnList/>}/>
                        <Route path="/inbound/receiving" element={<Receiving/>}/>
                        <Route path="/inbound/putaway" element={<Putaway/>}/>

                        {/* 재고 */}
                        <Route path="/stock/status" element={<StockStatus/>}/>
                        <Route path="/stock/history" element={<InvHistory/>}/>
                        <Route path="/stock/move" element={<Placeholder title="재고 이동/조정"/>}/>

                        {/* 출고: 주문 → 할당 → 피킹 → 출고확정 */}
                        <Route path="/outbound/orders" element={<Placeholder title="출고 주문"/>}/>
                        <Route path="/outbound/picking" element={<Placeholder title="피킹"/>}/>
                    </Route>
                </Routes>
            </BrowserRouter>
        </>
    );
}
