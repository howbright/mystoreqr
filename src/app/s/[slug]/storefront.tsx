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
  orderId: string
  orderCode: string
  trackingPath: string
}

type RecentOrder = Omit<OrderSubmitResult, "orderId"> & {
  orderId?: string
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

function isRecentOrder(value: Partial<RecentOrder>): value is RecentOrder {
  return Boolean(value.orderCode && value.trackingPath && value.customerPhone && value.savedAt)
}

function parseRecentOrders(value: string | null): RecentOrder[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as Partial<RecentOrder> | Partial<RecentOrder>[]
    if (Array.isArray(parsed)) {
      return parsed.filter(isRecentOrder).slice(0, 3)
    }

    return isRecentOrder(parsed) ? [parsed] : []
  } catch {
    return []
  }
}

function formatRecentOrderDate(orderCode: string) {
  const match = orderCode.match(/^(\d{4})(\d{2})(\d{2})-/)
  if (!match) {
    return ""
  }

  return `${Number(match[2])}/${Number(match[3])}`
}

function getDiscountRate(originalPrice: number | null, price: number | null) {
  if (originalPrice == null || price == null || originalPrice <= price || originalPrice <= 0) {
    return null
  }

  return Math.round(((originalPrice - price) / originalPrice) * 100)
}

export function Storefront({ storeBundle }: StorefrontProps) {
  const { store, categories, products } = storeBundle
  const storeName = store.name
  const storePhone = store.phone
  const storeRoadAddress = store.address_road
  const storeJibunAddress = store.address_detail
  const orderPolicy = store.order_policy?.trim() || null
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
  const [selectedProductTab, setSelectedProductTab] = useState("best")
  const [productSearch, setProductSearch] = useState("")
  const recentOrderStorageKey = getRecentOrderStorageKey(store.slug)
  const recentOrderSnapshot = useSyncExternalStore(
    subscribeToRecentOrderChange,
    () => window.localStorage.getItem(recentOrderStorageKey),
    () => null
  )
  const recentOrders = useMemo(() => parseRecentOrders(recentOrderSnapshot), [recentOrderSnapshot])

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

  const productTabs = useMemo(
    () => [
      { key: "best", label: "오늘의 베스트" },
      { key: "discount", label: "오늘의 할인상품" },
      ...categoriesWithProducts.map((category) => ({
        key: `category:${category.id}`,
        label: category.name,
      })),
    ],
    [categoriesWithProducts]
  )

  const visibleProductSections = useMemo(() => {
    const normalizedSearch = productSearch.trim().toLowerCase()
    if (normalizedSearch) {
      const matchedProducts = products.filter((product) => {
        const searchable = `${product.name} ${product.description ?? ""}`.toLowerCase()
        return searchable.includes(normalizedSearch)
      })

      return [
        {
          id: "search",
          name: "검색 결과",
          products: matchedProducts,
          emptyMessage: "검색된 상품이 없습니다.",
        },
      ]
    }

    if (selectedProductTab === "best") {
      return [
        {
          id: "best",
          name: "오늘의 베스트",
          products: products.slice(0, 4),
          emptyMessage: "오늘의 베스트 상품이 아직 없습니다.",
        },
      ]
    }

    if (selectedProductTab === "discount") {
      const discountProducts = products.filter(
        (product) => product.is_discounted && getDiscountRate(product.original_price, product.price)
      )

      return [
        {
          id: "discount",
          name: "오늘의 할인상품",
          products: discountProducts,
          emptyMessage: "오늘 등록된 할인상품이 없습니다.",
        },
      ]
    }

    const categoryId = selectedProductTab.replace(/^category:/, "")
    const category = categoriesWithProducts.find((row) => row.id === categoryId)
    return category
      ? [
          {
            ...category,
            emptyMessage: "등록된 상품이 없습니다.",
          },
        ]
      : []
  }, [categoriesWithProducts, productSearch, products, selectedProductTab])

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
        | { orderId: string; orderCode: string; trackingPath: string }

      if (!response.ok) {
        setErrorMessage("error" in payload ? payload.error : "주문 접수에 실패했습니다.")
        return
      }

      if ("error" in payload) {
        setErrorMessage(payload.error)
        return
      }

      setSubmitResult({
        orderId: payload.orderId,
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
        const nextRecentOrders = [
          nextRecentOrder,
          ...parseRecentOrders(window.localStorage.getItem(recentOrderStorageKey)).filter(
            (order) => order.orderCode !== nextRecentOrder.orderCode
          ),
        ].slice(0, 3)
        window.localStorage.setItem(recentOrderStorageKey, JSON.stringify(nextRecentOrders))
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
        </div>
        <Link
          href={`/track?store=${encodeURIComponent(store.slug)}`}
          className="mt-4 inline-flex rounded-lg border border-brand px-3 py-2 text-sm font-semibold text-brand-strong hover:bg-brand-soft"
        >
          주문번호로 조회하기
        </Link>
        {recentOrders.length > 0 ? (
          <div className="mt-4 grid gap-2">
            <p className="text-xs font-semibold text-zinc-600">최근 주문 추적</p>
            <div className="flex flex-wrap gap-2">
              {recentOrders.map((order) => (
                <Link
                  key={`${order.orderCode}-${order.savedAt}`}
                  href={order.trackingPath}
                  className="inline-flex flex-col rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
                >
                  <span>#{formatCustomerOrderCode(order.orderCode)}</span>
                  {formatRecentOrderDate(order.orderCode) ? (
                    <span className="text-[11px] font-medium text-white/80">{formatRecentOrderDate(order.orderCode)}</span>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <section>
        <h2 className="text-xl font-bold text-zinc-900">필요한 상품을 담아주세요</h2>
        <p className="mt-1 text-sm text-zinc-600">
          가격이 비어있는 상품은 주문 후 매장에서 최종 금액을 확인해 안내합니다.
        </p>
        <div className="mt-3">
          <label className="sr-only" htmlFor="product-search">
            상품 검색
          </label>
          <div className="relative">
            <input
              id="product-search"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              className="h-11 w-full rounded-lg border border-zinc-300 px-3 pr-10 text-sm focus:border-brand focus:outline-none"
              placeholder="상품 검색"
            />
            {productSearch ? (
              <button
                type="button"
                onClick={() => setProductSearch("")}
                aria-label="상품 검색어 지우기"
                className="absolute top-1/2 right-2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-base font-bold text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {productTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSelectedProductTab(tab.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap sm:px-4 sm:py-2 sm:text-sm ${
                selectedProductTab === tab.key
                  ? "bg-brand text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-brand-soft"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {visibleProductSections.map((category) => (
            <article key={category.id} className="mq-card p-4">
              <h2 className="text-lg font-semibold text-zinc-900">{category.name}</h2>
              {category.products.length === 0 ? (
                <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
                  {category.emptyMessage}
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {category.products.map((product) => {
                    const quantity = quantities[product.id] ?? 0
                    const discountRate = product.is_discounted
                      ? getDiscountRate(product.original_price, product.price)
                      : null
                    return (
                      <div
                        key={product.id}
                        className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 rounded-xl border border-zinc-100 bg-white p-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center"
                      >
                        <div className="aspect-square w-full overflow-hidden rounded-xl bg-zinc-100">
                          {product.image_url ? (
                            <div
                              className="h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${product.image_url})` }}
                              role="img"
                              aria-label={`${product.name} 상품 사진`}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-zinc-400">
                              사진
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 self-center">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <p className="min-w-0 break-words text-[15px] font-bold leading-snug text-zinc-900">
                              {product.name}
                            </p>
                            {discountRate ? (
                              <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                                {discountRate}% 할인
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                            {discountRate ? (
                              <span className="text-xs text-zinc-400 line-through">
                                {formatKrw(product.original_price)}
                              </span>
                            ) : null}
                            <span className={discountRate ? "font-black text-rose-700" : "font-bold text-zinc-800"}>
                              {formatKrw(product.price)}
                            </span>
                            {product.unit ? <span className="text-xs font-medium text-zinc-500">/ {product.unit}</span> : null}
                          </div>
                          {product.description ? (
                            <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-zinc-500">
                              {product.description}
                            </p>
                          ) : null}
                          {product.is_sold_out ? (
                            <p className="mt-1 text-xs font-semibold text-rose-600">품절</p>
                          ) : null}
                        </div>

                        <div className="col-span-2 flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2 sm:col-span-1 sm:bg-transparent sm:px-0 sm:py-0">
                          <p className={`text-xs font-bold ${quantity > 0 ? "text-brand-strong" : "text-zinc-500"}`}>
                            {quantity > 0 ? `${quantity}개 담김` : "수량 선택"}
                          </p>
                          <div className="grid grid-cols-[2.25rem_3.25rem_2.25rem] items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateQuantity(product.id, quantity - 1)}
                            className="h-9 w-9 rounded-full border border-zinc-300 bg-white text-sm font-black text-brand-strong disabled:opacity-40"
                            disabled={quantity <= 0 || product.is_sold_out}
                            aria-label={`${product.name} 수량 줄이기`}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={quantity}
                            onChange={(event) => updateQuantity(product.id, Number(event.target.value) || 0)}
                            className="h-9 w-full rounded-md border border-zinc-300 bg-white px-1 text-center text-sm font-bold focus:border-brand focus:outline-none"
                            disabled={product.is_sold_out}
                            aria-label={`${product.name} 수량`}
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(product.id, quantity + 1)}
                            className="h-9 w-9 rounded-full border border-zinc-300 bg-white text-sm font-black text-brand-strong disabled:opacity-40"
                            disabled={product.is_sold_out}
                            aria-label={`${product.name} 수량 늘리기`}
                          >
                            +
                          </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
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
                  <div key={item.product.id} className="grid gap-2 rounded-lg border border-zinc-100 p-2">
                    <div>
                      <p className="font-medium text-zinc-800">{item.product.name}</p>
                      <p className="text-zinc-500">
                        {formatKrw(item.product.price)}
                        {item.product.unit ? ` / ${item.product.unit}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="h-8 w-8 rounded-full border border-zinc-300 text-sm font-bold text-brand-strong"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={item.quantity}
                          onChange={(event) => updateQuantity(item.product.id, Number(event.target.value) || 0)}
                          className="h-8 w-14 rounded-md border border-zinc-300 px-2 text-center text-sm focus:border-brand focus:outline-none"
                          aria-label={`${item.product.name} 수량`}
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="h-8 w-8 rounded-full border border-zinc-300 text-sm font-bold text-brand-strong"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, 0)}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        삭제
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-2">
                      <span className="text-xs text-zinc-500">상품 합계</span>
                      <p className={`font-semibold ${item.lineTotal == null ? "text-amber-700" : "text-zinc-900"}`}>
                        {formatKrw(item.lineTotal)}
                      </p>
                    </div>
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
                    className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong"
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

              {orderPolicy ? (
                <section className="rounded-xl border-2 border-brand bg-brand-soft p-4 shadow-sm">
                  <h3 className="text-base font-extrabold text-brand-strong">{storeName}의 주문정책</h3>
                  <p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-6 text-zinc-800">{orderPolicy}</p>
                </section>
              ) : null}
            </form>
          </section>

        </aside>
      </section>
    </main>
  )
}
