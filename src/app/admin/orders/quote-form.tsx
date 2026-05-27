"use client"

import { useMemo, useState } from "react"

import { formatKrw } from "@/lib/mystoreqr/format"
import type { OrderWorkView } from "@/lib/mystoreqr/order-work-view"

import { setOrderQuoteAction } from "./actions"

type QuoteItem = {
  id: string
  product_name: string
  quantity: number
  unit_price: number | null
}

type QuoteFormProps = {
  orderId: string
  storeSlug: string
  returnTo: string
  actorView: OrderWorkView
  items: QuoteItem[]
  defaultDeliveryFee: number
  priceNote: string | null
  isPaymentConfirmed: boolean
}

function numberInputValue(value: number | null | undefined) {
  return value == null ? "" : String(value)
}

function parseNonNegativeNumber(value: string) {
  if (!value.trim()) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

export function QuoteForm({
  orderId,
  storeSlug,
  returnTo,
  actorView,
  items,
  defaultDeliveryFee,
  priceNote,
  isPaymentConfirmed,
}: QuoteFormProps) {
  const [itemPriceValues, setItemPriceValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, numberInputValue(item.unit_price)]))
  )
  const [deliveryFeeValue, setDeliveryFeeValue] = useState(numberInputValue(defaultDeliveryFee))

  const calculated = useMemo(() => {
    let subtotal = 0
    let missingItemCount = 0

    for (const item of items) {
      const unitPrice = parseNonNegativeNumber(itemPriceValues[item.id] ?? "")
      if (unitPrice == null) {
        missingItemCount += 1
        continue
      }
      subtotal += unitPrice * item.quantity
    }

    const deliveryFee = parseNonNegativeNumber(deliveryFeeValue) ?? 0

    return {
      deliveryFee,
      missingItemCount,
      subtotal,
      total: subtotal + deliveryFee,
    }
  }, [deliveryFeeValue, itemPriceValues, items])

  return (
    <form action={setOrderQuoteAction} className="rounded-xl border border-brand-border p-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="storeSlug" value={storeSlug} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="actorView" value={actorView} />
      <p className="text-sm font-semibold text-zinc-900">가격 확정</p>
      {isPaymentConfirmed ? (
        <p className="mt-2 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
          입금확인 완료 주문은 가격을 수정할 수 없습니다.
        </p>
      ) : null}
      <div className="mt-2 rounded-lg border border-zinc-200 p-2">
        <p className="text-xs font-medium text-zinc-700">상품별 단가 입력</p>
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <label
              key={item.id}
              className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs text-zinc-600"
            >
              <span>
                {item.product_name} ({item.quantity}개)
              </span>
              <input
                name={`itemPrice__${item.id}`}
                type="number"
                min={0}
                value={itemPriceValues[item.id] ?? ""}
                onChange={(event) =>
                  setItemPriceValues((prev) => ({
                    ...prev,
                    [item.id]: event.target.value,
                  }))
                }
                disabled={isPaymentConfirmed}
                className="h-8 w-24 rounded-md border border-zinc-300 px-2 text-right text-sm disabled:cursor-not-allowed disabled:bg-zinc-100 focus:border-brand focus:outline-none"
                placeholder="단가"
              />
            </label>
          ))}
        </div>
      </div>
      <div className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
        <p>
          입력 기준 상품 합계: <strong>{formatKrw(calculated.subtotal)}</strong>
        </p>
        <p>
          배달비 포함 총액: <strong className="text-zinc-950">{formatKrw(calculated.total)}</strong>
        </p>
        {calculated.missingItemCount > 0 ? (
          <p className="mt-1 text-amber-700">단가를 입력하지 않은 상품 {calculated.missingItemCount}개가 있습니다.</p>
        ) : null}
      </div>
      <label className="mt-2 grid gap-1 text-xs text-zinc-600">
        배달비
        <input
          name="deliveryFee"
          type="number"
          min={0}
          value={deliveryFeeValue}
          onChange={(event) => setDeliveryFeeValue(event.target.value)}
          disabled={isPaymentConfirmed}
          className="h-9 rounded-md border border-zinc-300 px-2 text-sm disabled:cursor-not-allowed disabled:bg-zinc-100 focus:border-brand focus:outline-none"
        />
      </label>
      <label className="mt-2 grid gap-1 text-xs text-zinc-600">
        메모
        <textarea
          name="priceNote"
          defaultValue={priceNote ?? ""}
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
  )
}
