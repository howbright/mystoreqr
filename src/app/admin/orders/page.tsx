import Link from "next/link"
import { headers } from "next/headers"

import { logoutAdminAction } from "@/app/admin/_actions/auth"
import { requireAdminSessionOrRedirect } from "@/lib/mystoreqr/admin-auth"
import { ORDER_STATUS_OPTIONS, PAYMENT_STATUS_OPTIONS } from "@/lib/mystoreqr/constants"
import { getAdminOrdersByStoreId, getAdminStores } from "@/lib/mystoreqr/admin-queries"
import { formatKrw, formatPhone, normalizePhone } from "@/lib/mystoreqr/format"
import {
  ORDER_WORK_VIEW_META,
  ORDER_WORK_VIEWS,
  canCancelOrderInView,
  canManagePaymentInView,
  canManageQuoteInView,
  getPrimaryOrderStatusOptionsForView,
  isOrderVisibleInWorkView,
  parseOrderWorkView,
} from "@/lib/mystoreqr/order-work-view"
import { orderStatusLabel, paymentMethodLabel, paymentStatusLabel, priceStatusLabel } from "@/lib/mystoreqr/status"

import { OrderChangeBanner } from "./order-change-banner"
import { OrderTools } from "./order-tools"
import { QuoteForm } from "./quote-form"
import { setOrderStatusAction, setPaymentStatusAction } from "./actions"

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
})

const PRICE_STATUS_OPTIONS = ["needs_review", "quoted"] as const
const SUMMARY_FILTER_OPTIONS = [
  "all_orders",
  "pending",
  "price_needs_review",
  "price_quoted",
  "payment_attention",
  "payment_waiting",
  "payment_submitted",
  "card_customer_confirm_waiting",
  "prep_queue",
  "preparing",
  "ready_for_delivery",
  "delivering",
  "completed",
] as const

type SummaryFilter = (typeof SUMMARY_FILTER_OPTIONS)[number]

function firstString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
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

function matchesSummaryFilter(
  order: Awaited<ReturnType<typeof getAdminOrdersByStoreId>>[number],
  filter: SummaryFilter
) {
  switch (filter) {
    case "pending":
      return order.status === "pending"
    case "price_needs_review":
      return order.price_status === "needs_review"
    case "price_quoted":
      return order.price_status === "quoted"
    case "payment_attention":
      return order.payment_status === "transfer_submitted" || order.payment_status === "waiting_transfer"
    case "payment_waiting":
      return order.payment_status === "waiting_transfer"
    case "payment_submitted":
      return order.payment_status === "transfer_submitted"
    case "card_customer_confirm_waiting":
      return (
        order.payment_method === "card_on_delivery" &&
        order.payment_status === "waiting_card_payment" &&
        order.customer_price_confirmed_at === null
      )
    case "prep_queue":
      return (
        order.status === "payment_confirmed" ||
        (order.status === "pending" && order.payment_status === "confirmed") ||
        (
          order.status === "pending" &&
          order.payment_method === "card_on_delivery" &&
          order.payment_status === "waiting_card_payment" &&
          order.customer_price_confirmed_at !== null
        )
      )
    case "preparing":
      return order.status === "preparing"
    case "ready_for_delivery":
      return order.status === "ready_for_delivery"
    case "delivering":
      return order.status === "delivering"
    case "completed":
      return order.status === "completed"
    case "all_orders":
      return true
  }
}

function getOrderPriorityMeta(
  order: Awaited<ReturnType<typeof getAdminOrdersByStoreId>>[number]
) {
  if (order.status === "pending" && order.price_status === "needs_review") {
    return {
      containerClass: "border-amber-300 bg-amber-50/40",
      label: "긴급: 가격 확정 필요",
      labelClass: "bg-amber-100 text-amber-800",
    }
  }

  if (order.payment_status === "transfer_submitted") {
    return {
      containerClass: "border-sky-300 bg-sky-50/40",
      label: "긴급: 입금 신고 확인 필요",
      labelClass: "bg-sky-100 text-sky-800",
    }
  }

  if (
    order.payment_method === "card_on_delivery" &&
    order.payment_status === "waiting_card_payment" &&
    order.customer_price_confirmed_at === null
  ) {
    return {
      containerClass: "border-violet-300 bg-violet-50/40",
      label: "대기: 고객 가격동의 필요",
      labelClass: "bg-violet-100 text-violet-800",
    }
  }

  if (order.status === "delivering") {
    return {
      containerClass: "border-emerald-300 bg-emerald-50/30",
      label: "진행중: 배달중",
      labelClass: "bg-emerald-100 text-emerald-800",
    }
  }

  if (order.status === "ready_for_delivery") {
    return {
      containerClass: "border-cyan-300 bg-cyan-50/40",
      label: "대기: 준비완료",
      labelClass: "bg-cyan-100 text-cyan-800",
    }
  }

  if (order.status === "canceled") {
    return {
      containerClass: "border-zinc-300 bg-zinc-50/70",
      label: "종료: 취소 주문",
      labelClass: "bg-zinc-200 text-zinc-700",
    }
  }

  return {
    containerClass: "border-brand-border",
    label: null,
    labelClass: "",
  }
}

export default async function AdminOrdersPage(props: PageProps<"/admin/orders">) {
  const searchParams = await props.searchParams
  const queryString = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      queryString.set(key, value)
    }
  }

  const nextPath = `/admin/orders${queryString.toString() ? `?${queryString.toString()}` : ""}`
  await requireAdminSessionOrRedirect(nextPath)

  const storeSlugParam = firstString(searchParams.store)?.trim().toLowerCase()
  const viewFilterRaw = firstString(searchParams.view)
  const statusFilterRaw = firstString(searchParams.status)?.trim()
  const paymentFilterRaw = firstString(searchParams.payment)?.trim()
  const priceFilterRaw = firstString(searchParams.price)?.trim()
  const summaryFilterRaw = firstString(searchParams.summary)?.trim()
  const keywordFilter = firstString(searchParams.q)?.trim() ?? ""
  const successMessage = firstString(searchParams.ok)
  const errorMessage = firstString(searchParams.error)
  const selectedWorkView = parseOrderWorkView(viewFilterRaw)

  const stores = await getAdminStores()

  if (stores.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-bold text-zinc-900">관리자 주문 보드</h1>
        <section className="mq-card p-5 text-sm text-zinc-700">
          <p>조회 가능한 매장이 없습니다.</p>
          <p className="mt-2">
            1) `stores` 테이블에 활성 매장을 추가
            <br />
            2) 해당 매장에 주문이 생성되면 이 화면에 표시됩니다.
          </p>
        </section>
      </main>
    )
  }

  const selectedStore =
    stores.find((store) => store.slug === storeSlugParam) ??
    stores[0]

  const orders = await getAdminOrdersByStoreId(selectedStore.id, 150)
  const statusFilter: (typeof ORDER_STATUS_OPTIONS)[number] | "all" =
    ORDER_STATUS_OPTIONS.includes(statusFilterRaw as (typeof ORDER_STATUS_OPTIONS)[number])
      ? (statusFilterRaw as (typeof ORDER_STATUS_OPTIONS)[number])
      : "all"
  const paymentFilter: (typeof PAYMENT_STATUS_OPTIONS)[number] | "all" =
    PAYMENT_STATUS_OPTIONS.includes(paymentFilterRaw as (typeof PAYMENT_STATUS_OPTIONS)[number])
      ? (paymentFilterRaw as (typeof PAYMENT_STATUS_OPTIONS)[number])
      : "all"
  const priceFilter: (typeof PRICE_STATUS_OPTIONS)[number] | "all" =
    PRICE_STATUS_OPTIONS.includes(priceFilterRaw as (typeof PRICE_STATUS_OPTIONS)[number])
      ? (priceFilterRaw as (typeof PRICE_STATUS_OPTIONS)[number])
      : "all"
  const selectedSummaryFilter: SummaryFilter =
    SUMMARY_FILTER_OPTIONS.includes(summaryFilterRaw as SummaryFilter)
      ? (summaryFilterRaw as SummaryFilter)
      : "all_orders"
  const showStructuredFilters = selectedWorkView === "all"
  const effectiveStatusFilter = showStructuredFilters ? statusFilter : "all"
  const effectivePaymentFilter = showStructuredFilters ? paymentFilter : "all"
  const effectivePriceFilter = showStructuredFilters ? priceFilter : "all"
  const normalizedKeyword = keywordFilter.toLowerCase()
  const baseFilteredOrders = orders.filter((order) => {
    if (effectiveStatusFilter !== "all" && order.status !== effectiveStatusFilter) {
      return false
    }

    if (effectivePaymentFilter !== "all" && order.payment_status !== effectivePaymentFilter) {
      return false
    }

    if (effectivePriceFilter !== "all" && order.price_status !== effectivePriceFilter) {
      return false
    }

    if (!normalizedKeyword) {
      return true
    }

    const searchable = [
      order.order_code,
      order.customer_name,
      order.customer_phone,
      order.delivery_address ?? "",
      order.delivery_address_detail ?? "",
      order.customer_note ?? "",
    ]
      .join(" ")
      .toLowerCase()

    return searchable.includes(normalizedKeyword)
  })
  const roleFilteredOrders = baseFilteredOrders.filter((order) =>
    isOrderVisibleInWorkView(order, selectedWorkView)
  )
  const filteredOrders = roleFilteredOrders.filter((order) => matchesSummaryFilter(order, selectedSummaryFilter))
  const workViewCounts = Object.fromEntries(
    ORDER_WORK_VIEWS.map((view) => [
      view,
      baseFilteredOrders.filter((order) => isOrderVisibleInWorkView(order, view)).length,
    ])
  ) as Record<(typeof ORDER_WORK_VIEWS)[number], number>
  const hasActiveFilters =
    selectedWorkView !== "all" ||
    effectiveStatusFilter !== "all" ||
    effectivePaymentFilter !== "all" ||
    effectivePriceFilter !== "all" ||
    selectedSummaryFilter !== "all_orders" ||
    normalizedKeyword.length > 0
  const persistentFilterParams = new URLSearchParams()
  if (effectiveStatusFilter !== "all") {
    persistentFilterParams.set("status", effectiveStatusFilter)
  }
  if (effectivePaymentFilter !== "all") {
    persistentFilterParams.set("payment", effectivePaymentFilter)
  }
  if (effectivePriceFilter !== "all") {
    persistentFilterParams.set("price", effectivePriceFilter)
  }
  if (keywordFilter) {
    persistentFilterParams.set("q", keywordFilter)
  }
  const persistentParamsWithSummary = new URLSearchParams(persistentFilterParams)
  if (selectedSummaryFilter !== "all_orders") {
    persistentParamsWithSummary.set("summary", selectedSummaryFilter)
  }
  function buildOrdersHref(storeSlug: string, workView = selectedWorkView) {
    const params = new URLSearchParams(persistentFilterParams)
    params.set("store", storeSlug)
    if (workView !== "all") {
      params.set("view", workView)
    }
    return `/admin/orders?${params.toString()}`
  }
  function buildSummaryFilterHref(summaryFilter: SummaryFilter) {
    const params = new URLSearchParams(persistentFilterParams)
    params.set("store", selectedStore.slug)
    if (selectedWorkView !== "all") {
      params.set("view", selectedWorkView)
    }
    if (summaryFilter !== "all_orders") {
      params.set("summary", summaryFilter)
    }
    return `/admin/orders?${params.toString()}`
  }
  const resetFilterParams = new URLSearchParams()
  resetFilterParams.set("store", selectedStore.slug)
  if (selectedWorkView !== "all") {
    resetFilterParams.set("view", selectedWorkView)
  }
  const resetFiltersHref = `/admin/orders?${resetFilterParams.toString()}`
  const resetSearchParams = new URLSearchParams()
  resetSearchParams.set("store", selectedStore.slug)
  if (selectedWorkView !== "all") {
    resetSearchParams.set("view", selectedWorkView)
  }
  if (effectiveStatusFilter !== "all") {
    resetSearchParams.set("status", effectiveStatusFilter)
  }
  if (effectivePaymentFilter !== "all") {
    resetSearchParams.set("payment", effectivePaymentFilter)
  }
  if (effectivePriceFilter !== "all") {
    resetSearchParams.set("price", effectivePriceFilter)
  }
  if (selectedSummaryFilter !== "all_orders") {
    resetSearchParams.set("summary", selectedSummaryFilter)
  }
  const resetSearchHref = `/admin/orders?${resetSearchParams.toString()}`
  const actionReturnTo = (() => {
    const params = new URLSearchParams(persistentParamsWithSummary)
    params.set("store", selectedStore.slug)
    if (selectedWorkView !== "all") {
      params.set("view", selectedWorkView)
    }
    return `/admin/orders?${params.toString()}`
  })()
  const appBaseUrl = await getAppBaseUrl()
  const isCustomerCanceledConflict = errorMessage?.includes("고객이 가격확정 전에 주문을 취소했습니다.") ?? false
  const initialLatestUpdatedAt =
    orders.reduce<string | null>((latest, order) => {
      if (!latest || new Date(order.updated_at).getTime() > new Date(latest).getTime()) {
        return order.updated_at
      }
      return latest
    }, null) ?? new Date().toISOString()
  const paymentAttentionCount = roleFilteredOrders.filter(
    (order) => order.payment_status === "transfer_submitted" || order.payment_status === "waiting_transfer"
  ).length
  const cardCustomerConfirmWaitingCount = roleFilteredOrders.filter(
    (order) =>
      order.payment_method === "card_on_delivery" &&
      order.payment_status === "waiting_card_payment" &&
      order.customer_price_confirmed_at === null
  ).length
  const priceNeedsReviewCount = roleFilteredOrders.filter((order) => order.price_status === "needs_review").length
  const priceQuotedCount = roleFilteredOrders.filter((order) => order.price_status === "quoted").length
  const paymentWaitingCount = roleFilteredOrders.filter((order) => order.payment_status === "waiting_transfer").length
  const paymentSubmittedCount = roleFilteredOrders.filter((order) => order.payment_status === "transfer_submitted").length
  const prepQueueCount = roleFilteredOrders.filter(
    (order) =>
      order.status === "payment_confirmed" ||
      (order.status === "pending" && order.payment_status === "confirmed") ||
      (
        order.status === "pending" &&
        order.payment_method === "card_on_delivery" &&
        order.payment_status === "waiting_card_payment" &&
        order.customer_price_confirmed_at !== null
      )
  ).length
  const preparingCount = roleFilteredOrders.filter((order) => order.status === "preparing").length
  const readyForDeliveryCount = roleFilteredOrders.filter((order) => order.status === "ready_for_delivery").length
  const deliveringCount = roleFilteredOrders.filter((order) => order.status === "delivering").length
  const completedCount = roleFilteredOrders.filter((order) => order.status === "completed").length
  const summaryCards: { key: SummaryFilter; label: string; value: number }[] =
    selectedWorkView === "quote"
      ? [
          { key: "price_needs_review", label: "가격 확정 대기", value: priceNeedsReviewCount },
          { key: "price_quoted", label: "가격 확정 완료", value: priceQuotedCount },
          { key: "card_customer_confirm_waiting", label: "고객 동의 대기", value: cardCustomerConfirmWaitingCount },
        ]
      : selectedWorkView === "payment"
        ? [
            { key: "payment_waiting", label: "입금 대기", value: paymentWaitingCount },
            { key: "payment_submitted", label: "입금 신고됨", value: paymentSubmittedCount },
          ]
        : selectedWorkView === "prep"
          ? [
              { key: "prep_queue", label: "준비 대기", value: prepQueueCount },
              { key: "preparing", label: "준비중", value: preparingCount },
              { key: "ready_for_delivery", label: "준비완료", value: readyForDeliveryCount },
            ]
          : selectedWorkView === "delivery"
            ? [
                { key: "ready_for_delivery", label: "준비완료", value: readyForDeliveryCount },
                { key: "delivering", label: "배달중", value: deliveringCount },
                { key: "completed", label: "배달완료", value: completedCount },
              ]
            : [
                { key: "all_orders", label: "현재 뷰 주문", value: roleFilteredOrders.length },
                { key: "price_needs_review", label: "가격 확정 대기", value: priceNeedsReviewCount },
                { key: "payment_attention", label: "입금 확인 필요", value: paymentAttentionCount },
              ]

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:px-8">
      <header className="mq-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-strong">MyStoreQR Admin</p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-900">주문 보드</h1>
            <p className="mt-2 text-sm text-zinc-600">
              매장: {selectedStore.name}
              {selectedStore.phone ? ` (${formatPhone(selectedStore.phone)})` : ""}
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            <Link
              href={`/admin/products?store=${encodeURIComponent(selectedStore.slug)}`}
              className="rounded-lg bg-brand-soft px-3 py-2 text-center text-sm font-medium whitespace-nowrap text-brand-strong hover:bg-brand-border"
            >
              상품 관리
            </Link>
            <Link
              href={`/admin/dashboard?store=${encodeURIComponent(selectedStore.slug)}`}
              className="rounded-lg bg-brand-soft px-3 py-2 text-center text-sm font-medium whitespace-nowrap text-brand-strong hover:bg-brand-border"
            >
              대시보드
            </Link>
            <Link
              href={`/admin/onboarding?store=${encodeURIComponent(selectedStore.slug)}`}
              className="rounded-lg bg-brand-soft px-3 py-2 text-center text-sm font-medium whitespace-nowrap text-brand-strong hover:bg-brand-border"
            >
              온보딩
            </Link>
            <form action={logoutAdminAction}>
              <button
                type="submit"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm whitespace-nowrap text-zinc-700 hover:bg-zinc-100"
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
            href={buildOrdersHref(store.slug)}
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

      <section className="mq-card p-4">
        <p className="text-sm font-semibold text-zinc-900">역할별 작업 뷰</p>
        <p className="mt-1 text-xs text-zinc-600">{ORDER_WORK_VIEW_META[selectedWorkView].description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ORDER_WORK_VIEWS.map((view) => (
            <Link
              key={view}
              href={buildOrdersHref(selectedStore.slug, view)}
              className={`rounded-full px-4 py-2 text-sm ${
                selectedWorkView === view
                  ? "bg-brand text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-brand-soft"
              }`}
            >
              {ORDER_WORK_VIEW_META[view].label} ({workViewCounts[view]})
            </Link>
          ))}
        </div>
      </section>

      {successMessage ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
      ) : null}
      {isCustomerCanceledConflict ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 px-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="customer-canceled-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <p className="text-xs font-bold text-rose-700">주문 상태가 변경되었습니다</p>
            <h2 id="customer-canceled-title" className="mt-1 text-xl font-black text-zinc-950">
              고객이 주문을 취소했습니다
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-700">{errorMessage}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              이 주문은 가격확정을 진행할 수 없습니다. 확인을 누르면 현재 목록으로 돌아갑니다.
            </p>
            <Link
              href={actionReturnTo}
              className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong"
            >
              확인
            </Link>
          </div>
        </div>
      ) : null}

      <OrderChangeBanner
        storeSlug={selectedStore.slug}
        initialLatestUpdatedAt={initialLatestUpdatedAt}
      />

      <section className="mq-card p-4">
        <form className={`grid gap-3 ${showStructuredFilters ? "md:grid-cols-2 xl:grid-cols-5" : "md:grid-cols-1"}`}>
          <input type="hidden" name="store" value={selectedStore.slug} />
          <input type="hidden" name="view" value={selectedWorkView} />
          {selectedSummaryFilter !== "all_orders" ? (
            <input type="hidden" name="summary" value={selectedSummaryFilter} />
          ) : null}
          {showStructuredFilters ? (
            <>
              <label className="grid gap-1 text-xs text-zinc-600">
                주문 상태
                <select
                  name="status"
                  defaultValue={statusFilter}
                  className="h-10 rounded-md border border-zinc-300 px-2 text-sm focus:border-brand focus:outline-none"
                >
                  <option value="all">전체</option>
                  {ORDER_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {orderStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-zinc-600">
                결제 상태
                <select
                  name="payment"
                  defaultValue={paymentFilter}
                  className="h-10 rounded-md border border-zinc-300 px-2 text-sm focus:border-brand focus:outline-none"
                >
                  <option value="all">전체</option>
                  {PAYMENT_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {paymentStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-zinc-600">
                가격 상태
                <select
                  name="price"
                  defaultValue={priceFilter}
                  className="h-10 rounded-md border border-zinc-300 px-2 text-sm focus:border-brand focus:outline-none"
                >
                  <option value="all">전체</option>
                  <option value="needs_review">{priceStatusLabel("needs_review")}</option>
                  <option value="quoted">{priceStatusLabel("quoted")}</option>
                </select>
              </label>
            </>
          ) : null}
          <label className={`grid gap-1 text-xs text-zinc-600 ${showStructuredFilters ? "xl:col-span-2" : ""}`}>
            검색 (주문번호/고객명/연락처/주소)
            <div className="flex gap-2">
              <div className="relative w-full">
                <input
                  name="q"
                  defaultValue={keywordFilter}
                  className="h-10 w-full rounded-md border border-zinc-300 px-3 pr-10 text-sm focus:border-brand focus:outline-none"
                  placeholder="예: 0101234, 홍길동, 240511..."
                />
                {keywordFilter ? (
                  <Link
                    href={resetSearchHref}
                    aria-label="검색어 초기화"
                    className="absolute top-1/2 right-2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-base font-bold text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    ×
                  </Link>
                ) : null}
              </div>
              {showStructuredFilters ? (
                <>
                  <button type="submit" className="mq-btn-primary h-10 min-w-24 rounded-md">
                    필터 적용
                  </button>
                  <Link
                    href={resetFiltersHref}
                    className="inline-flex h-10 min-w-24 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm text-zinc-700 hover:bg-zinc-100"
                  >
                    초기화
                  </Link>
                </>
              ) : (
                <button type="submit" className="h-10 min-w-16 rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-strong">
                  조회
                </button>
              )}
            </div>
          </label>
        </form>
        {hasActiveFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">필터 적용중</span>
            {selectedWorkView !== "all" ? (
              <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                역할: {ORDER_WORK_VIEW_META[selectedWorkView].label}
              </span>
            ) : null}
            {effectiveStatusFilter !== "all" ? (
              <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                주문: {orderStatusLabel(effectiveStatusFilter)}
              </span>
            ) : null}
            {effectivePaymentFilter !== "all" ? (
              <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                결제: {paymentStatusLabel(effectivePaymentFilter)}
              </span>
            ) : null}
            {effectivePriceFilter !== "all" ? (
              <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                가격: {priceStatusLabel(effectivePriceFilter)}
              </span>
            ) : null}
            {selectedSummaryFilter !== "all_orders" ? (
              <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                빠른필터: {summaryCards.find((card) => card.key === selectedSummaryFilter)?.label ?? selectedSummaryFilter}
              </span>
            ) : null}
            {keywordFilter ? (
              <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                검색: {keywordFilter}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="mq-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={buildSummaryFilterHref("all_orders")}
            scroll={false}
            aria-current={selectedSummaryFilter === "all_orders" ? "true" : undefined}
            className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ring-1 ${
              selectedSummaryFilter === "all_orders"
                ? "border-brand bg-brand text-white shadow-sm ring-brand"
                : "border-zinc-200 bg-white text-zinc-700 ring-zinc-200 hover:bg-brand-soft hover:text-brand-strong"
            }`}
          >
            전체 <span className="ml-1 font-black">{roleFilteredOrders.length}</span>
          </Link>
        {summaryCards.filter((card) => card.key !== "all_orders").map((card) => (
          <Link
            key={card.key}
            href={buildSummaryFilterHref(card.key)}
            scroll={false}
            aria-current={selectedSummaryFilter === card.key ? "true" : undefined}
            className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ring-1 ${
              selectedSummaryFilter === card.key
                ? "border-brand bg-brand text-white shadow-sm ring-brand"
                : "border-zinc-200 bg-white text-zinc-700 ring-zinc-200 hover:bg-brand-soft hover:text-brand-strong"
            }`}
          >
            {card.label} <span className="ml-1 font-black">{card.value}</span>
          </Link>
        ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        {filteredOrders.map((order) => {
          const knownLineTotal = order.order_items.reduce((acc, item) => acc + (item.line_total ?? 0), 0)
          const hasUnknownLine = order.order_items.some((item) => item.unit_price == null)
          const defaultDeliveryFee = order.delivery_fee ?? selectedStore.delivery_fee
          const isPaymentConfirmed = order.payment_status === "confirmed"
          const canManageQuote = canManageQuoteInView(selectedWorkView) && order.price_status === "needs_review"
          const canManagePayment = canManagePaymentInView(selectedWorkView) && order.payment_method === "bank_transfer"
          const canCancelOrder =
            canCancelOrderInView(selectedWorkView) &&
            order.status === "pending" &&
            order.price_status === "needs_review"
          const primaryStatusOptions = getPrimaryOrderStatusOptionsForView(selectedWorkView)
          const showStatusForm = primaryStatusOptions.length > 0 || canCancelOrder
          const actionFormCount = [canManageQuote, showStatusForm, canManagePayment].filter(Boolean).length
          const actionGridClass =
            actionFormCount <= 1 ? "lg:grid-cols-1" : actionFormCount === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"
          const statusPanelTitle =
            selectedWorkView === "prep"
              ? "준비 상태 처리"
              : selectedWorkView === "delivery"
                ? "배달 상태 처리"
                : selectedWorkView === "quote"
                  ? "가격확정담당 상태 처리"
                  : selectedWorkView === "payment"
                    ? "입금확인담당 상태 처리"
                  : "주문 상태 빠른 변경"
          const priorityMeta = getOrderPriorityMeta(order)
          const trackingPath = `/track?token=${encodeURIComponent(order.lookup_token)}&store=${encodeURIComponent(selectedStore.slug)}`
          const trackingUrl = `${appBaseUrl}${trackingPath}`
          const isCardOnDelivery = order.payment_method === "card_on_delivery"
          const customerGuideText = isCardOnDelivery
            ? [
                `${order.customer_name}님, ${selectedStore.name}입니다.`,
                `주문번호: ${order.order_code}`,
                `확정 금액: ${formatKrw(order.total_amount)}`,
                "배달 시 카드결제로 결제하시면 됩니다.",
                "아래 주문조회 링크에서 확정 금액에 동의해 주시면 상품을 준비하겠습니다.",
                `주문 조회: ${trackingUrl}`,
                "감사합니다.",
              ].join("\n")
            : [
                `${order.customer_name}님, ${selectedStore.name}입니다.`,
                `주문번호: ${order.order_code}`,
                `확정 금액: ${formatKrw(order.total_amount)}`,
                `입금 계좌: ${selectedStore.bank_name} ${selectedStore.bank_account_number} (예금주 ${selectedStore.bank_account_holder})`,
                "위 계좌로 입금해 주세요.",
                "입금이 확인되면 상품을 준비하겠습니다.",
                `주문 조회: ${trackingUrl}`,
                "감사합니다.",
              ].join("\n")
          const quoteSmsText = isCardOnDelivery
            ? [
                `${selectedStore.name}입니다.`,
                `주문번호: ${order.order_code}`,
                `확정금액: ${formatKrw(order.total_amount)}`,
                "",
                "배달 시 카드결제로 결제하시면 됩니다.",
                "아래 링크에서 금액을 확인하고 주문 진행에 동의해 주세요.",
                "동의 후 상품을 준비하겠습니다.",
                "",
                `주문조회: ${trackingUrl}`,
              ].join("\n")
            : [
                `${selectedStore.name}입니다.`,
                `주문번호: ${order.order_code}`,
                `확정금액: ${formatKrw(order.total_amount)}`,
                "",
                "입금계좌:",
                `${selectedStore.bank_name} ${selectedStore.bank_account_number}`,
                `예금주: ${selectedStore.bank_account_holder}`,
                "",
                "위 계좌로 입금해 주세요.",
                "입금이 확인되면 상품을 준비하겠습니다.",
                "",
                `주문조회: ${trackingUrl}`,
              ].join("\n")
          const quoteSmsHref = `sms:${normalizePhone(order.customer_phone)}?body=${encodeURIComponent(quoteSmsText)}`
          const canSendQuoteSms =
            order.price_status === "quoted" &&
            (order.payment_status === "waiting_transfer" || order.payment_status === "waiting_card_payment") &&
            normalizePhone(order.customer_phone).length >= 10
          const paymentConfirmedSmsText = [
            `${selectedStore.name}입니다.`,
            `주문번호: ${order.order_code}`,
            isCardOnDelivery ? "카드결제가 확인되었습니다. 감사합니다." : "입금이 확인되었습니다. 감사합니다.",
            "",
            order.fulfillment_type === "delivery"
              ? "상품 준비 후 배달을 진행하겠습니다."
              : "상품 준비 후 픽업 안내를 드리겠습니다.",
            `현재 상태는 주문조회 페이지에서 확인하실 수 있습니다.`,
            "",
            `주문조회: ${trackingUrl}`,
          ].join("\n")
          const paymentConfirmedSmsHref = `sms:${normalizePhone(order.customer_phone)}?body=${encodeURIComponent(paymentConfirmedSmsText)}`
          const canSendPaymentConfirmedSms =
            order.payment_status === "confirmed" && normalizePhone(order.customer_phone).length >= 10
          const deliveryStartedSmsText = [
            `${selectedStore.name}입니다.`,
            `주문번호: ${order.order_code}`,
            "",
            "주문하신 상품이 배송 출발했습니다.",
            "잠시 후 집 앞에 도착 예정입니다.",
            isCardOnDelivery ? "배달 시 카드결제 부탁드립니다." : null,
            "",
            `주문조회: ${trackingUrl}`,
          ].filter(Boolean).join("\n")
          const deliveryStartedSmsHref = `sms:${normalizePhone(order.customer_phone)}?body=${encodeURIComponent(deliveryStartedSmsText)}`
          const canSendDeliveryStartedSms =
            order.status === "delivering" &&
            order.fulfillment_type === "delivery" &&
            normalizePhone(order.customer_phone).length >= 10
          const deliveryCompletedSmsText = [
            `${selectedStore.name}입니다.`,
            `주문번호: ${order.order_code}`,
            "",
            isCardOnDelivery
              ? "카드결제 및 배송이 완료되었습니다."
              : "주문하신 상품을 집 앞에 배송 완료했습니다.",
            "확인 부탁드립니다.",
            "",
            "이용해 주셔서 감사합니다.",
            `주문조회: ${trackingUrl}`,
          ].join("\n")
          const deliveryCompletedSmsHref = `sms:${normalizePhone(order.customer_phone)}?body=${encodeURIComponent(deliveryCompletedSmsText)}`
          const canSendDeliveryCompletedSms =
            order.status === "completed" &&
            order.fulfillment_type === "delivery" &&
            normalizePhone(order.customer_phone).length >= 10
          const orderSummaryText = [
            `주문번호: ${order.order_code}`,
            `고객: ${order.customer_name} / ${formatPhone(order.customer_phone)}`,
            `수령: ${order.fulfillment_type === "delivery" ? "배달" : "픽업"}`,
            `결제방법: ${paymentMethodLabel(order.payment_method)}`,
            order.delivery_address
              ? `주소: ${order.delivery_address}${order.delivery_address_detail ? ` ${order.delivery_address_detail}` : ""}`
              : null,
            `주문상태: ${orderStatusLabel(order.status)}`,
            `가격상태: ${priceStatusLabel(order.price_status)}`,
            `결제상태: ${paymentStatusLabel(order.payment_status)}`,
            order.payment_method === "card_on_delivery" && order.customer_price_confirmed_at
              ? `고객 가격동의: ${formatDate(order.customer_price_confirmed_at)}`
              : null,
            "",
            "상품:",
            ...order.order_items.map(
              (item) =>
                `- ${item.product_name} ${item.quantity}개 / 단가 ${formatKrw(item.unit_price)} / 합계 ${formatKrw(item.line_total)}`
            ),
            "",
            `상품 합계: ${formatKrw(order.subtotal_amount)}`,
            `배달비: ${formatKrw(order.delivery_fee)}`,
            `총액: ${formatKrw(order.total_amount)}`,
            order.price_note ? `가격 메모: ${order.price_note}` : null,
            order.customer_note ? `요청사항: ${order.customer_note}` : null,
          ]
            .filter(Boolean)
            .join("\n")

          return (
            <article key={order.id} className={`mq-card border p-4 ${priorityMeta.containerClass}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">#{order.order_code}</p>
                  <p className="text-xs text-zinc-500">접수: {formatDate(order.created_at)}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {priorityMeta.label ? (
                    <span className={`rounded-full px-2 py-1 font-semibold ${priorityMeta.labelClass}`}>
                      {priorityMeta.label}
                    </span>
                  ) : null}
                  {["all", "quote", "prep", "delivery"].includes(selectedWorkView) ? (
                    <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                      주문 {orderStatusLabel(order.status)}
                    </span>
                  ) : null}
                  {["all", "quote"].includes(selectedWorkView) ? (
                    <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                      가격 {priceStatusLabel(order.price_status)}
                    </span>
                  ) : null}
                  {["all", "payment"].includes(selectedWorkView) ? (
                    <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                      결제 {paymentStatusLabel(order.payment_status)}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">
                    {paymentMethodLabel(order.payment_method)}
                  </span>
                </div>
              </div>
              <div className="mt-2">
                <OrderTools
                  orderCode={order.order_code}
                  summaryText={orderSummaryText}
                  trackingUrl={trackingUrl}
                  customerGuideText={customerGuideText}
                />
              </div>
              {canSendQuoteSms ? (
                <div className="mt-2">
                  <a
                    href={quoteSmsHref}
                    className="inline-flex rounded-lg bg-zinc-950 px-3 py-2 text-sm font-bold text-white hover:bg-zinc-800"
                  >
                    가격확정 문자 보내기
                  </a>
                </div>
              ) : null}
              {canSendPaymentConfirmedSms ? (
                <div className="mt-2">
                  <a
                    href={paymentConfirmedSmsHref}
                    className="inline-flex rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800"
                  >
                    입금확인 문자 보내기
                  </a>
                </div>
              ) : null}
              {canSendDeliveryStartedSms ? (
                <div className="mt-2">
                  <a
                    href={deliveryStartedSmsHref}
                    className="inline-flex rounded-lg bg-cyan-700 px-3 py-2 text-sm font-bold text-white hover:bg-cyan-800"
                  >
                    배송시작 문자 보내기
                  </a>
                </div>
              ) : null}
              {canSendDeliveryCompletedSms ? (
                <div className="mt-2">
                  <a
                    href={deliveryCompletedSmsHref}
                    className="inline-flex rounded-lg bg-sky-700 px-3 py-2 text-sm font-bold text-white hover:bg-sky-800"
                  >
                    배송완료 문자 보내기
                  </a>
                </div>
              ) : null}

              <div className="mt-3 grid gap-1 text-sm text-zinc-700">
                <p>
                  고객: {order.customer_name} / {formatPhone(order.customer_phone)}
                </p>
                <p>수령: {order.fulfillment_type === "delivery" ? "배달" : "픽업"}</p>
                {order.fulfillment_type === "delivery" ? (
                  <p>
                    주소: {order.delivery_address}
                    {order.delivery_address_detail ? ` ${order.delivery_address_detail}` : ""}
                  </p>
                ) : null}
                {order.customer_note ? <p>요청사항: {order.customer_note}</p> : null}
                {order.price_note ? <p>가격 메모: {order.price_note}</p> : null}
                {order.payment_method === "card_on_delivery" && order.payment_status === "waiting_card_payment" ? (
                  <p className="font-semibold text-violet-800">
                    {order.customer_price_confirmed_at
                      ? `고객 가격동의 완료: ${formatDate(order.customer_price_confirmed_at)}`
                      : "고객 가격동의 대기 중"}
                  </p>
                ) : null}
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-zinc-500">
                      <th className="px-2 py-1 font-medium">상품</th>
                      <th className="px-2 py-1 font-medium">수량</th>
                      <th className="px-2 py-1 font-medium">단가</th>
                      <th className="px-2 py-1 font-medium">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.order_items.map((item) => (
                      <tr key={item.id} className="border-t border-zinc-100 text-zinc-700">
                        <td className="px-2 py-1">{item.product_name}</td>
                        <td className="px-2 py-1">{item.quantity}</td>
                        <td className="px-2 py-1">{formatKrw(item.unit_price)}</td>
                        <td className="px-2 py-1">{formatKrw(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 grid gap-1 text-sm text-zinc-700">
                <p>현재 계산 가능 상품 합계: {formatKrw(knownLineTotal)}</p>
                {hasUnknownLine ? <p className="text-xs text-amber-700">미가격 상품 포함</p> : null}
                <p>확정 상품 합계: {formatKrw(order.subtotal_amount)}</p>
                <p>확정 배달비: {formatKrw(order.delivery_fee)}</p>
                <p className="font-semibold text-zinc-900">총액: {formatKrw(order.total_amount)}</p>
              </div>

              <div className={`mt-4 grid gap-3 ${actionGridClass}`}>
                {canManageQuote ? (
                  <QuoteForm
                    orderId={order.id}
                    storeSlug={selectedStore.slug}
                    returnTo={actionReturnTo}
                    actorView={selectedWorkView}
                    items={order.order_items}
                    defaultDeliveryFee={defaultDeliveryFee}
                    priceNote={order.price_note}
                    isPaymentConfirmed={isPaymentConfirmed}
                  />
                ) : null}

                {showStatusForm ? (
                  <form action={setOrderStatusAction} className="rounded-xl border border-brand-border p-3">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="storeSlug" value={selectedStore.slug} />
                    <input type="hidden" name="returnTo" value={actionReturnTo} />
                    <input type="hidden" name="actorView" value={selectedWorkView} />
                    <p className="text-sm font-semibold text-zinc-900">{statusPanelTitle}</p>
                    <p className="mt-1 text-xs text-zinc-600">
                      현재 상태: <span className="font-semibold text-zinc-900">{orderStatusLabel(order.status)}</span>
                    </p>
                    {primaryStatusOptions.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {primaryStatusOptions.map((status) => (
                          <button
                            key={status}
                            type="submit"
                            name="status"
                            value={status}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                              order.status === status
                                ? "bg-brand text-white ring-2 ring-brand-border"
                                : "bg-brand-soft text-brand-strong hover:bg-brand-border"
                            }`}
                          >
                            {orderStatusLabel(status)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-zinc-600">이 뷰에서는 주문 취소만 처리합니다.</p>
                    )}
                    {canCancelOrder ? (
                      <>
                        <label className="mt-2 grid gap-1 text-xs text-zinc-600">
                          취소 사유
                          <input
                            name="statusNote"
                            defaultValue={order.cancel_reason ?? ""}
                            className="h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-brand focus:outline-none"
                            placeholder="취소할 때만 입력"
                          />
                        </label>
                        <button
                          type="submit"
                          name="status"
                          value="canceled"
                          className={`mt-3 h-9 w-full rounded-md text-sm font-semibold text-white ${
                            order.status === "canceled"
                              ? "bg-rose-700 ring-2 ring-rose-200"
                              : "bg-rose-600 hover:bg-rose-700"
                          }`}
                        >
                          주문 취소
                        </button>
                      </>
                    ) : null}
                  </form>
                ) : null}

                {canManagePayment ? (
                  <form action={setPaymentStatusAction} className="rounded-xl border border-brand-border p-3">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="storeSlug" value={selectedStore.slug} />
                    <input type="hidden" name="returnTo" value={actionReturnTo} />
                    <input type="hidden" name="actorView" value={selectedWorkView} />
                    <p className="text-sm font-semibold text-zinc-900">결제 상태 빠른 변경</p>
                    <p className="mt-1 text-xs text-zinc-600">
                      현재 상태:{" "}
                      <span className="font-semibold text-zinc-900">
                        {paymentStatusLabel(order.payment_status)}
                      </span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        { key: "waiting_transfer", label: "입금대기" },
                        { key: "confirmed", label: "입금확인" },
                        { key: "rejected", label: "반려" },
                      ].map((option) => (
                        <button
                          key={option.key}
                          type="submit"
                          name="paymentStatus"
                          value={option.key}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                            order.payment_status === option.key
                              ? "bg-brand text-white ring-2 ring-brand-border"
                              : "bg-brand-soft text-brand-strong hover:bg-brand-border"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </form>
                ) : null}
              </div>

              {order.transfer_reports.length > 0 ? (
                <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">
                  <p className="font-semibold text-zinc-900">입금 신고 내역</p>
                  <div className="mt-2 flex flex-col gap-1">
                    {order.transfer_reports.map((report) => (
                      <p key={report.id}>
                        {formatDate(report.created_at)} / {report.depositor_name} /{" "}
                        {formatKrw(report.transferred_amount)} / {report.status}
                        {report.note ? ` / ${report.note}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
        {filteredOrders.length === 0 ? (
          <article className="mq-card p-5 text-sm text-zinc-600">
            조건에 맞는 주문이 없습니다. ({ORDER_WORK_VIEW_META[selectedWorkView].label})
          </article>
        ) : null}
      </section>
    </main>
  )
}
