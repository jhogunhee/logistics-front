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
import InspectionPolicy from "@/pages/strategy/InspectionPolicy.jsx";
import PutawayStrategy from "@/pages/strategy/PutawayStrategy.jsx";
import WaveStrategy from "@/pages/strategy/WaveStrategy.jsx";
import AllocationStrategy from "@/pages/strategy/AllocationStrategy.jsx";
import InboundOrder from "@/pages/oms/InboundOrder.jsx";
import InboundOrderList from "@/pages/oms/InboundOrderList.jsx";
import OutboundOrder from "@/pages/oms/OutboundOrder.jsx";
import OutboundOrderList from "@/pages/oms/OutboundOrderList.jsx";
import AsnList from "@/pages/inbound/AsnList.jsx";
import Receiving from "@/pages/inbound/Receiving.jsx";
import Putaway from "@/pages/inbound/Putaway.jsx";
import StockStatus from "@/pages/stock/StockStatus.jsx";
import InvHistory from "@/pages/stock/InvHistory.jsx";
import StockMove from "@/pages/stock/StockMove.jsx";
import StockHold from "@/pages/stock/StockHold.jsx";
import StockCount from "@/pages/stock/StockCount.jsx";
import StockAttr from "@/pages/stock/StockAttr.jsx";
import OutbOrderList from "@/pages/outbound/OutbOrderList.jsx";
import Wave from "@/pages/outbound/Wave.jsx";
import Allocation from "@/pages/outbound/Allocation.jsx";

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
                        <Route path="/oms/outbound-order" element={<OutboundOrder/>}/>
                        {/* 입고주문과 같은 규칙 — 관리 화면에서 주문번호를 눌러 들어오는 수정 경로 */}
                        <Route path="/oms/outbound-order/:omsOutbOrderId" element={<OutboundOrder/>}/>
                        <Route path="/oms/outbound-orders" element={<OutboundOrderList/>}/>

                        {/* 입고: ASN → 검수 → 적치지시 → 적치 → 입고확정 */}
                        <Route path="/inbound/asn" element={<AsnList/>}/>
                        <Route path="/inbound/receiving" element={<Receiving/>}/>
                        <Route path="/inbound/putaway-order" element={<Placeholder title="적치지시"/>}/>
                        <Route path="/inbound/putaway" element={<Putaway/>}/>
                        <Route path="/inbound/close" element={<Placeholder title="입고확정"/>}/>

                        {/* 재고 */}
                        <Route path="/stock/status" element={<StockStatus/>}/>
                        <Route path="/stock/history" element={<InvHistory/>}/>
                        {/* 재고 속성변경 — Lot 속성(제조일자·유통기한) 정정. 재고는 움직이지 않는다. 탭으로 정정/이력을 오간다 */}
                        <Route path="/stock/attribute" element={<StockAttr/>}/>
                        {/* 재고 보류 (수량 방식 — 등록 즉시 가용 차감). 메뉴는 하나 — 화면 안 탭으로 등록/관리/실적을 오간다 */}
                        <Route path="/stock/hold" element={<StockHold/>}/>
                        {/* 재고 이동 2단계(지시=예약 → 확정). 메뉴는 하나 — 화면 안 탭으로 등록/관리를 오간다 */}
                        <Route path="/stock/move" element={<StockMove/>}/>
                        {/* 재고조사(실사) — 재고 수량 정정의 유일한 경로. 탭으로 조사 목록/실사 입력을 오간다 */}
                        <Route path="/stock/count" element={<StockCount/>}/>

                        {/* 출고: 출고예정 → 웨이브 편성 → 할당 → 피킹지시 → 피킹 → 출고확정 */}
                        {/* 입고예정(ASN)과 같은 자리 — OMS 출고주문 확정이 만든 창고 문서를 조회한다 */}
                        <Route path="/outbound/order" element={<OutbOrderList/>}/>
                        <Route path="/outbound/wave" element={<Wave/>}/>
                        {/* 할당은 웨이브를 대상으로 실행하고 결과는 주문 라인에 남는다 */}
                        <Route path="/outbound/allocation" element={<Allocation/>}/>
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
                        <Route path="/master/nbr-rules" element={<NbrRuleMaster/>}/>
                        <Route path="/master/codes" element={<CodeMaster/>}/>

                        {/* 전략: 관리자가 정의하는 실행 정책 (기준정보와 달리 "어떻게 판단할지"를 담는다).
                            백엔드 API 접두(/strategy)와 경로를 맞춘다 */}
                        <Route path="/strategy/inspection" element={<InspectionPolicy/>}/>
                        <Route path="/strategy/putaway" element={<PutawayStrategy/>}/>
                        <Route path="/strategy/wave" element={<WaveStrategy/>}/>
                        <Route path="/strategy/allocation" element={<AllocationStrategy/>}/>
                    </Route>
                </Routes>
            </BrowserRouter>
        </>
    );
}
