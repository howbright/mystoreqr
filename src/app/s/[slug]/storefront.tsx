"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import { formatKrw, formatPhone } from "@/lib/mystoreqr/format"
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

export function Storefront({ storeBundle }: StorefrontProps) {
  const { store, categories, products } = storeBundle
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

  async function handleSubmitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSubmitResult(null)

    if (selectedItems.length === 0) {
      setErrorMessage("최소 1개 이상의 상품을 선택해 주세요.")
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
      setQuantities({})
    } catch {
      setErrorMessage("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-zinc-500">MyStoreQR 주문</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">{store.name}</h1>
        {store.description ? <p className="mt-2 text-sm text-zinc-600">{store.description}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
          <span className="rounded-full bg-zinc-100 px-3 py-1">전화 {formatPhone(store.phone)}</span>
          <span className="rounded-full bg-zinc-100 px-3 py-1">
            최소주문 {formatKrw(store.min_order_amount)}
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1">기본배달비 {formatKrw(store.delivery_fee)}</span>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {categoriesWithProducts.map((category) => (
            <article key={category.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
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
                          className="h-8 w-8 rounded-full border border-zinc-300 text-sm font-bold text-zinc-700 disabled:opacity-40"
                          disabled={quantity <= 0 || product.is_sold_out}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={quantity}
                          onChange={(event) => updateQuantity(product.id, Number(event.target.value) || 0)}
                          className="h-8 w-14 rounded-md border border-zinc-300 px-2 text-center text-sm"
                          disabled={product.is_sold_out}
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(product.id, quantity + 1)}
                          className="h-8 w-8 rounded-full border border-zinc-300 text-sm font-bold text-zinc-700 disabled:opacity-40"
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
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">장바구니</h2>
            {selectedItems.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">선택된 상품이 없습니다.</p>
            ) : (
              <div className="mt-3 space-y-2 text-sm">
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
                  {hasUnknownPrice ? (
                    <p className="mt-1 text-xs text-amber-700">
                      일부 상품 가격이 미등록 상태라, 최종 금액은 사장님 확인 후 안내됩니다.
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
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
                  className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
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
                  className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
                  placeholder="01012345678"
                />
              </div>

              <fieldset className="grid gap-2">
                <legend className="text-xs font-medium text-zinc-600">수령 방식</legend>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-2 text-sm ${
                      customerForm.fulfillmentType === "delivery"
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-700"
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
                    className={`rounded-lg px-3 py-2 text-sm ${
                      customerForm.fulfillmentType === "pickup"
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-700"
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
                      className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
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
                      className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
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
                  className="min-h-20 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="예: 벨 누르지 말아주세요."
                />
              </div>

              {errorMessage ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
              ) : null}

              {submitResult ? (
                <div className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
                  <p className="font-semibold">주문이 접수되었습니다.</p>
                  <p className="mt-1">주문번호: {submitResult.orderCode}</p>
                  <Link href={submitResult.trackingPath} className="mt-2 inline-block underline">
                    주문 추적 바로가기
                  </Link>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting || selectedItems.length === 0}
                className="h-11 w-full rounded-lg bg-zinc-900 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "주문 접수 중..." : "주문 접수"}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 shadow-sm">
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
