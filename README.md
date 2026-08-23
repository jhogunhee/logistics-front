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

환경변수는 `.env.local`에 넣는다(견본: `.env.example`). 전부 선택 사항이라 없어도 실행된다.

## 상품 이미지

`public/prod-img/{상품코드}.svg` — 프론트와 함께 배포되는 정적 파일이고, DB(`prod.img_url`)에는
`/prod-img/PROD-0001.svg` 같은 **루트 상대경로**가 들어간다. 상품이 시더로 고정된 데모라 그림도
시더 데이터의 일부로 보는 것이고, 그래서 외부 저장소·키·업로드 서버가 하나도 필요 없다.
도메인이 바뀌어도 주소가 그대로 산다.

지금 들어 있는 21개는 **자리표시용**이다 — 온도대 색 + 상품명 앞 두 글자로 서로 구분만 되게 그린
SVG다. 실물 사진으로 바꾸려면 같은 이름으로 덮어쓰면 되고, 확장자가 달라지면
(`PROD-0001.png` 등) `prod.img_url` 값도 함께 바꿔야 한다.

이미지가 없거나 주소가 깨진 상품은 화면이 폴백 아이콘을 그린다(`components/common/ProdThumb.jsx`).

화면에서 파일을 골라 올리는 기능은 **없다** — 그림을 넣거나 바꾸려면 `public/prod-img/{상품코드}.svg`를 넣고 배포한다.
상품 관리 화면의 「이미지 연결」은 선택한 상품의 `img_url`에 규칙 경로를 넣어 주고(주소를 손으로 치지 않는다),
「이미지 제거」는 값만 비운다 — 둘 다 파일은 건드리지 않고 저장을 눌러야 DB에 반영된다.
(한때 Supabase Storage 업로드 경로를 옵션으로 넣어 뒀다가 뺐다 — 켜지 않는 옵션은 남기지 않는다는 원칙.)

## 화면 구성 (계획)

- [ ] 마스터: 상품 관리 / 로케이션 관리
- [ ] 입고: 입고예정(ASN) 목록·상세 (검수/입고 처리, 마감) / 적치
- [ ] 재고: 현재고 조회 / 재고 이력(수불) / 이동·조정
- [ ] 출고: 출고 주문 (할당) / 피킹 / 출고 확정
- [ ] 대시보드: 입출고 KPI, 유통기한 임박 Lot 알림
- [ ] (선택) 할당 동시성 부하 측정 결과 뷰

상태 전이·재고 모델 설계는 백엔드 [docs/design.md](../wms-backend/docs/design.md) 참고.
