import Link from "next/link"

import { logoutAdminAction } from "@/app/admin/_actions/auth"
import { requireAdminSessionOrRedirect } from "@/lib/mystoreqr/admin-auth"
import {
  getAdminDashboardMetricsByStoreId,
  getAdminRoleQueueCountsByStoreId,
  getAdminStores,
  getRecentOrderStatusEventsByStoreId,
} from "@/lib/mystoreqr/admin-queries"
import { formatKrw } from "@/lib/mystoreqr/format"
import { ORDER_WORK_VIEW_META } from "@/lib/mystoreqr/order-work-view"
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

function buildOrdersHref(storeSlug: string, filters: Record<string, string>) {
  const params = new URLSearchParams({ store: storeSlug })
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value)
    }
  }

  return `/admin/orders?${params.toString()}`
}

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
  const [metrics, events, roleQueueCounts] = await Promise.all([
    getAdminDashboardMetricsByStoreId(selectedStore.id, 7),
    getRecentOrderStatusEventsByStoreId(selectedStore.id, 30),
    getAdminRoleQueueCountsByStoreId(selectedStore.id),
  ])
  const ordersLinks = {
    all: buildOrdersHref(selectedStore.slug, {}),
    ownerView: buildOrdersHref(selectedStore.slug, { view: "owner" }),
    prepView: buildOrdersHref(selectedStore.slug, { view: "prep" }),
    deliveryView: buildOrdersHref(selectedStore.slug, { view: "delivery" }),
    needsReview: buildOrdersHref(selectedStore.slug, { price: "needs_review" }),
    waitingTransfer: buildOrdersHref(selectedStore.slug, { payment: "waiting_transfer" }),
    transferSubmitted: buildOrdersHref(selectedStore.slug, { payment: "transfer_submitted" }),
    delivering: buildOrdersHref(selectedStore.slug, { status: "delivering" }),
    completed: buildOrdersHref(selectedStore.slug, { status: "completed" }),
    canceled: buildOrdersHref(selectedStore.slug, { status: "canceled" }),
  }

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
              href={ordersLinks.all}
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
        <Link href={ordersLinks.all} className="mq-card block p-4 hover:bg-zinc-50">
          <p className="text-xs text-zinc-500">총 주문</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{metrics.totalOrders}</p>
        </Link>
        <Link href={ordersLinks.needsReview} className="mq-card block p-4 hover:bg-zinc-50">
          <p className="text-xs text-zinc-500">가격 확정률</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">
            {metrics.totalOrders > 0 ? Math.round((metrics.quotedOrders / metrics.totalOrders) * 100) : 0}%
          </p>
        </Link>
        <Link href={ordersLinks.completed} className="mq-card block p-4 hover:bg-zinc-50">
          <p className="text-xs text-zinc-500">완료 주문</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{metrics.completedOrders}</p>
        </Link>
        <Link href={ordersLinks.all} className="mq-card block p-4 hover:bg-zinc-50">
          <p className="text-xs text-zinc-500">총 매출(주문금액 기준)</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{formatKrw(metrics.totalRevenue)}</p>
        </Link>
      </section>

      <section className="mq-card p-4">
        <h2 className="text-lg font-semibold text-zinc-900">역할별 빠른 이동</h2>
        <p className="mt-1 text-xs text-zinc-600">담당자별 주문 보드로 바로 이동해서 필요한 액션만 처리할 수 있습니다.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <Link href={ordersLinks.all} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 hover:bg-zinc-50">
            <p className="text-sm font-semibold text-zinc-900">{ORDER_WORK_VIEW_META.all.label}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{ORDER_WORK_VIEW_META.all.description}</p>
          </Link>
          <Link
            href={ordersLinks.ownerView}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 hover:bg-amber-100/70"
          >
            <p className="text-sm font-semibold text-amber-900">{ORDER_WORK_VIEW_META.owner.label}</p>
            <p className="mt-0.5 text-xs text-amber-800">{ORDER_WORK_VIEW_META.owner.description}</p>
            <p className="mt-1 text-xs font-medium text-amber-900">
              처리대기 {roleQueueCounts.ownerPendingCount}건
            </p>
          </Link>
          <Link
            href={ordersLinks.prepView}
            className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 hover:bg-sky-100/70"
          >
            <p className="text-sm font-semibold text-sky-900">{ORDER_WORK_VIEW_META.prep.label}</p>
            <p className="mt-0.5 text-xs text-sky-800">{ORDER_WORK_VIEW_META.prep.description}</p>
            <p className="mt-1 text-xs font-medium text-sky-900">
              준비대기 {roleQueueCounts.prepPendingCount}건
            </p>
          </Link>
          <Link
            href={ordersLinks.deliveryView}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 hover:bg-emerald-100/70"
          >
            <p className="text-sm font-semibold text-emerald-900">{ORDER_WORK_VIEW_META.delivery.label}</p>
            <p className="mt-0.5 text-xs text-emerald-800">{ORDER_WORK_VIEW_META.delivery.description}</p>
            <p className="mt-1 text-xs font-medium text-emerald-900">
              배달중 {roleQueueCounts.deliveringCount}건
            </p>
          </Link>
        </div>
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
          <div className="mt-3 grid gap-2 text-sm">
            <Link href={ordersLinks.needsReview} className="rounded-lg bg-brand-soft px-3 py-2 text-brand-strong hover:bg-brand-border">
              가격 확정 필요 주문 보기
            </Link>
            <Link href={ordersLinks.waitingTransfer} className="rounded-lg bg-brand-soft px-3 py-2 text-brand-strong hover:bg-brand-border">
              입금 대기 주문 보기 ({metrics.waitingTransferOrders}건)
            </Link>
            <Link href={ordersLinks.transferSubmitted} className="rounded-lg bg-brand-soft px-3 py-2 text-brand-strong hover:bg-brand-border">
              입금 신고된 주문 보기
            </Link>
            <Link href={ordersLinks.delivering} className="rounded-lg bg-brand-soft px-3 py-2 text-brand-strong hover:bg-brand-border">
              배달중 주문 보기
            </Link>
            <Link href={ordersLinks.canceled} className="rounded-lg bg-zinc-100 px-3 py-2 text-zinc-700 hover:bg-zinc-200">
              취소 주문 보기 ({metrics.canceledOrders}건)
            </Link>
            <p className="mt-1 text-xs text-zinc-500">평균 주문금액: {formatKrw(metrics.averageOrderAmount)}</p>
          </div>
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
