"use client"

import { useCallback, useEffect, useState } from "react"

import { formatKrw } from "@/lib/mystoreqr/format"
import { orderStatusLabel, paymentStatusLabel, priceStatusLabel } from "@/lib/mystoreqr/status"
import type { Database } from "@/types/database.type"

type TrackingOrder = Database["public"]["Functions"]["get_order_tracking_v2"]["Returns"][number]

type BankInfo = {
  name: string
  bankName: string
  bankAccountNumber: string
  bankAccountHolder: string
}

type TrackClientProps = {
  initialLookupToken: string
  initialPhone: string
  initialStoreSlug: string
  initialOrder: TrackingOrder | null
  initialBankInfo: BankInfo | null
}

function getOrderStatusBadgeClass(status: TrackingOrder["status"]) {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200"
    case "delivering":
      return "bg-sky-100 text-sky-800 ring-sky-200"
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

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
})

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeStyle: "medium",
})

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

export function TrackClient({
  initialLookupToken,
  initialPhone,
  initialStoreSlug,
  initialOrder,
  initialBankInfo,
}: TrackClientProps) {
  const [lookupToken, setLookupToken] = useState(initialLookupToken)
  const [customerPhone, setCustomerPhone] = useState(initialPhone)
  const [storeSlug, setStoreSlug] = useState(initialStoreSlug)
  const [isLoading, setIsLoading] = useState(false)
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false)
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(20)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [order, setOrder] = useState<TrackingOrder | null>(initialOrder)
  const [bankInfo, setBankInfo] = useState<BankInfo | null>(initialBankInfo)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(
    initialOrder ? new Date(initialOrder.updated_at).getTime() : null
  )

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
          lookupToken,
          customerPhone,
          storeSlug,
        }),
      })

      const payload = (await response.json()) as
        | { error: string }
        | { order: TrackingOrder; bankInfo: BankInfo | null }

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
      if (payload.bankInfo) {
        setBankInfo(payload.bankInfo)
      }
      setLastSyncedAt(Date.now())
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
  }, [lookupToken, customerPhone, storeSlug])

  useEffect(() => {
    if (!autoRefreshEnabled) {
      return
    }

    if (!lookupToken.trim() || !customerPhone.trim()) {
      return
    }

    const timer = window.setInterval(() => {
      void fetchTracking({ silent: true })
    }, refreshIntervalSeconds * 1000)

    return () => window.clearInterval(timer)
  }, [autoRefreshEnabled, refreshIntervalSeconds, lookupToken, customerPhone, fetchTracking])

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:px-6">
      <header className="mq-card p-5">
        <p className="text-sm font-medium text-brand-strong">MyStoreQR</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">주문 추적</h1>
        <p className="mt-2 text-sm text-zinc-600">
          주문 접수 후 받은 토큰과 연락처를 입력하면 현재 상태를 확인할 수 있습니다.
        </p>
      </header>

      <section className="mq-card p-5">
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">주문 조회 토큰</span>
            <input
              value={lookupToken}
              onChange={(event) => setLookupToken(event.target.value)}
              className="mq-input"
              placeholder="예: 3f6f5f63-..."
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

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">매장 슬러그 (선택)</span>
            <input
              value={storeSlug}
              onChange={(event) => setStoreSlug(event.target.value)}
              className="mq-input"
              placeholder="예: nahyun-mart"
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
        <section className="mq-card space-y-3 p-5">
          <h2 className="text-lg font-semibold text-zinc-900">주문 정보</h2>
          <div className="rounded-xl border border-brand-border bg-brand-soft p-4">
            <p className="text-xs font-medium text-brand-strong">현재 주문 상태</p>
            <p
              className={`mt-2 inline-flex rounded-full px-4 py-2 text-2xl font-extrabold ring-1 ${getOrderStatusBadgeClass(order.status)}`}
            >
              {orderStatusLabel(order.status)}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 p-3">
              <p className="text-xs text-zinc-500">결제 상태</p>
              <p
                className={`mt-1 inline-flex rounded-full px-3 py-1 text-base font-bold ring-1 ${getPaymentStatusBadgeClass(order.payment_status)}`}
              >
                {paymentStatusLabel(order.payment_status)}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3">
              <p className="text-xs text-zinc-500">가격 상태</p>
              <p
                className={`mt-1 inline-flex rounded-full px-3 py-1 text-base font-bold ring-1 ${getPriceStatusBadgeClass(order.price_status)}`}
              >
                {priceStatusLabel(order.price_status)}
              </p>
            </div>
          </div>

          <div className="grid gap-2 text-sm text-zinc-700">
            <p className="flex justify-between gap-2">
              <span>주문번호</span>
              <strong>{order.order_code}</strong>
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

          {bankInfo && order.price_status === "quoted" ? (
            <div className="rounded-lg border border-brand-border bg-brand-soft px-3 py-3 text-sm text-brand-strong">
              <p className="font-semibold">{bankInfo.name} 입금 계좌</p>
              <p className="mt-1">{bankInfo.bankName}</p>
              <p>{bankInfo.bankAccountNumber}</p>
              <p>예금주: {bankInfo.bankAccountHolder}</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}
