import Link from "next/link"

import { logoutAdminAction } from "@/app/admin/_actions/auth"
import { requireAdminSessionOrRedirect } from "@/lib/mystoreqr/admin-auth"
import {
  getAdminDashboardMetricsByStoreId,
  getAdminStores,
  getRecentOrderStatusEventsByStoreId,
} from "@/lib/mystoreqr/admin-queries"
import { formatKrw } from "@/lib/mystoreqr/format"
import { orderStatusLabel } from "@/lib/mystoreqr/status"

function firstString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
})

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
})

export default async function AdminDashboardPage(props: PageProps<"/admin/dashboard">) {
  const searchParams = await props.searchParams
  const queryString = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      queryString.set(key, value)
    }
  }
  const nextPath = `/admin/dashboard${queryString.toString() ? `?${queryString.toString()}` : ""}`
  await requireAdminSessionOrRedirect(nextPath)

  const storeSlugParam = firstString(searchParams.store)?.trim().toLowerCase()
  const stores = await getAdminStores()

  if (stores.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-bold text-zinc-900">운영 대시보드</h1>
        <section className="mq-card p-5 text-sm text-zinc-700">
          <p>조회 가능한 매장이 없습니다.</p>
        </section>
      </main>
    )
  }

  const selectedStore = stores.find((store) => store.slug === storeSlugParam) ?? stores[0]
  const [metrics, events] = await Promise.all([
    getAdminDashboardMetricsByStoreId(selectedStore.id, 7),
    getRecentOrderStatusEventsByStoreId(selectedStore.id, 30),
  ])

  const maxDailyCount = Math.max(...metrics.dailyOrders.map((day) => day.count), 1)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:px-8">
      <header className="mq-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-brand-strong">MyStoreQR Admin</p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-900">운영 대시보드</h1>
            <p className="mt-2 text-sm text-zinc-600">
              최근 {metrics.periodDays}일 기준 / 매장: {selectedStore.name}
            </p>
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
              href={`/admin/onboarding?store=${encodeURIComponent(selectedStore.slug)}`}
              className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand-strong hover:bg-brand-border"
            >
              온보딩
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
            href={`/admin/dashboard?store=${encodeURIComponent(store.slug)}`}
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="mq-card p-4">
          <p className="text-xs text-zinc-500">총 주문</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{metrics.totalOrders}</p>
        </article>
        <article className="mq-card p-4">
          <p className="text-xs text-zinc-500">가격 확정률</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">
            {metrics.totalOrders > 0 ? Math.round((metrics.quotedOrders / metrics.totalOrders) * 100) : 0}%
          </p>
        </article>
        <article className="mq-card p-4">
          <p className="text-xs text-zinc-500">완료 주문</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{metrics.completedOrders}</p>
        </article>
        <article className="mq-card p-4">
          <p className="text-xs text-zinc-500">총 매출(주문금액 기준)</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{formatKrw(metrics.totalRevenue)}</p>
        </article>
      </section>

      <section className="mq-card p-4">
        <h2 className="text-lg font-semibold text-zinc-900">일별 주문 추이</h2>
        <div className="mt-3 grid grid-cols-7 gap-2">
          {metrics.dailyOrders.map((day) => (
            <div key={day.date} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
              <p className="text-[11px] text-zinc-500">{dateFormatter.format(new Date(day.date))}</p>
              <div className="mt-2 h-16 rounded bg-white p-1">
                <div
                  className="mx-auto w-full rounded bg-brand"
                  style={{ height: `${Math.max((day.count / maxDailyCount) * 100, day.count > 0 ? 12 : 4)}%` }}
                />
              </div>
              <p className="mt-1 text-center text-sm font-semibold text-zinc-800">{day.count}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="mq-card p-4">
          <h2 className="text-lg font-semibold text-zinc-900">상태 요약</h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700">
            <li>가격 확정 완료: {metrics.quotedOrders}건</li>
            <li>입금 대기: {metrics.waitingTransferOrders}건</li>
            <li>입금 확인: {metrics.confirmedPayments}건</li>
            <li>취소: {metrics.canceledOrders}건</li>
            <li>평균 주문금액: {formatKrw(metrics.averageOrderAmount)}</li>
          </ul>
        </article>
        <article className="mq-card p-4">
          <h2 className="text-lg font-semibold text-zinc-900">최근 주문 상태 이벤트</h2>
          {events.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">이벤트가 없습니다.</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              {events.map((event) => (
                <div key={event.id} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                  <p className="font-medium text-zinc-800">
                    {event.order_code ? `#${event.order_code}` : event.order_id}
                  </p>
                  <p className="text-zinc-700">
                    {event.previous_status ? orderStatusLabel(event.previous_status) : "초기"} →{" "}
                    {orderStatusLabel(event.new_status)}
                  </p>
                  <p className="text-xs text-zinc-500">{dateTimeFormatter.format(new Date(event.created_at))}</p>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </main>
  )
}
