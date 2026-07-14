# WMS Frontend

[wms-backend](../wms-backend)의 대시보드/운영 화면. 입고 → 재고 → 출고 프로세스 UI.

## 기술 스택

- React 19 + Vite 7
- Tailwind CSS 3
- ag-grid (그리드), react-router 7, axios, react-hot-toast, lucide-react

## 실행

```bash
npm install
npm run dev   # http://localhost:5173
```

백엔드(`http://localhost:8080`)가 떠 있어야 API 연동 화면이 동작한다 (CORS는 백엔드에서 5173 허용).

## 화면 구성 (계획)

- [ ] 마스터: SKU 관리 / 로케이션 관리
- [ ] 입고: 입고예정(ASN) 목록·상세 (검수/입고 처리, 마감) / 적치
- [ ] 재고: 현재고 조회 / 재고 이력(수불) / 이동·조정
- [ ] 출고: 출고 주문 (할당) / 피킹 / 출고 확정
- [ ] 대시보드: 입출고 KPI, 유통기한 임박 Lot 알림
- [ ] (선택) 할당 동시성 부하 측정 결과 뷰

상태 전이·재고 모델 설계는 백엔드 [docs/design.md](../wms-backend/docs/design.md) 참고.
