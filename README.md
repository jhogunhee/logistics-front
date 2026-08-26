# WMS Frontend

창고관리시스템(WMS)의 운영 화면. 데스크톱 관리 화면과 현장 실행용 PDA 화면으로 나뉜다.

- 데모: https://wareflow-27p.pages.dev/
- 백엔드 레포: https://github.com/jhogunhee/logistics-back

> 백엔드가 무료 플랜이라 유휴 시 잠든다. 첫 접속은 서버 기동에 1분 정도 걸리고, 그 동안
> `ServerWakeGate`가 안내를 띄우며 화면을 붙잡는다.

## 기술 스택

- React 19 + Vite 7
- Tailwind CSS 3
- AG Grid 35 (그리드), React Router 7, axios
- lucide-react (아이콘), react-hot-toast, date-fns, xlsx (엑셀 내보내기)

## 실행

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # dist/
npm run lint
```

백엔드(`http://localhost:8080`)가 떠 있어야 API 화면이 동작한다. CORS는 백엔드에서 5173을 허용한다.

환경변수는 `.env.local`에 넣는다(견본: [.env.example](.env.example)). 선택 사항이라 없어도 실행된다.

| 환경변수 | 기본값 |
|---|---|
| `VITE_API_URL` | `http://localhost:8080` |

## 프로젝트 구조

```
src/
├─ api/          도메인별 API 모듈 (axios 인스턴스 공유)
├─ components/   공통 UI · 도메인별 모달/위젯
├─ constants/    그리드 기본값 · 코드 옵션 · 상품 아이콘
├─ hooks/        useMasterGrid · useCodes · useScanFlow · useMediaQuery
├─ layout/       데스크톱 Layout · 사이드바 · PDA MobileLayout
├─ pages/        화면 (master · oms · inbound · stock · outbound · strategy · mobile)
└─ utils/        axios · 날짜/수량 포맷 · 바코드 · 한글 검색
```

경로 별칭 `@`는 `src/`를 가리킨다.

마스터 그리드는 `useMasterGrid`가 행 상태(추가·수정·삭제)를 모아 한 번에 저장하는 방식으로 통일돼 있다.
PDA 화면의 스캔 단계는 `useScanFlow`가 담당한다.

## 화면 구성

| 영역 | 화면 |
|---|---|
| 모니터링 | 대시보드 |
| 주문(OMS) | 입고주문 등록/관리 · 자동발주 산정 · 출고주문 등록/관리 |
| 입고 | 입고예정(ASN) · 입고검수 · 적치지시 · 적치 · 입고확정 |
| 재고 | 현재고(로케이션 점유 맵 포함) · 재고이력 · 속성변경 · 로트변경 · 보류 · 이동 · 정기보충 · 재고조사 |
| 출고 | 출고예정 · 웨이브 · 할당 · 피킹지시 · 수시보충 · 피킹 · 출고확정 |
| 마스터 | 상품 · 단위 · 존 · 로케이션 · 고정 로케이션 · 상품 거래처 · 벤더 · 점포 · 채번규칙 · 공통코드 · 라벨 인쇄 |
| 전략 | 검수 정책 · 적치 전략 · 웨이브 전략 · 할당 전략 |

지시를 만들고 관리하는 것은 데스크톱 화면, 그 지시를 실행하는 것은 PDA 화면이다.
2단계로 나뉜 업무(적치 · 이동 · 보류 · 재고조사)는 메뉴를 하나만 두고 화면 안 탭으로 등록/관리를 오간다.

## PDA 화면

`/m` 이하가 현장 실행 화면이다. 입고검수 · 적치 · 현재고 조회 · 재고이동 · 재고조사 · 보충 · 피킹 · 출고확정
8종이 있고, 세로 화면과 한 손 조작을 전제로 데스크톱과 레이아웃을 따로 만들었다.

- [manifest.webmanifest](public/manifest.webmanifest)로 PWA 설치를 지원한다. 시작 주소는 `/m`이다.
- 바코드는 카메라(`CameraScanner`)로 읽거나 PDA 스캐너 입력을 그대로 받는다. 찍을 라벨은
  데스크톱의 「라벨 인쇄」 화면에서 발행한다.
- 스캔·수량 입력 단계는 화면마다 다르지만 진행 규칙은 `useScanFlow` 하나를 공유한다.

## 상품 이미지

상품 이미지는 이모지다. `prod.img_url`에 `emoji:🥛` 형태로 저장하고 화면이 글자를 그대로 그린다.
값을 정하는 유일한 경로는 상품 관리 화면의 아이콘 선택이고, 파일 업로드는 두지 않았다 —
업로드는 스토리지와 인증이 필요하고, 파일을 미리 어딘가에 넣어 둔다는 화면 밖 단계를 전제하게 된다.

이미지가 없거나 주소가 깨진 상품은 [ProdThumb](src/components/common/ProdThumb.jsx)이 같은 크기의
폴백을 그린다. `https://…`나 `/…` 형태의 이미지 주소도 같은 컴포넌트가 받는다.

## 배포

Cloudflare Pages. `dist/`를 정적 자산으로 올리고, SPA라 없는 경로는 `index.html`로 넘긴다
([wrangler.jsonc](wrangler.jsonc)). 백엔드 주소는 빌드 시점의 `VITE_API_URL`로 주입한다.

프로세스 설계와 재고 모델은 백엔드 레포의 `docs/design.md`를 참고한다.

## 한계

- 인증이 붙지 않았다. 로그인 화면과 `AuthRoute`는 있지만 라우트를 감싸지 않는다.
