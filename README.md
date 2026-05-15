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
  - 기본 스팸 방어(허니팟, 너무 빠른 제출 차단)
  - IP 기준 간단 속도 제한(분당 요청 제한)
  - `orders` + `order_items` 저장
  - 추적 링크(`/track?token=...&phone=...&store=...`) 반환

### 2) 공개 주문 추적

- `GET /track` 주문 추적 화면
- `POST /api/public/tracking` 조회 API
  - `get_order_tracking_v2` RPC 호출
  - 가격 상태/결제 상태/주문 상태 표시
  - 매장 slug가 있으면 입금 계좌 정보 표시

### 3) 관리자 주문 보드

- `GET /admin/login` PIN 로그인
- `GET /admin/orders` 주문 보드
- 매장별 주문 목록 조회
- 주문 가격 확정(서버 액션에서 직접 update)
- 주문 상태 빠른 변경 버튼 (`orders.status`)
- 결제 상태 빠른 변경 버튼 (`orders.payment_status`)
- 주문문구 복사 + 출력

### 4) 관리자 상품 관리

- `GET /admin/products`
- CSV 업로드(엑셀 내보내기 CSV 반영)
- 가격/품절/활성 빠른 수정

### 5) 관리자 운영 화면

- `GET /admin/dashboard` (7일 지표 + 주문 상태 이벤트)
- `GET /admin/onboarding` (매장 주문 QR + 5분 셋업 가이드)

## 핵심 라우트

- `/` 홈
- `/admin/login` 관리자 로그인
- `/admin/dashboard` 운영 지표
- `/s/[slug]` 공개 주문 페이지
- `/track` 공개 추적 페이지
- `/admin/orders` 관리자 주문 보드
- `/admin/products` 상품 관리
- `/admin/onboarding` 온보딩
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
MYSTOREQR_ADMIN_PIN=<admin-pin>
# Optional: dedicated admin session signing key
# MYSTOREQR_ADMIN_AUTH_SECRET=<long-random-secret>
# Optional: onboarding page absolute URL
# NEXT_PUBLIC_APP_URL=https://your-domain.com
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

관리자 커스텀 액션 로그(선택):

1. `supabase/snippets/admin_action_logs.sql`

## 현재 MVP 체크포인트

1. `/s/[slug]`에서 주문 생성이 되는지
2. `/track`에서 lookup token + 연락처 조회가 되는지
3. `/admin/login` PIN 로그인 후 `/admin/orders` 접근 가능한지
4. 관리자에서 가격확정/상태변경이 주문 추적에 반영되는지
