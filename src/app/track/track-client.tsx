"use client"

import refreshIcon from "@iconify-icons/mdi/refresh"
import { Icon } from "@iconify/react"
import { useCallback, useEffect, useState, type FormEvent } from "react"

import { formatCustomerOrderCode, formatKrw, normalizeCustomerOrderCode } from "@/lib/mystoreqr/format"
import { orderStatusLabel, paymentMethodLabel, paymentStatusLabel, priceStatusLabel } from "@/lib/mystoreqr/status"
import type { Database } from "@/types/database.type"

type TrackingOrder = Pick<
  Database["public"]["Tables"]["orders"]["Row"],
  | "order_code"
  | "status"
  | "payment_method"
  | "payment_status"
  | "price_status"
  | "price_note"
  | "customer_price_confirmed_at"
  | "subtotal_amount"
  | "delivery_fee"
  | "total_amount"
  | "created_at"
  | "updated_at"
>
type TrackingItem = Pick<
  Database["public"]["Tables"]["order_items"]["Row"],
  "product_name" | "quantity" | "unit_price" | "line_total"
>

type BankInfo = {
  name: string
  roadAddress: string | null
  jibunAddress: string | null
  bankName: string
  bankAccountNumber: string
  bankAccountHolder: string
}

type TrackClientProps = {
  initialLookupToken: string
  initialOrderCode: string
  initialPhone: string
  initialStoreSlug: string
  initialOrder: TrackingOrder | null
  initialItems: TrackingItem[]
  initialBankInfo: BankInfo | null
}

const ORDER_PROGRESS_STEPS = [
  { key: "pending", label: "접수" },
  { key: "preparing", label: "준비중" },
  { key: "ready_for_delivery", label: "준비완료" },
  { key: "delivering", label: "배달중" },
  { key: "completed", label: "완료" },
] as const

function getOrderStatusBadgeClass(status: TrackingOrder["status"]) {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200"
    case "delivering":
      return "bg-sky-100 text-sky-800 ring-sky-200"
    case "ready_for_delivery":
      return "bg-cyan-100 text-cyan-800 ring-cyan-200"
    case "preparing":
      return "bg-amber-100 text-amber-800 ring-amber-200"
    case "canceled":
      return "bg-rose-100 text-rose-800 ring-rose-200"
    default:
      return "bg-zinc-100 text-zinc-800 ring-zinc-200"
  }
}

function getPaymentStatusBadgeClass(status: TrackingOrder["payment_status"]) {
  switch (status) {
    case "confirmed":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200"
    case "waiting_card_payment":
      return "bg-violet-100 text-violet-800 ring-violet-200"
    case "rejected":
      return "bg-rose-100 text-rose-800 ring-rose-200"
    default:
      return "bg-zinc-100 text-zinc-800 ring-zinc-200"
  }
}

function getPriceStatusBadgeClass(status: TrackingOrder["price_status"]) {
  switch (status) {
    case "quoted":
      return "bg-brand-soft text-brand-strong ring-brand-border"
    default:
      return "bg-zinc-100 text-zinc-700 ring-zinc-200"
  }
}

function getOrderProgressIndex(status: TrackingOrder["status"]) {
  switch (status) {
    case "pending":
      return 0
    case "payment_confirmed":
      return 1
    case "preparing":
      return 1
    case "ready_for_delivery":
      return 2
    case "delivering":
      return 3
    case "completed":
      return 4
    case "canceled":
      return -1
    default:
      return 0
  }
}

function getCustomerProgressIndex(order: TrackingOrder) {
  if (
    order.status === "pending" &&
    (order.payment_status === "confirmed" || order.payment_status === "transfer_submitted")
  ) {
    return 1
  }

  if (
    order.status === "pending" &&
    order.payment_method === "card_on_delivery" &&
    order.payment_status === "waiting_card_payment" &&
    order.customer_price_confirmed_at
  ) {
    return 1
  }

  return getOrderProgressIndex(order.status)
}

function getCustomerDisplayStatusLabel(order: TrackingOrder) {
  if (order.status === "pending" && order.payment_status === "confirmed") {
    return "입금확인"
  }

  if (
    order.status === "pending" &&
    order.payment_method === "card_on_delivery" &&
    order.payment_status === "waiting_card_payment"
  ) {
    return order.customer_price_confirmed_at ? "상품준비 대기" : "가격동의 대기"
  }

  if (order.status === "pending" && order.payment_status === "transfer_submitted") {
    return "입금확인 대기"
  }

  return orderStatusLabel(order.status)
}

function getCustomerDisplayStatusBadgeClass(order: TrackingOrder) {
  if (order.status === "pending" && order.payment_status === "confirmed") {
    return "bg-emerald-100 text-emerald-800 ring-emerald-200"
  }

  if (
    order.status === "pending" &&
    order.payment_method === "card_on_delivery" &&
    order.payment_status === "waiting_card_payment"
  ) {
    return order.customer_price_confirmed_at
      ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
      : "bg-violet-100 text-violet-800 ring-violet-200"
  }

  if (order.status === "pending" && order.payment_status === "transfer_submitted") {
    return "bg-sky-100 text-sky-800 ring-sky-200"
  }

  return getOrderStatusBadgeClass(order.status)
}

function getCustomerGuideMessage(order: TrackingOrder) {
  if (order.status === "canceled") {
    return "주문이 취소되었습니다. 자세한 내용은 매장에 문의해 주세요."
  }

  if (order.status === "completed") {
    return "배달이 완료되었습니다. 이용해 주셔서 감사합니다."
  }

  if (order.status === "delivering") {
    return "배달중입니다. 조금만 기다려 주세요."
  }

  if (order.status === "ready_for_delivery") {
    return "상품 준비가 완료되었습니다. 곧 배달을 시작합니다."
  }

  if (
    order.payment_method === "card_on_delivery" &&
    order.payment_status === "waiting_card_payment" &&
    order.customer_price_confirmed_at
  ) {
    return "확정 금액에 동의되었습니다. 상품을 준비하고 있습니다. 배달 시 카드로 결제해 주세요."
  }

  if (order.payment_status === "confirmed" || order.status === "payment_confirmed" || order.status === "preparing") {
    if (order.payment_method === "card_on_delivery") {
      return "상품을 준비중입니다. 배달 시 카드로 결제해 주세요."
    }

    return "입금이 확인되어 배달을 준비중입니다."
  }

  if (order.payment_status === "transfer_submitted") {
    return "입금 확인을 기다리고 있습니다. 확인이 완료되면 배달을 준비합니다."
  }

  if (order.payment_status === "rejected") {
    return "입금 확인에 문제가 있습니다. 매장에 문의해 주세요."
  }

  if (order.price_status === "quoted") {
    if (order.payment_method === "card_on_delivery") {
      return "가격이 확정되었습니다. 확정 금액에 동의하면 상품을 준비합니다."
    }

    return "가격이 확정되었습니다. 입금해 주세요. 입금이 확인되면 배달을 준비합니다."
  }

  return "가격이 확정되기를 기다리고 있습니다. 가격이 확정되면 입금해 주세요."
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
})

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  timeStyle: "medium",
})

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

export function TrackClient({
  initialLookupToken,
  initialOrderCode,
  initialPhone,
  initialStoreSlug,
  initialOrder,
  initialItems,
  initialBankInfo,
}: TrackClientProps) {
  const [lookupToken] = useState(initialLookupToken)
  const [orderCode, setOrderCode] = useState(formatCustomerOrderCode(initialOrderCode))
  const [customerPhone, setCustomerPhone] = useState(initialPhone)
  const [storeSlug] = useState(initialStoreSlug)
  const [isLoading, setIsLoading] = useState(false)
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false)
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(20)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [order, setOrder] = useState<TrackingOrder | null>(initialOrder)
  const [orderItems, setOrderItems] = useState<TrackingItem[]>(initialItems)
  const [bankInfo, setBankInfo] = useState<BankInfo | null>(initialBankInfo)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(
    initialOrder ? new Date(initialOrder.updated_at).getTime() : null
  )
  const [urlCopied, setUrlCopied] = useState(false)
  const [accountCopied, setAccountCopied] = useState(false)
  const [depositorName, setDepositorName] = useState("")
  const [transferredAmount, setTransferredAmount] = useState(initialOrder?.total_amount ? String(initialOrder.total_amount) : "")
  const [isSubmittingTransferReport, setIsSubmittingTransferReport] = useState(false)
  const [transferReportMessage, setTransferReportMessage] = useState<string | null>(null)
  const [transferReportError, setTransferReportError] = useState<string | null>(null)
  const [isCancelingOrder, setIsCancelingOrder] = useState(false)
  const [cancelMessage, setCancelMessage] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [isConfirmingPrice, setIsConfirmingPrice] = useState(false)
  const [priceConfirmMessage, setPriceConfirmMessage] = useState<string | null>(null)
  const [priceConfirmError, setPriceConfirmError] = useState<string | null>(null)

  const fetchTracking = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (silent) {
      setIsAutoRefreshing(true)
    } else {
      setIsLoading(true)
      setErrorMessage(null)
    }

    try {
      const response = await fetch("/api/public/tracking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lookupToken: orderCode.trim() ? "" : lookupToken,
          orderCode: normalizeCustomerOrderCode(orderCode),
          customerPhone,
          storeSlug,
        }),
      })

      const payload = (await response.json()) as
        | { error: string }
        | { order: TrackingOrder; items: TrackingItem[]; bankInfo: BankInfo | null }

      if (!response.ok) {
        if (!silent) {
          setOrder(null)
          setErrorMessage("error" in payload ? payload.error : "주문 조회에 실패했습니다.")
        }
        return
      }

      if ("error" in payload) {
        if (!silent) {
          setOrder(null)
          setErrorMessage(payload.error)
        }
        return
      }

      setOrder(payload.order)
      setOrderItems(payload.items ?? [])
      if (payload.order.price_status === "quoted" && payload.order.payment_status === "waiting_transfer") {
        setTransferredAmount((current) => current || String(payload.order.total_amount))
      }
      if (payload.bankInfo) {
        setBankInfo(payload.bankInfo)
      }
      setLastSyncedAt(Date.now())
      if (payload.order.customer_price_confirmed_at) {
        setPriceConfirmMessage(null)
        setPriceConfirmError(null)
      }
    } catch {
      if (!silent) {
        setOrder(null)
        setErrorMessage("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
      }
    } finally {
      if (silent) {
        setIsAutoRefreshing(false)
      } else {
        setIsLoading(false)
      }
    }
  }, [lookupToken, orderCode, customerPhone, storeSlug])

  useEffect(() => {
    if (!autoRefreshEnabled) {
      return
    }

    if (!lookupToken.trim() && (!orderCode.trim() || !customerPhone.trim())) {
      return
    }

    const timer = window.setInterval(() => {
      void fetchTracking({ silent: true })
    }, refreshIntervalSeconds * 1000)

    return () => window.clearInterval(timer)
  }, [autoRefreshEnabled, refreshIntervalSeconds, lookupToken, orderCode, customerPhone, fetchTracking])

  async function copyCurrentTrackingUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 1200)
    } catch {
      setUrlCopied(false)
    }
  }

  async function copyBankAccountNumber() {
    if (!bankInfo) {
      return
    }

    try {
      await navigator.clipboard.writeText(bankInfo.bankAccountNumber)
      setAccountCopied(true)
      setTimeout(() => setAccountCopied(false), 1200)
    } catch {
      setAccountCopied(false)
    }
  }

  async function submitTransferReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!order) {
      return
    }

    const amount = Number(transferredAmount.replace(/[^0-9]/g, ""))

    setIsSubmittingTransferReport(true)
    setTransferReportMessage(null)
    setTransferReportError(null)

    try {
      const response = await fetch("/api/public/transfer-reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderCode: order.order_code,
          customerPhone,
          storeSlug,
          depositorName,
          transferredAmount: amount,
        }),
      })

      const payload = (await response.json()) as { error?: string; message?: string }

      if (!response.ok || payload.error) {
        setTransferReportError(payload.error ?? "입금 신고에 실패했습니다.")
        return
      }

      setTransferReportMessage(payload.message ?? "입금 신고가 접수되었습니다. 매장 확인을 기다려 주세요.")
      void fetchTracking({ silent: true })
    } catch {
      setTransferReportError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setIsSubmittingTransferReport(false)
    }
  }

  async function confirmCardPrice() {
    if (!order) {
      return
    }

    setIsConfirmingPrice(true)
    setPriceConfirmMessage(null)
    setPriceConfirmError(null)

    try {
      const response = await fetch("/api/public/orders/confirm-price", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lookupToken,
          orderCode: order.order_code,
          customerPhone,
          storeSlug,
        }),
      })

      const payload = (await response.json()) as { error?: string; message?: string }

      if (!response.ok || payload.error) {
        setPriceConfirmError(payload.error ?? "금액 동의 처리에 실패했습니다.")
        return
      }

      setPriceConfirmMessage(payload.message ?? "확정 금액에 동의되었습니다.")
      void fetchTracking({ silent: true })
    } catch {
      setPriceConfirmError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setIsConfirmingPrice(false)
    }
  }

  async function cancelOrder() {
    if (!order) {
      return
    }

    const confirmed = window.confirm("아직 상품 준비 전이라 주문을 취소할 수 있습니다. 정말 취소할까요?")
    if (!confirmed) {
      return
    }

    setIsCancelingOrder(true)
    setCancelMessage(null)
    setCancelError(null)

    try {
      const response = await fetch("/api/public/orders/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderCode: order.order_code,
          customerPhone,
          storeSlug,
        }),
      })

      const payload = (await response.json()) as { error?: string; message?: string }

      if (!response.ok || payload.error) {
        setCancelError(payload.error ?? "주문 취소에 실패했습니다.")
        return
      }

      setCancelMessage(payload.message ?? "주문이 취소되었습니다.")
      void fetchTracking({ silent: true })
    } catch {
      setCancelError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setIsCancelingOrder(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:px-6">
      <header className="mq-card p-5">
        <p className="text-sm font-medium text-brand-strong">MyStoreQR</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">주문 추적</h1>
        <p className="mt-2 text-sm text-zinc-600">
          주문번호와 연락처를 입력하면 현재 상태를 확인할 수 있습니다.
        </p>
      </header>

      <section className="mq-card p-5">
        {bankInfo ? (
          <div className="mb-4 rounded-lg bg-brand-soft px-3 py-3 text-sm text-zinc-700">
            <p className="font-semibold text-zinc-900">{bankInfo.name}</p>
            {bankInfo.roadAddress ? <p className="mt-1">{bankInfo.roadAddress}</p> : null}
            {bankInfo.jibunAddress ? <p className="mt-0.5 text-xs text-zinc-500">지번: {bankInfo.jibunAddress}</p> : null}
            {storeSlug ? (
              <a
                href={`/s/${encodeURIComponent(storeSlug)}`}
                className="mt-3 inline-flex rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-strong"
              >
                {bankInfo.name}에서 다시 주문하기
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">주문번호</span>
            <input
              value={orderCode}
              onChange={(event) => setOrderCode(event.target.value.toUpperCase())}
              className="mq-input"
              placeholder="예: 0001"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">연락처</span>
            <input
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              className="mq-input"
              placeholder="01012345678"
            />
          </label>

        </div>

        {errorMessage ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
        ) : null}

        <button
          type="button"
          onClick={() => void fetchTracking()}
          disabled={isLoading}
          className="mq-btn-primary mt-4 h-11 w-full"
        >
          {isLoading ? "조회 중..." : "주문 조회"}
        </button>

        <div className="mt-3 rounded-lg bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
              />
              자동 새로고침
            </label>
            <label className="inline-flex items-center gap-2 text-xs">
              주기
              <select
                value={refreshIntervalSeconds}
                onChange={(event) => setRefreshIntervalSeconds(Number(event.target.value))}
                disabled={!autoRefreshEnabled}
                className="h-8 rounded-md border border-zinc-300 px-2 text-xs disabled:bg-zinc-100"
              >
                <option value={10}>10초</option>
                <option value={20}>20초</option>
                <option value={30}>30초</option>
                <option value={60}>60초</option>
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            마지막 갱신: {lastSyncedAt ? timeFormatter.format(new Date(lastSyncedAt)) : "아직 없음"}
            {isAutoRefreshing ? " · 자동 갱신 중..." : ""}
          </p>
        </div>
      </section>

      {order ? (
        <section className="mq-card flex flex-col gap-3 p-5">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold text-zinc-500">조회 결과</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-black text-zinc-950">
                주문번호 {formatCustomerOrderCode(order.order_code)}
              </h2>
              <button
                type="button"
                onClick={() => void fetchTracking({ silent: true })}
                disabled={isAutoRefreshing}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-400"
              >
                <Icon
                  icon={refreshIcon}
                  className={`h-4 w-4 ${isAutoRefreshing ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {isAutoRefreshing ? "새로고침 중..." : "새로고침"}
              </button>
            </div>
          </div>

          {order.price_status === "needs_review" && order.status !== "canceled" ? (
            <div className="rounded-2xl border-2 border-brand bg-brand-soft p-5 text-zinc-900 shadow-sm">
              <p className="text-sm font-bold text-brand-strong">지금 할 일</p>
              <h2 className="mt-1 text-2xl font-black">최종 금액이 확정되기를 기다려주세요</h2>
              <p className="mt-3 text-sm font-medium leading-6 text-zinc-700">
                매장에서 상품 가격과 배달비를 확인한 뒤 확정 금액을 안내합니다.
              </p>
              {order.status === "pending" && order.payment_status === "not_ready" ? (
                <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-brand-border">
                  <p className="text-sm font-semibold text-zinc-900">주문을 잘못 접수했나요?</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-600">
                    가격이 확정되기 전에는 직접 주문을 취소할 수 있습니다.
                  </p>
                  {cancelError ? (
                    <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                      {cancelError}
                    </p>
                  ) : null}
                  {cancelMessage ? (
                    <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                      {cancelMessage}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void cancelOrder()}
                    disabled={isCancelingOrder}
                    className="mt-3 h-10 rounded-lg border border-rose-200 px-3 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCancelingOrder ? "취소 중..." : "주문 취소하기"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {bankInfo && order.price_status === "quoted" && order.payment_status === "waiting_transfer" ? (
            <div className="rounded-2xl border-2 border-brand bg-brand-soft p-5 text-zinc-900 shadow-sm">
              <p className="text-sm font-bold text-brand-strong">지금 할 일</p>
              <h2 className="mt-1 text-2xl font-black">확정 금액을 입금해 주세요</h2>
              <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-brand-border">
                <p className="text-xs font-semibold text-zinc-500">입금할 금액</p>
                <p className="mt-1 text-4xl font-black tracking-normal text-zinc-950">
                  {formatKrw(order.total_amount)}
                </p>
              </div>
              <div className="mt-3 grid gap-2 rounded-xl bg-white p-4 text-sm ring-1 ring-brand-border">
                <p className="font-bold text-zinc-900">{bankInfo.name} 계좌</p>
                <p>
                  {bankInfo.bankName} <span className="font-extrabold text-zinc-950">{bankInfo.bankAccountNumber}</span>
                </p>
                <p>예금주: {bankInfo.bankAccountHolder}</p>
                <button
                  type="button"
                  onClick={() => void copyBankAccountNumber()}
                  className="mt-1 h-10 rounded-lg bg-brand px-3 text-sm font-bold text-white hover:bg-brand-strong"
                >
                  {accountCopied ? "계좌번호 복사됨" : "계좌번호 복사"}
                </button>
              </div>
              <p className="mt-3 text-sm font-medium leading-6 text-zinc-700">
                입금 후 매장에서 확인하면 상품 준비가 시작됩니다.
              </p>
              <form onSubmit={(event) => void submitTransferReport(event)} className="mt-4 grid gap-3 rounded-xl bg-white p-4 ring-1 ring-brand-border">
                <div className="grid gap-1 text-sm">
                  <label htmlFor="depositor-name" className="font-bold text-zinc-900">
                    입금자명
                  </label>
                  <input
                    id="depositor-name"
                    value={depositorName}
                    onChange={(event) => setDepositorName(event.target.value)}
                    className="mq-input"
                    placeholder="예: 홍길동"
                    required
                  />
                </div>
                <div className="grid gap-1 text-sm">
                  <label htmlFor="transferred-amount" className="font-bold text-zinc-900">
                    입금액
                  </label>
                  <input
                    id="transferred-amount"
                    value={transferredAmount}
                    onChange={(event) => setTransferredAmount(event.target.value.replace(/[^0-9]/g, ""))}
                    className="mq-input"
                    inputMode="numeric"
                    placeholder={String(order.total_amount)}
                    required
                  />
                </div>
                {transferReportError ? (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                    {transferReportError}
                  </p>
                ) : null}
                {transferReportMessage ? (
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                    {transferReportMessage}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={isSubmittingTransferReport}
                  className="h-11 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {isSubmittingTransferReport ? "신고 중..." : "입금신고하기"}
                </button>
              </form>
            </div>
          ) : null}

          {order.price_status === "quoted" &&
          order.payment_method === "card_on_delivery" &&
          order.payment_status === "waiting_card_payment" ? (
            <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 p-5 text-zinc-900 shadow-sm">
              <p className="text-sm font-bold text-violet-800">지금 할 일</p>
              {order.customer_price_confirmed_at ? (
                <>
                  <h2 className="mt-1 text-2xl font-black">주문 진행에 동의되었습니다</h2>
                  <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-violet-200">
                    <p className="text-xs font-semibold text-zinc-500">배달 시 카드결제 금액</p>
                    <p className="mt-1 text-4xl font-black tracking-normal text-zinc-950">
                      {formatKrw(order.total_amount)}
                    </p>
                  </div>
                  <p className="mt-3 text-sm font-medium leading-6 text-zinc-700">
                    상품을 준비하고 있습니다. 배달 시 카드로 결제해 주세요.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="mt-1 text-2xl font-black">확정 금액을 확인해 주세요</h2>
                  <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-violet-200">
                    <p className="text-xs font-semibold text-zinc-500">배달 시 카드결제 금액</p>
                    <p className="mt-1 text-4xl font-black tracking-normal text-zinc-950">
                      {formatKrw(order.total_amount)}
                    </p>
                  </div>
                  <p className="mt-3 text-sm font-medium leading-6 text-zinc-700">
                    이 금액으로 진행에 동의하면 매장에서 상품을 준비합니다. 결제는 배달받을 때 카드로 하시면 됩니다.
                  </p>
                  {priceConfirmError ? (
                    <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                      {priceConfirmError}
                    </p>
                  ) : null}
                  {priceConfirmMessage ? (
                    <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                      {priceConfirmMessage}
                    </p>
                  ) : null}
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void confirmCardPrice()}
                      disabled={isConfirmingPrice}
                      className="h-11 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                      {isConfirmingPrice ? "처리 중..." : "이 금액으로 주문 진행하기"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void cancelOrder()}
                      disabled={isCancelingOrder}
                      className="h-11 rounded-lg border border-rose-200 px-4 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCancelingOrder ? "취소 중..." : "주문 취소하기"}
                    </button>
                  </div>
                  {cancelError ? (
                    <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                      {cancelError}
                    </p>
                  ) : null}
                  {cancelMessage ? (
                    <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                      {cancelMessage}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {order.price_status === "quoted" && order.payment_status === "transfer_submitted" ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              <p className="font-bold">입금 확인을 기다리고 있습니다.</p>
              <p className="mt-1">매장에서 입금을 확인하면 상품 준비가 시작됩니다.</p>
            </div>
          ) : null}

          {bankInfo && order.price_status === "quoted" && order.payment_status === "rejected" ? (
            <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-5 text-zinc-900">
              <p className="text-sm font-bold text-rose-700">입금 확인에 문제가 있습니다</p>
              <h2 className="mt-1 text-xl font-black">금액과 계좌를 다시 확인해 주세요</h2>
              <div className="mt-3 rounded-xl bg-white p-4 text-sm ring-1 ring-rose-100">
                <p>입금할 금액: <strong>{formatKrw(order.total_amount)}</strong></p>
                <p className="mt-1">
                  {bankInfo.bankName} <strong>{bankInfo.bankAccountNumber}</strong>
                </p>
                <p>예금주: {bankInfo.bankAccountHolder}</p>
              </div>
            </div>
          ) : null}

          {(() => {
            const progressIndex = getCustomerProgressIndex(order)
            const isCanceled = order.status === "canceled"
            const guideMessage = getCustomerGuideMessage(order)

            return (
              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                <p className="text-sm font-semibold text-zinc-900">주문 진행 단계</p>
                {isCanceled ? (
                  <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    주문이 취소되었습니다. 매장에 문의해 주세요.
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-5 gap-1.5">
                    {ORDER_PROGRESS_STEPS.map((step, index) => {
                      const isActive = index <= progressIndex
                      const isCurrent = index === progressIndex

                      return (
                        <div key={step.key} className="text-center">
                          <div
                            className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
                              isActive
                                ? "bg-brand text-white"
                                : "bg-zinc-100 text-zinc-500"
                            } ${isCurrent ? "ring-2 ring-brand-border" : ""}`}
                          >
                            {index + 1}
                          </div>
                          <p
                            className={`mt-1 text-xs ${isActive ? "font-semibold text-zinc-900" : "text-zinc-500"}`}
                          >
                            {step.label}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
                <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700">
                  {guideMessage}
                </p>
              </div>
            )
          })()}

          <h2 className="text-lg font-semibold text-zinc-900">주문 정보</h2>
          <button
            type="button"
            onClick={() => void copyCurrentTrackingUrl()}
            className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
          >
            {urlCopied ? "링크 복사됨" : "현재 조회링크 복사"}
          </button>
          <div className="rounded-xl border border-brand-border bg-brand-soft p-4">
            <p className="text-xs font-medium text-brand-strong">현재 진행 상태</p>
            <p
              className={`mt-2 inline-flex rounded-full px-3 py-1.5 text-lg font-extrabold ring-1 ${getCustomerDisplayStatusBadgeClass(order)}`}
            >
              {getCustomerDisplayStatusLabel(order)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-zinc-100 px-3 py-1 font-semibold text-zinc-700 ring-1 ring-zinc-200">
              {paymentMethodLabel(order.payment_method)}
            </span>
            <span className={`rounded-full px-3 py-1 font-semibold ring-1 ${getPaymentStatusBadgeClass(order.payment_status)}`}>
              결제 {paymentStatusLabel(order.payment_status)}
            </span>
            <span className={`rounded-full px-3 py-1 font-semibold ring-1 ${getPriceStatusBadgeClass(order.price_status)}`}>
              가격 {priceStatusLabel(order.price_status)}
            </span>
          </div>

          <div className="grid gap-2 text-sm text-zinc-700">
            <p className="flex justify-between gap-2">
              <span>주문번호</span>
              <strong>{formatCustomerOrderCode(order.order_code)}</strong>
            </p>
            <p className="flex justify-between gap-2">
              <span>상품 합계</span>
              <strong>{formatKrw(order.subtotal_amount)}</strong>
            </p>
            <p className="flex justify-between gap-2">
              <span>배달비</span>
              <strong>{formatKrw(order.delivery_fee)}</strong>
            </p>
            <p className="flex justify-between gap-2 border-t border-zinc-200 pt-2 text-base text-zinc-900">
              <span>총 결제 금액</span>
              <strong>{formatKrw(order.total_amount)}</strong>
            </p>
            <p className="text-xs text-zinc-500">접수: {formatDate(order.created_at)}</p>
            <p className="text-xs text-zinc-500">최근 갱신: {formatDate(order.updated_at)}</p>
          </div>

          {order.price_note ? (
            <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              <p className="font-medium">사장님 메모</p>
              <p className="mt-1 whitespace-pre-wrap">{order.price_note}</p>
            </div>
          ) : null}

          {orderItems.length > 0 ? (
            <div className="rounded-lg border border-zinc-200 p-3">
              <p className="text-sm font-semibold text-zinc-900">확정 상품 가격</p>
              <div className="mt-2 flex flex-col gap-1 text-sm text-zinc-700">
                {orderItems.map((item) => (
                  <p key={`${item.product_name}-${item.quantity}-${item.unit_price ?? "na"}`}>
                    {item.product_name} / {item.quantity}개 / 단가 {formatKrw(item.unit_price)} / 합계{" "}
                    {formatKrw(item.line_total)}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

        </section>
      ) : null}
    </main>
  )
}
