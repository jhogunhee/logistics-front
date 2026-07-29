import {BrowserRouter, Routes, Route} from "react-router-dom";
import {Toaster} from "react-hot-toast";

import Layout from "./layout/Layout";
import Login from "@/pages/auth/Login.jsx";
import Dashboard from "@/pages/dashboard/Dashboard.jsx";
import Placeholder from "@/pages/common/Placeholder.jsx";
import ProdMaster from "@/pages/master/ProdMaster.jsx";
import UomMaster from "@/pages/master/UomMaster.jsx";
import ZonMaster from "@/pages/master/ZonMaster.jsx";
import LocMaster from "@/pages/master/LocMaster.jsx";
import VendorMaster from "@/pages/master/VendorMaster.jsx";
import NbrRuleMaster from "@/pages/master/NbrRuleMaster.jsx";
import CodeMaster from "@/pages/master/CodeMaster.jsx";
import InboundOrder from "@/pages/oms/InboundOrder.jsx";
import InboundOrderList from "@/pages/oms/InboundOrderList.jsx";
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

                        {/* OMS: 주문 원장 (WMS 입고예정/출고주문의 발생지) */}
                        <Route path="/oms/inbound-order" element={<InboundOrder/>}/>
                        {/* 관리 화면에서 주문번호를 눌러 들어오는 수정 경로. 같은 컴포넌트가 id 유무로 갈린다 */}
                        <Route path="/oms/inbound-order/:omsIbOrderId" element={<InboundOrder/>}/>
                        <Route path="/oms/inbound-orders" element={<InboundOrderList/>}/>
                        <Route path="/oms/outbound-order" element={<Placeholder title="출고주문"/>}/>
                        <Route path="/oms/outbound-orders" element={<Placeholder title="출고주문 관리"/>}/>

                        {/* 입고: ASN → 검수 → 적치지시 → 적치 → 입고확정 */}
                        <Route path="/inbound/asn" element={<AsnList/>}/>
                        <Route path="/inbound/receiving" element={<Receiving/>}/>
                        <Route path="/inbound/putaway-order" element={<Placeholder title="적치지시"/>}/>
                        <Route path="/inbound/putaway" element={<Putaway/>}/>
                        <Route path="/inbound/close" element={<Placeholder title="입고확정"/>}/>

                        {/* 재고 */}
                        <Route path="/stock/status" element={<StockStatus/>}/>
                        <Route path="/stock/history" element={<InvHistory/>}/>
                        <Route path="/stock/attribute" element={<Placeholder title="재고 속성변경"/>}/>
                        <Route path="/stock/hold" element={<Placeholder title="재고 보류"/>}/>
                        <Route path="/stock/move" element={<Placeholder title="재고 이동"/>}/>
                        <Route path="/stock/count" element={<Placeholder title="재고조사"/>}/>

                        {/* 출고: 웨이브 편성 → 할당 → 피킹지시 → 피킹 → 출고확정 */}
                        <Route path="/outbound/wave" element={<Placeholder title="웨이브 편성"/>}/>
                        <Route path="/outbound/allocation" element={<Placeholder title="할당"/>}/>
                        <Route path="/outbound/pick-order" element={<Placeholder title="피킹지시"/>}/>
                        <Route path="/outbound/picking" element={<Placeholder title="피킹"/>}/>
                        <Route path="/outbound/shipping" element={<Placeholder title="출고확정"/>}/>

                        {/* 마스터 */}
                        <Route path="/master/prod" element={<ProdMaster/>}/>
                        <Route path="/master/uom" element={<UomMaster/>}/>
                        <Route path="/master/zone" element={<ZonMaster/>}/>
                        <Route path="/master/location" element={<LocMaster/>}/>
                        <Route path="/master/vendor" element={<VendorMaster/>}/>
                        <Route path="/master/store" element={<Placeholder title="점포 관리"/>}/>
                        <Route path="/master/putaway-strategy" element={<Placeholder title="적치 전략관리"/>}/>
                        <Route path="/master/nbr-rules" element={<NbrRuleMaster/>}/>
                        <Route path="/master/codes" element={<CodeMaster/>}/>
                    </Route>
                </Routes>
            </BrowserRouter>
        </>
    );
}
