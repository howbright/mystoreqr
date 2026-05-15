# MyStoreQR

동네마트 1개를 대상으로 빠르게 검증하는 주문 MVP입니다.

- 고객: QR 접속 → 회원가입 없이 주문
- 사장님: 주문 확인 후 전화/협의 → 가격 확정(견적) → 입금/배송 상태 관리
- 결제: 플랫폼이 돈을 보관하지 않고, 고객이 마트 계좌로 직접 무통장입금

## 현재 구현 범위

### 1) 공개 주문 흐름(비회원)

- `GET /s/[slug]` 매장 주문 페이지
- 상품 선택 + 수량 입력
- 주문자 정보 입력(이름, 연락처, 배달/픽업, 주소, 요청사항)
- `POST /api/public/stores/[slug]/orders` 주문 생성
  - `orders` + `order_items` 저장
  - 추적 링크(`/track?token=...&phone=...&store=...`) 반환

### 2) 공개 주문 추적

- `GET /track` 주문 추적 화면
- `POST /api/public/tracking` 조회 API
  - `get_order_tracking_v2` RPC 호출
  - 가격 상태/결제 상태/주문 상태 표시
  - 매장 slug가 있으면 입금 계좌 정보 표시

### 3) 관리자 주문 보드

- `GET /admin/orders` (MVP 임시: 로그인 없이 서버 관리자 키 기반 처리)
- 매장별 주문 목록 조회
- 주문 가격 확정(서버 액션에서 직접 update)
- 주문 상태 변경 (`orders.status`)
- 결제 상태 변경 (`orders.payment_status`)

## 핵심 라우트

- `/` 홈
- `/s/[slug]` 공개 주문 페이지
- `/track` 공개 추적 페이지
- `/admin/orders` 관리자 주문 보드
- `/api/public/stores/[slug]/orders` 주문 생성 API
- `/api/public/tracking` 추적 조회 API

## 로컬 실행

```bash
pnpm install
pnpm dev
```

## 환경변수 (`.env.development`)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-or-secret-key>
# Optional legacy fallback:
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
# Optional modern key name fallback:
# SUPABASE_SECRET_KEY=<secret-key>
```

## Supabase DB/타입 동기화

```bash
export SUPABASE_PROJECT_REF="your-project-ref"
pnpm supabase:login
pnpm supabase:link
pnpm db:types
```

스키마 pull + 타입 재생성:

```bash
pnpm db:sync
```

## SQL 적용 순서 참고

기본 스키마:

- `supabase/migrations/202605110130_init_mystoreqr.sql`

Quote-first 보강(수동 실행):

1. `supabase/snippets/quote_first_order_flow_step1_enums.sql`
2. `supabase/snippets/quote_first_order_flow_step2_apply.sql`
3. `supabase/snippets/quote_first_order_flow_step3_functions.sql`

## 다음 구현 우선순위 (권장)

1. 엑셀/CSV 상품 일괄 업로드(사장님 입력 부담 최소화)
2. 주문 알림(카카오/문자/푸시 중 1개)
3. 입금 신고(`transfer_reports`) 고객 폼 + 관리자 검수 UX
4. 관리자 인증 화면(OTP 또는 magic link)
5. 운영지표 대시보드(일 주문수, 확정률, 완료율)
