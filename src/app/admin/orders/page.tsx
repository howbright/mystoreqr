import Link from "next/link"

import { logoutAdminAction } from "@/app/admin/_actions/auth"
import { requireAdminSessionOrRedirect } from "@/lib/mystoreqr/admin-auth"
import { ORDER_STATUS_OPTIONS, PAYMENT_STATUS_OPTIONS } from "@/lib/mystoreqr/constants"
import { getAdminOrdersByStoreId, getAdminStores } from "@/lib/mystoreqr/admin-queries"
import { formatKrw, formatPhone } from "@/lib/mystoreqr/format"
import { orderStatusLabel, paymentStatusLabel, priceStatusLabel } from "@/lib/mystoreqr/status"

import { OrderTools } from "./order-tools"
import { setOrderQuoteAction, setOrderStatusAction, setPaymentStatusAction } from "./actions"

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
})

const PRICE_STATUS_OPTIONS = ["needs_review", "quoted"] as const

function firstString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

function getAppBaseUrl() {
  const envBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (envBaseUrl) {
    return envBaseUrl.replace(/\/$/, "")
  }

  return "http://localhost:3000"
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

  if (order.status === "delivering") {
    return {
      containerClass: "border-emerald-300 bg-emerald-50/30",
      label: "진행중: 배달중",
      labelClass: "bg-emerald-100 text-emerald-800",
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
  const statusFilterRaw = firstString(searchParams.status)?.trim()
  const paymentFilterRaw = firstString(searchParams.payment)?.trim()
  const priceFilterRaw = firstString(searchParams.price)?.trim()
  const keywordFilter = firstString(searchParams.q)?.trim() ?? ""
  const successMessage = firstString(searchParams.ok)
  const errorMessage = firstString(searchParams.error)

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
  const normalizedKeyword = keywordFilter.toLowerCase()
  const filteredOrders = orders.filter((order) => {
    if (statusFilter !== "all" && order.status !== statusFilter) {
      return false
    }

    if (paymentFilter !== "all" && order.payment_status !== paymentFilter) {
      return false
    }

    if (priceFilter !== "all" && order.price_status !== priceFilter) {
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
  const hasActiveFilters =
    statusFilter !== "all" ||
    paymentFilter !== "all" ||
    priceFilter !== "all" ||
    normalizedKeyword.length > 0
  const persistentFilterParams = new URLSearchParams()
  if (statusFilter !== "all") {
    persistentFilterParams.set("status", statusFilter)
  }
  if (paymentFilter !== "all") {
    persistentFilterParams.set("payment", paymentFilter)
  }
  if (priceFilter !== "all") {
    persistentFilterParams.set("price", priceFilter)
  }
  if (keywordFilter) {
    persistentFilterParams.set("q", keywordFilter)
  }
  function buildOrdersHref(storeSlug: string) {
    const params = new URLSearchParams(persistentFilterParams)
    params.set("store", storeSlug)
    return `/admin/orders?${params.toString()}`
  }
  const resetFiltersHref = `/admin/orders?store=${encodeURIComponent(selectedStore.slug)}`
  const actionReturnTo = buildOrdersHref(selectedStore.slug)
  const appBaseUrl = getAppBaseUrl()

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:px-8">
      <header className="mq-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-brand-strong">MyStoreQR Admin</p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-900">주문 보드</h1>
            <p className="mt-2 text-sm text-zinc-600">
              매장: {selectedStore.name}
              {selectedStore.phone ? ` (${formatPhone(selectedStore.phone)})` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
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

      {successMessage ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
      ) : null}

      <section className="mq-card p-4">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input type="hidden" name="store" value={selectedStore.slug} />
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
          <label className="grid gap-1 text-xs text-zinc-600 xl:col-span-2">
            검색 (주문번호/고객명/연락처/주소)
            <div className="flex gap-2">
              <input
                name="q"
                defaultValue={keywordFilter}
                className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm focus:border-brand focus:outline-none"
                placeholder="예: 0101234, 홍길동, 240511..."
              />
              <button type="submit" className="mq-btn-primary h-10 min-w-24 rounded-md">
                필터 적용
              </button>
              <Link
                href={resetFiltersHref}
                className="inline-flex h-10 min-w-24 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                초기화
              </Link>
            </div>
          </label>
        </form>
        {hasActiveFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">필터 적용중</span>
            {statusFilter !== "all" ? (
              <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                주문: {orderStatusLabel(statusFilter)}
              </span>
            ) : null}
            {paymentFilter !== "all" ? (
              <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                결제: {paymentStatusLabel(paymentFilter)}
              </span>
            ) : null}
            {priceFilter !== "all" ? (
              <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                가격: {priceStatusLabel(priceFilter)}
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

      <section className="grid gap-3 md:grid-cols-3">
        <div className="mq-card rounded-xl p-4">
          <p className="text-xs text-zinc-500">현재 목록 주문</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{filteredOrders.length}</p>
        </div>
        <div className="mq-card rounded-xl p-4">
          <p className="text-xs text-zinc-500">가격 확정 대기</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">
            {filteredOrders.filter((order) => order.price_status === "needs_review").length}
          </p>
        </div>
        <div className="mq-card rounded-xl p-4">
          <p className="text-xs text-zinc-500">입금 확인 필요</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">
            {
              filteredOrders.filter((order) =>
                order.payment_status === "transfer_submitted" || order.payment_status === "waiting_transfer"
              ).length
            }
          </p>
        </div>
      </section>

      <section className="space-y-3">
        {filteredOrders.map((order) => {
          const knownLineTotal = order.order_items.reduce((acc, item) => acc + (item.line_total ?? 0), 0)
          const hasUnknownLine = order.order_items.some((item) => item.unit_price == null)
          const defaultSubtotal = order.subtotal_amount ?? knownLineTotal
          const defaultDeliveryFee = order.delivery_fee ?? selectedStore.delivery_fee
          const isPaymentConfirmed = order.payment_status === "confirmed"
          const priorityMeta = getOrderPriorityMeta(order)
          const trackingPath = `/track?token=${encodeURIComponent(order.lookup_token)}&phone=${encodeURIComponent(order.customer_phone)}&store=${encodeURIComponent(selectedStore.slug)}`
          const trackingUrl = `${appBaseUrl}${trackingPath}`
          const customerGuideText = [
            `${order.customer_name}님, ${selectedStore.name}입니다.`,
            `주문번호: ${order.order_code}`,
            `확정 금액: ${formatKrw(order.total_amount)}`,
            `입금 계좌: ${selectedStore.bank_name} ${selectedStore.bank_account_number} (예금주 ${selectedStore.bank_account_holder})`,
            `주문 조회: ${trackingUrl}`,
            "감사합니다.",
          ].join("\n")
          const orderSummaryText = [
            `주문번호: ${order.order_code}`,
            `고객: ${order.customer_name} / ${formatPhone(order.customer_phone)}`,
            `수령: ${order.fulfillment_type === "delivery" ? "배달" : "픽업"}`,
            order.delivery_address
              ? `주소: ${order.delivery_address}${order.delivery_address_detail ? ` ${order.delivery_address_detail}` : ""}`
              : null,
            `주문상태: ${orderStatusLabel(order.status)}`,
            `가격상태: ${priceStatusLabel(order.price_status)}`,
            `결제상태: ${paymentStatusLabel(order.payment_status)}`,
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
                  <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                    주문 {orderStatusLabel(order.status)}
                  </span>
                  <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                    가격 {priceStatusLabel(order.price_status)}
                  </span>
                  <span className="rounded-full bg-brand-soft px-2 py-1 text-brand-strong">
                    결제 {paymentStatusLabel(order.payment_status)}
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

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <form action={setOrderQuoteAction} className="rounded-xl border border-brand-border p-3">
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="storeSlug" value={selectedStore.slug} />
                  <input type="hidden" name="returnTo" value={actionReturnTo} />
                  <p className="text-sm font-semibold text-zinc-900">가격 확정</p>
                  {isPaymentConfirmed ? (
                    <p className="mt-2 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                      입금확인 완료 주문은 가격을 수정할 수 없습니다.
                    </p>
                  ) : null}
                  <div className="mt-2 rounded-lg border border-zinc-200 p-2">
                    <p className="text-xs font-medium text-zinc-700">상품별 단가 입력</p>
                    <div className="mt-2 space-y-2">
                      {order.order_items.map((item) => (
                        <label key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs text-zinc-600">
                          <span>
                            {item.product_name} ({item.quantity}개)
                          </span>
                          <input
                            name={`itemPrice__${item.id}`}
                            type="number"
                            min={0}
                            defaultValue={item.unit_price ?? ""}
                            disabled={isPaymentConfirmed}
                            className="h-8 w-24 rounded-md border border-zinc-300 px-2 text-right text-sm disabled:cursor-not-allowed disabled:bg-zinc-100 focus:border-brand focus:outline-none"
                            placeholder="단가"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-zinc-600">
                    현재 계산 기준 상품 합계: <strong>{formatKrw(defaultSubtotal)}</strong>
                  </p>
                  <label className="mt-2 grid gap-1 text-xs text-zinc-600">
                    배달비
                    <input
                      name="deliveryFee"
                      type="number"
                      min={0}
                      defaultValue={defaultDeliveryFee}
                      disabled={isPaymentConfirmed}
                      className="h-9 rounded-md border border-zinc-300 px-2 text-sm disabled:cursor-not-allowed disabled:bg-zinc-100 focus:border-brand focus:outline-none"
                    />
                  </label>
                  <label className="mt-2 grid gap-1 text-xs text-zinc-600">
                    메모
                    <textarea
                      name="priceNote"
                      defaultValue={order.price_note ?? ""}
                      disabled={isPaymentConfirmed}
                      className="min-h-16 rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:bg-zinc-100 focus:border-brand focus:outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={isPaymentConfirmed}
                    className="mq-btn-primary mt-3 h-9 w-full rounded-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    가격 확정 저장
                  </button>
                </form>

                <form action={setOrderStatusAction} className="rounded-xl border border-brand-border p-3">
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="storeSlug" value={selectedStore.slug} />
                  <input type="hidden" name="returnTo" value={actionReturnTo} />
                  <p className="text-sm font-semibold text-zinc-900">주문 상태 빠른 변경</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      { key: "preparing", label: "준비중" },
                      { key: "delivering", label: "배달중" },
                      { key: "completed", label: "완료" },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="submit"
                        name="status"
                        value={option.key}
                        className="rounded-md bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-strong hover:bg-brand-border"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
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
                    className="mt-3 h-9 w-full rounded-md bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700"
                  >
                    주문 취소
                  </button>
                </form>

                <form action={setPaymentStatusAction} className="rounded-xl border border-brand-border p-3">
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="storeSlug" value={selectedStore.slug} />
                  <input type="hidden" name="returnTo" value={actionReturnTo} />
                  <p className="text-sm font-semibold text-zinc-900">결제 상태 빠른 변경</p>
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
                        className="rounded-md bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-strong hover:bg-brand-border"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </form>
              </div>

              {order.transfer_reports.length > 0 ? (
                <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">
                  <p className="font-semibold text-zinc-900">입금 신고 내역</p>
                  <div className="mt-2 space-y-1">
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
            조건에 맞는 주문이 없습니다.
          </article>
        ) : null}
      </section>
    </main>
  )
}
