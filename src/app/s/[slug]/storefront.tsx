"use client"

import Link from "next/link"
import { useMemo, useState, useSyncExternalStore } from "react"

import { formatCustomerOrderCode, formatKrw, formatPhone } from "@/lib/mystoreqr/format"
import type { PublicStoreBundle } from "@/lib/mystoreqr/public-queries"

type StorefrontProps = {
  storeBundle: PublicStoreBundle
}

type CustomerForm = {
  customerName: string
  customerPhone: string
  fulfillmentType: "delivery" | "pickup"
  deliveryAddress: string
  deliveryAddressDetail: string
  customerNote: string
}

type OrderSubmitResult = {
  orderCode: string
  trackingPath: string
}

type RecentOrder = OrderSubmitResult & {
  customerPhone: string
  savedAt: number
}

function getRecentOrderStorageKey(storeSlug: string) {
  return `mystoreqr:recent-order:${storeSlug}`
}

function subscribeToRecentOrderChange(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener("mystoreqr-recent-order", onStoreChange)

  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener("mystoreqr-recent-order", onStoreChange)
  }
}

function parseRecentOrder(value: string | null): RecentOrder | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Partial<RecentOrder>
    if (parsed.orderCode && parsed.trackingPath && parsed.customerPhone && parsed.savedAt) {
      return {
        orderCode: parsed.orderCode,
        trackingPath: parsed.trackingPath,
        customerPhone: parsed.customerPhone,
        savedAt: parsed.savedAt,
      }
    }
  } catch {
    return null
  }

  return null
}

export function Storefront({ storeBundle }: StorefrontProps) {
  const { store, categories, products } = storeBundle
  const storeName = store.slug === "jinro" ? "진로마트" : store.name
  const storePhone = store.slug === "jinro" ? "0507-1392-5070" : store.phone
  const storeRoadAddress =
    store.slug === "jinro" ? "경기도 성남시 중원구 둔촌대로 159 1층 진로마트 모란점" : store.address_road
  const storeJibunAddress = store.slug === "jinro" ? "성남동 3791" : store.address_detail
  const [loadedAt] = useState(() => Date.now())
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [customerForm, setCustomerForm] = useState<CustomerForm>({
    customerName: "",
    customerPhone: "",
    fulfillmentType: store.delivery_enabled ? "delivery" : "pickup",
    deliveryAddress: "",
    deliveryAddressDetail: "",
    customerNote: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<OrderSubmitResult | null>(null)
  const recentOrderStorageKey = getRecentOrderStorageKey(store.slug)
  const recentOrderSnapshot = useSyncExternalStore(
    subscribeToRecentOrderChange,
    () => window.localStorage.getItem(recentOrderStorageKey),
    () => null
  )
  const recentOrder = useMemo(() => parseRecentOrder(recentOrderSnapshot), [recentOrderSnapshot])

  const categoriesWithProducts = useMemo(() => {
    const group = categories.map((category) => ({
      id: category.id,
      name: category.name,
      products: products.filter((product) => product.category_id === category.id),
    }))

    const uncategorizedProducts = products.filter((product) => product.category_id === null)
    if (uncategorizedProducts.length > 0) {
      group.push({
        id: "uncategorized",
        name: "기타",
        products: uncategorizedProducts,
      })
    }

    return group.filter((category) => category.products.length > 0)
  }, [categories, products])

  const selectedItems = useMemo(() => {
    return products
      .map((product) => {
        const quantity = quantities[product.id] ?? 0
        return {
          product,
          quantity,
          lineTotal: product.price == null ? null : product.price * quantity,
        }
      })
      .filter((row) => row.quantity > 0)
  }, [products, quantities])

  const knownSubtotal = selectedItems.reduce((acc, row) => acc + (row.lineTotal ?? 0), 0)
  const hasUnknownPrice = selectedItems.some((row) => row.lineTotal === null)
  const isBelowMinOrderAmount = !hasUnknownPrice && knownSubtotal < store.min_order_amount
  const missingAmountToMinOrder = Math.max(store.min_order_amount - knownSubtotal, 0)
  const selectedProductCount = selectedItems.length
  const selectedQuantityTotal = selectedItems.reduce((acc, item) => acc + item.quantity, 0)

  function updateQuantity(productId: string, quantity: number) {
    setQuantities((prev) => {
      const next = { ...prev }
      if (quantity <= 0) {
        delete next[productId]
      } else {
        next[productId] = quantity
      }
      return next
    })
  }

  function clearCart() {
    setQuantities({})
  }

  async function handleSubmitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSubmitResult(null)

    if (selectedItems.length === 0) {
      setErrorMessage("최소 1개 이상의 상품을 선택해 주세요.")
      return
    }

    if (isBelowMinOrderAmount) {
      setErrorMessage(`최소 주문금액 ${formatKrw(store.min_order_amount)} 이상부터 주문할 수 있습니다.`)
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/public/stores/${encodeURIComponent(store.slug)}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName: customerForm.customerName,
          customerPhone: customerForm.customerPhone,
          fulfillmentType: customerForm.fulfillmentType,
          deliveryAddress: customerForm.deliveryAddress,
          deliveryAddressDetail: customerForm.deliveryAddressDetail,
          customerNote: customerForm.customerNote,
          submittedAt: loadedAt,
          website: "",
          items: selectedItems.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
        }),
      })

      const payload = (await response.json()) as
        | { error: string }
        | { orderCode: string; trackingPath: string }

      if (!response.ok) {
        setErrorMessage("error" in payload ? payload.error : "주문 접수에 실패했습니다.")
        return
      }

      if ("error" in payload) {
        setErrorMessage(payload.error)
        return
      }

      setSubmitResult({
        orderCode: payload.orderCode,
        trackingPath: payload.trackingPath,
      })
      const nextRecentOrder = {
        orderCode: payload.orderCode,
        trackingPath: payload.trackingPath,
        customerPhone: customerForm.customerPhone,
        savedAt: Date.now(),
      }
      try {
        window.localStorage.setItem(recentOrderStorageKey, JSON.stringify(nextRecentOrder))
        window.dispatchEvent(new Event("mystoreqr-recent-order"))
      } catch {
        // 주문은 이미 접수되었으므로 최근 주문 저장 실패는 사용자 플로우를 막지 않습니다.
      }
      setQuantities({})
    } catch {
      setErrorMessage("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
      <header className="mq-card p-5">
        <p className="text-sm font-medium text-brand-strong">MyStoreQR 주문</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">{storeName}</h1>
        {store.description ? <p className="mt-2 text-sm text-zinc-600">{store.description}</p> : null}
        {storeRoadAddress ? <p className="mt-2 text-sm text-zinc-700">{storeRoadAddress}</p> : null}
        {storeJibunAddress ? <p className="mt-1 text-xs text-zinc-500">지번: {storeJibunAddress}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
          <span className="mq-chip">전화 {formatPhone(storePhone)}</span>
          <span className="mq-chip">
            최소주문 {formatKrw(store.min_order_amount)}
          </span>
          <span className="mq-chip">기본배달비 {formatKrw(store.delivery_fee)}</span>
        </div>
        {recentOrder ? (
          <Link
            href={recentOrder.trackingPath}
            className="mt-4 inline-flex rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
          >
            최근 주문 추적하기 #{formatCustomerOrderCode(recentOrder.orderCode)}
          </Link>
        ) : null}
      </header>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {categoriesWithProducts.map((category) => (
            <article key={category.id} className="mq-card p-4">
              <h2 className="text-lg font-semibold text-zinc-900">{category.name}</h2>
              <div className="mt-3 space-y-3">
                {category.products.map((product) => {
                  const quantity = quantities[product.id] ?? 0
                  return (
                    <div
                      key={product.id}
                      className="flex items-center justify-between rounded-xl border border-zinc-100 p-3"
                    >
                      <div className="pr-2">
                        <p className="font-medium text-zinc-900">{product.name}</p>
                        <p className="text-sm text-zinc-600">
                          {formatKrw(product.price)}
                          {product.unit ? ` / ${product.unit}` : ""}
                        </p>
                        {product.description ? (
                          <p className="mt-1 text-xs text-zinc-500">{product.description}</p>
                        ) : null}
                        {product.is_sold_out ? (
                          <p className="mt-1 text-xs font-semibold text-rose-600">품절</p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQuantity(product.id, quantity - 1)}
                          className="h-8 w-8 rounded-full border border-zinc-300 text-sm font-bold text-brand-strong disabled:opacity-40"
                          disabled={quantity <= 0 || product.is_sold_out}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={quantity}
                          onChange={(event) => updateQuantity(product.id, Number(event.target.value) || 0)}
                          className="h-8 w-14 rounded-md border border-zinc-300 px-2 text-center text-sm focus:border-brand focus:outline-none"
                          disabled={product.is_sold_out}
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(product.id, quantity + 1)}
                          className="h-8 w-8 rounded-full border border-zinc-300 text-sm font-bold text-brand-strong disabled:opacity-40"
                          disabled={product.is_sold_out}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </article>
          ))}
        </div>

        <aside className="space-y-4">
          <section className="mq-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-zinc-900">장바구니</h2>
              <button
                type="button"
                onClick={clearCart}
                disabled={selectedItems.length === 0}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                전체 비우기
              </button>
            </div>
            {selectedItems.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">선택된 상품이 없습니다.</p>
            ) : (
              <div className="mt-3 space-y-2 text-sm">
                <p className="rounded-md bg-zinc-50 px-2 py-1 text-xs text-zinc-600">
                  선택 {selectedProductCount}종 / 총 {selectedQuantityTotal}개
                </p>
                {selectedItems.map((item) => (
                  <div key={item.product.id} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-zinc-800">{item.product.name}</p>
                      <p className="text-zinc-500">{item.quantity}개</p>
                    </div>
                    <p className="font-semibold text-zinc-900">{formatKrw(item.lineTotal)}</p>
                  </div>
                ))}
                <div className="border-t border-zinc-200 pt-2">
                  <p className="flex items-center justify-between text-zinc-700">
                    <span>현재 계산 가능 합계</span>
                    <strong>{formatKrw(knownSubtotal)}</strong>
                  </p>
                  {isBelowMinOrderAmount ? (
                    <p className="mt-1 text-xs text-rose-700">
                      최소 주문금액까지 {formatKrw(missingAmountToMinOrder)} 더 담아주세요.
                    </p>
                  ) : null}
                  {hasUnknownPrice ? (
                    <p className="mt-1 text-xs text-amber-700">
                      일부 상품 가격이 미등록 상태라, 최종 금액은 사장님 확인 후 안내됩니다.
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <section className="mq-card p-4">
            <h2 className="text-lg font-semibold text-zinc-900">주문자 정보</h2>
            <form className="mt-3 space-y-3" onSubmit={handleSubmitOrder}>
              <div className="grid gap-2">
                <label className="text-xs font-medium text-zinc-600">이름</label>
                <input
                  required
                  value={customerForm.customerName}
                  onChange={(event) =>
                    setCustomerForm((prev) => ({
                      ...prev,
                      customerName: event.target.value,
                    }))
                  }
                  className="mq-input"
                  placeholder="홍길동"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-medium text-zinc-600">연락처</label>
                <input
                  required
                  value={customerForm.customerPhone}
                  onChange={(event) =>
                    setCustomerForm((prev) => ({
                      ...prev,
                      customerPhone: event.target.value,
                    }))
                  }
                  className="mq-input"
                  placeholder="01012345678"
                />
              </div>

              <fieldset className="grid gap-2">
                <legend className="text-xs font-medium text-zinc-600">수령 방식</legend>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`mq-tab ${
                      customerForm.fulfillmentType === "delivery"
                        ? "mq-tab-active"
                        : "mq-tab-inactive"
                    }`}
                    onClick={() =>
                      setCustomerForm((prev) => ({
                        ...prev,
                        fulfillmentType: "delivery",
                      }))
                    }
                    disabled={!store.delivery_enabled}
                  >
                    배달
                  </button>
                  <button
                    type="button"
                    className={`mq-tab ${
                      customerForm.fulfillmentType === "pickup"
                        ? "mq-tab-active"
                        : "mq-tab-inactive"
                    }`}
                    onClick={() =>
                      setCustomerForm((prev) => ({
                        ...prev,
                        fulfillmentType: "pickup",
                      }))
                    }
                    disabled={!store.pickup_enabled}
                  >
                    픽업
                  </button>
                </div>
              </fieldset>

              {customerForm.fulfillmentType === "delivery" ? (
                <>
                  <div className="grid gap-2">
                    <label className="text-xs font-medium text-zinc-600">배달 주소</label>
                    <input
                      required
                      value={customerForm.deliveryAddress}
                      onChange={(event) =>
                        setCustomerForm((prev) => ({
                          ...prev,
                          deliveryAddress: event.target.value,
                        }))
                      }
                      className="mq-input"
                      placeholder="도로명 주소"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-xs font-medium text-zinc-600">상세 주소</label>
                    <input
                      value={customerForm.deliveryAddressDetail}
                      onChange={(event) =>
                        setCustomerForm((prev) => ({
                          ...prev,
                          deliveryAddressDetail: event.target.value,
                        }))
                      }
                      className="mq-input"
                      placeholder="동/호수"
                    />
                  </div>
                </>
              ) : null}

              <div className="grid gap-2">
                <label className="text-xs font-medium text-zinc-600">요청사항</label>
                <textarea
                  value={customerForm.customerNote}
                  onChange={(event) =>
                    setCustomerForm((prev) => ({
                      ...prev,
                      customerNote: event.target.value,
                    }))
                  }
                  className="min-h-20 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  placeholder="예: 벨 누르지 말아주세요."
                />
              </div>

              {errorMessage ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
              ) : null}

              {submitResult ? (
                <div className="rounded-lg border-2 border-dashed border-zinc-900 bg-white px-4 py-5 text-center shadow-sm">
                  <p className="text-sm font-bold text-zinc-900">주문표</p>
                  <p className="mt-2 text-xs font-semibold text-rose-700">
                    주문 상태 조회에 필요하니 주문번호를 반드시 기억해 주세요.
                  </p>
                  <p className="mt-4 text-6xl font-black tracking-normal text-zinc-950">
                    {formatCustomerOrderCode(submitResult.orderCode)}
                  </p>
                  <p className="mt-3 text-xs text-zinc-500">화면을 닫기 전에 번호를 확인해 주세요.</p>
                  <Link
                    href={submitResult.trackingPath}
                    className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong"
                  >
                    주문 상태 확인하기
                  </Link>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting || selectedItems.length === 0 || isBelowMinOrderAmount}
                className="mq-btn-primary h-11 w-full"
              >
                {isSubmitting ? "주문 접수 중..." : "주문 접수"}
              </button>
            </form>
          </section>

          <section className="mq-card bg-brand-soft p-4 text-sm text-zinc-700">
            <h2 className="font-semibold text-zinc-900">입금 계좌 (가격 확정 후)</h2>
            <p className="mt-2">{store.bank_name}</p>
            <p>{store.bank_account_number}</p>
            <p>예금주: {store.bank_account_holder}</p>
          </section>
        </aside>
      </section>
    </main>
  )
}
