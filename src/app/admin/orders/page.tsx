import Link from "next/link"

import { getAdminOrdersByStoreId, getAdminStores } from "@/lib/mystoreqr/admin-queries"
import { ORDER_STATUS_OPTIONS, PAYMENT_STATUS_OPTIONS } from "@/lib/mystoreqr/constants"
import { formatKrw, formatPhone } from "@/lib/mystoreqr/format"
import { orderStatusLabel, paymentStatusLabel, priceStatusLabel } from "@/lib/mystoreqr/status"

import { setOrderQuoteAction, setOrderStatusAction, setPaymentStatusAction } from "./actions"

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
})

function firstString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

export default async function AdminOrdersPage(props: PageProps<"/admin/orders">) {
  const searchParams = await props.searchParams
  const storeSlugParam = firstString(searchParams.store)?.trim().toLowerCase()
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

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:px-8">
      <header className="mq-card p-5">
        <p className="text-sm font-medium text-brand-strong">MyStoreQR Admin</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">주문 보드</h1>
        <p className="mt-2 text-sm text-zinc-600">
          매장: {selectedStore.name}
          {selectedStore.phone ? ` (${formatPhone(selectedStore.phone)})` : ""}
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {stores.map((store) => (
          <Link
            key={store.id}
            href={`/admin/orders?store=${encodeURIComponent(store.slug)}`}
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

      <section className="grid gap-3 md:grid-cols-3">
        <div className="mq-card rounded-xl p-4">
          <p className="text-xs text-zinc-500">전체 주문</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{orders.length}</p>
        </div>
        <div className="mq-card rounded-xl p-4">
          <p className="text-xs text-zinc-500">가격 확정 대기</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">
            {orders.filter((order) => order.price_status === "needs_review").length}
          </p>
        </div>
        <div className="mq-card rounded-xl p-4">
          <p className="text-xs text-zinc-500">입금 확인 필요</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">
            {
              orders.filter((order) =>
                order.payment_status === "transfer_submitted" || order.payment_status === "waiting_transfer"
              ).length
            }
          </p>
        </div>
      </section>

      <section className="space-y-3">
        {orders.map((order) => {
          const knownLineTotal = order.order_items.reduce((acc, item) => acc + (item.line_total ?? 0), 0)
          const hasUnknownLine = order.order_items.some((item) => item.unit_price == null)
          const defaultSubtotal = order.subtotal_amount ?? knownLineTotal
          const defaultDeliveryFee = order.delivery_fee ?? selectedStore.delivery_fee

          return (
            <article key={order.id} className="mq-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">#{order.order_code}</p>
                  <p className="text-xs text-zinc-500">접수: {formatDate(order.created_at)}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
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
                  <p className="text-sm font-semibold text-zinc-900">가격 확정</p>
                  <label className="mt-2 grid gap-1 text-xs text-zinc-600">
                    상품 합계
                    <input
                      name="subtotalAmount"
                      type="number"
                      min={0}
                      defaultValue={defaultSubtotal}
                      className="h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-brand focus:outline-none"
                    />
                  </label>
                  <label className="mt-2 grid gap-1 text-xs text-zinc-600">
                    배달비
                    <input
                      name="deliveryFee"
                      type="number"
                      min={0}
                      defaultValue={defaultDeliveryFee}
                      className="h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-brand focus:outline-none"
                    />
                  </label>
                  <label className="mt-2 grid gap-1 text-xs text-zinc-600">
                    메모
                    <textarea
                      name="priceNote"
                      defaultValue={order.price_note ?? ""}
                      className="min-h-16 rounded-md border border-zinc-300 px-2 py-1 text-sm focus:border-brand focus:outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    className="mq-btn-primary mt-3 h-9 w-full rounded-md"
                  >
                    가격 확정 저장
                  </button>
                </form>

                <form action={setOrderStatusAction} className="rounded-xl border border-brand-border p-3">
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="storeSlug" value={selectedStore.slug} />
                  <p className="text-sm font-semibold text-zinc-900">주문 상태 변경</p>
                  <label className="mt-2 grid gap-1 text-xs text-zinc-600">
                    상태
                    <select
                      name="status"
                      defaultValue={order.status}
                      className="h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-brand focus:outline-none"
                    >
                      {ORDER_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {orderStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-2 grid gap-1 text-xs text-zinc-600">
                    취소 사유(선택)
                    <input
                      name="statusNote"
                      defaultValue={order.cancel_reason ?? ""}
                      className="h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-brand focus:outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    className="mq-btn-primary mt-3 h-9 w-full rounded-md"
                  >
                    상태 저장
                  </button>
                </form>

                <form action={setPaymentStatusAction} className="rounded-xl border border-brand-border p-3">
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="storeSlug" value={selectedStore.slug} />
                  <p className="text-sm font-semibold text-zinc-900">결제 상태 변경</p>
                  <label className="mt-2 grid gap-1 text-xs text-zinc-600">
                    결제 상태
                    <select
                      name="paymentStatus"
                      defaultValue={order.payment_status}
                      className="h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-brand focus:outline-none"
                    >
                      {PAYMENT_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {paymentStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="mq-btn-primary mt-3 h-9 w-full rounded-md"
                  >
                    결제 상태 저장
                  </button>
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
      </section>
    </main>
  )
}
