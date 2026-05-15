"use client"

import { useState } from "react"

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

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [order, setOrder] = useState<TrackingOrder | null>(initialOrder)
  const [bankInfo, setBankInfo] = useState<BankInfo | null>(initialBankInfo)

  async function fetchTracking() {
    setIsLoading(true)
    setErrorMessage(null)
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
        setOrder(null)
        setErrorMessage("error" in payload ? payload.error : "주문 조회에 실패했습니다.")
        return
      }

      if ("error" in payload) {
        setOrder(null)
        setErrorMessage(payload.error)
        return
      }

      setOrder(payload.order)
      if (payload.bankInfo) {
        setBankInfo(payload.bankInfo)
      }
    } catch {
      setOrder(null)
      setErrorMessage("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:px-6">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-zinc-500">MyStoreQR</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">주문 추적</h1>
        <p className="mt-2 text-sm text-zinc-600">
          주문 접수 후 받은 토큰과 연락처를 입력하면 현재 상태를 확인할 수 있습니다.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">주문 조회 토큰</span>
            <input
              value={lookupToken}
              onChange={(event) => setLookupToken(event.target.value)}
              className="h-10 rounded-lg border border-zinc-300 px-3"
              placeholder="예: 3f6f5f63-..."
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">연락처</span>
            <input
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              className="h-10 rounded-lg border border-zinc-300 px-3"
              placeholder="01012345678"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">매장 슬러그 (선택)</span>
            <input
              value={storeSlug}
              onChange={(event) => setStoreSlug(event.target.value)}
              className="h-10 rounded-lg border border-zinc-300 px-3"
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
          className="mt-4 h-11 w-full rounded-lg bg-zinc-900 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "조회 중..." : "주문 조회"}
        </button>
      </section>

      {order ? (
        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">주문 정보</h2>
          <div className="grid gap-2 text-sm text-zinc-700">
            <p className="flex justify-between gap-2">
              <span>주문번호</span>
              <strong>{order.order_code}</strong>
            </p>
            <p className="flex justify-between gap-2">
              <span>주문 상태</span>
              <strong>{orderStatusLabel(order.status)}</strong>
            </p>
            <p className="flex justify-between gap-2">
              <span>가격 상태</span>
              <strong>{priceStatusLabel(order.price_status)}</strong>
            </p>
            <p className="flex justify-between gap-2">
              <span>결제 상태</span>
              <strong>{paymentStatusLabel(order.payment_status)}</strong>
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
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
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
