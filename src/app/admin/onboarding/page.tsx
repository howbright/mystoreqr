import Link from "next/link"
import { headers } from "next/headers"

import { logoutAdminAction } from "@/app/admin/_actions/auth"
import { requireAdminSessionOrRedirect } from "@/lib/mystoreqr/admin-auth"
import { getAdminStores } from "@/lib/mystoreqr/admin-queries"

import { updateStoreOrderPolicyAction } from "./actions"

function firstString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

function isLocalBaseUrl(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value)
}

async function getAppBaseUrl() {
  const envBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const headersList = await headers()
  const forwardedHost = headersList.get("x-forwarded-host")?.split(",")[0]?.trim()
  const host = forwardedHost || headersList.get("host")?.trim()
  const forwardedProto = headersList.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const proto = forwardedProto || (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https")

  if (host && (!envBaseUrl || isLocalBaseUrl(envBaseUrl))) {
    return `${proto}://${host}`.replace(/\/$/, "")
  }

  if (envBaseUrl) {
    return envBaseUrl.replace(/\/$/, "")
  }

  return "http://localhost:3000"
}

export default async function AdminOnboardingPage(props: PageProps<"/admin/onboarding">) {
  const searchParams = await props.searchParams
  const queryString = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      queryString.set(key, value)
    }
  }
  const nextPath = `/admin/onboarding${queryString.toString() ? `?${queryString.toString()}` : ""}`
  await requireAdminSessionOrRedirect(nextPath)

  const storeSlugParam = firstString(searchParams.store)?.trim().toLowerCase()
  const stores = await getAdminStores()
  if (stores.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-bold text-zinc-900">온보딩</h1>
        <section className="mq-card p-5 text-sm text-zinc-700">
          <p>조회 가능한 매장이 없습니다.</p>
        </section>
      </main>
    )
  }

  const selectedStore = stores.find((store) => store.slug === storeSlugParam) ?? stores[0]
  const orderPageUrl = `${await getAppBaseUrl()}/s/${selectedStore.slug}`
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(orderPageUrl)}`
  const successMessage = firstString(searchParams.ok)
  const errorMessage = firstString(searchParams.error)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 md:px-8">
      <header className="mq-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-brand-strong">MyStoreQR Admin</p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-900">사장님 5분 온보딩</h1>
            <p className="mt-2 text-sm text-zinc-600">매장: {selectedStore.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/orders?store=${encodeURIComponent(selectedStore.slug)}`}
              className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand-strong hover:bg-brand-border"
            >
              주문 보드
            </Link>
            <Link
              href={`/admin/products?store=${encodeURIComponent(selectedStore.slug)}`}
              className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand-strong hover:bg-brand-border"
            >
              상품 관리
            </Link>
            <Link
              href={`/admin/dashboard?store=${encodeURIComponent(selectedStore.slug)}`}
              className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand-strong hover:bg-brand-border"
            >
              대시보드
            </Link>
            <form action={logoutAdminAction}>
              <button
                type="submit"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {stores.map((store) => (
          <Link
            key={store.id}
            href={`/admin/onboarding?store=${encodeURIComponent(store.slug)}`}
            className={`rounded-full px-4 py-2 text-sm ${
              store.id === selectedStore.id
                ? "bg-brand text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-brand-soft"
            }`}
          >
            {store.name}
          </Link>
        ))}
      </nav>

      {successMessage ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{successMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <article className="mq-card p-5">
          <h2 className="text-lg font-semibold text-zinc-900">QR 안내</h2>
          <p className="mt-2 text-sm text-zinc-600">
            이 QR을 매장 계산대/입구에 붙이면 고객이 바로 주문 페이지로 접속합니다.
          </p>
          <div className="mt-4 flex justify-center rounded-xl bg-zinc-50 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrImageUrl} alt="주문 페이지 QR 코드" className="h-56 w-56 rounded-md bg-white p-2" />
          </div>
          <p className="mt-3 break-all rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">{orderPageUrl}</p>
          <a
            href={qrImageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-brand-strong underline"
          >
            QR 이미지 새창 열기
          </a>
        </article>

        <article className="mq-card p-5">
          <h2 className="text-lg font-semibold text-zinc-900">운영 체크리스트</h2>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm text-zinc-700">
            <li>상품 관리에서 주력 상품 20개 먼저 등록</li>
            <li>가격 미확정 상품은 빈 가격으로 두고 설명에 시세 표기</li>
            <li>QR 출력 후 매장 입구/계산대에 부착</li>
            <li>테스트 주문 1건 진행 후 관리자에서 가격 확정</li>
            <li>주문 상태를 준비중 → 준비완료 → 배달중 → 완료로 변경해 흐름 점검</li>
          </ol>

          <div className="mt-4 rounded-xl bg-brand-soft p-3 text-sm text-brand-strong">
            핵심 메시지: 수수료 0%, 고객 회원가입 없음, 매장 통장 직입금
          </div>
        </article>
      </section>

      <section className="mq-card p-5">
        <h2 className="text-lg font-semibold text-zinc-900">{selectedStore.name}의 주문정책</h2>
        <p className="mt-2 text-sm text-zinc-600">
          고객 주문 페이지의 주문자 정보 위에 표시됩니다. 최소 주문금액, 배달비, 가격 확정 방식처럼 주문 전에
          꼭 알아야 하는 내용을 적어주세요.
        </p>
        <form action={updateStoreOrderPolicyAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="storeSlug" value={selectedStore.slug} />
          <textarea
            name="orderPolicy"
            defaultValue={selectedStore.order_policy ?? ""}
            className="min-h-32 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand focus:outline-none"
            maxLength={1000}
            placeholder="예: 3만원 이상 주문 시 배달비가 무료입니다. 3만원 미만 주문은 배달비가 별도로 추가될 수 있습니다."
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">최대 1,000자까지 입력할 수 있습니다.</p>
            <button type="submit" className="mq-btn-primary h-10 px-4">
              주문정책 저장
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
