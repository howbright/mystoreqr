import { NextResponse } from "next/server"

import { formatKrw, formatPhone, normalizePhone } from "@/lib/mystoreqr/format"
import { checkRateLimit, getRequestIp } from "@/lib/mystoreqr/rate-limit"
import { sendTelegramMessage } from "@/lib/mystoreqr/telegram"
import { parsePositiveQuantity, validatePublicOrderInput } from "@/lib/mystoreqr/validation"
import { createClient } from "@/lib/supabase/server"
import type { TablesInsert } from "@/types/database.type"

type OrderItemPayload = {
  productId: string
  quantity: number
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function parseOrderItems(input: unknown): OrderItemPayload[] {
  if (!Array.isArray(input)) {
    throw new Error("주문 상품 목록이 필요합니다.")
  }

  if (input.length === 0) {
    throw new Error("최소 1개 이상의 상품을 선택해 주세요.")
  }

  const mergedQuantityByProduct = new Map<string, number>()

  for (const row of input) {
    if (typeof row !== "object" || row === null) {
      throw new Error("주문 상품 형식이 올바르지 않습니다.")
    }

    const item = row as Record<string, unknown>
    const productId = String(item.productId ?? "").trim()
    const quantity = parsePositiveQuantity(item.quantity)

    if (!productId || !isUuidLike(productId)) {
      throw new Error("상품 ID 형식이 올바르지 않습니다.")
    }

    mergedQuantityByProduct.set(productId, (mergedQuantityByProduct.get(productId) ?? 0) + quantity)
  }

  return [...mergedQuantityByProduct.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }))
}

function parseClientSubmittedAt(value: unknown) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp)) {
    return null
  }

  return timestamp
}

function getAppBaseUrl(request: Request) {
  const envBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (envBaseUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(envBaseUrl)) {
    return envBaseUrl.replace(/\/$/, "")
  }

  const requestUrl = new URL(request.url)
  return requestUrl.origin
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const normalizedSlug = slug.trim().toLowerCase()

  if (!normalizedSlug) {
    return errorResponse("매장 정보가 올바르지 않습니다.", 404)
  }

  const requestIp = getRequestIp(request.headers)
  const rateLimit = checkRateLimit(`order:${requestIp}`, {
    max: 6,
    windowMs: 60_000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `요청이 너무 많습니다. ${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.` },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    )
  }

  let payload: Record<string, unknown>
  try {
    payload = (await request.json()) as Record<string, unknown>
  } catch {
    return errorResponse("요청 본문(JSON) 형식이 올바르지 않습니다.")
  }

  const honeypot = String(payload.website ?? "").trim()
  if (honeypot) {
    return errorResponse("비정상 요청이 감지되었습니다.", 400)
  }

  const submittedAt = parseClientSubmittedAt(payload.submittedAt)
  if (!submittedAt || Date.now() - submittedAt < 1200) {
    return errorResponse("요청이 너무 빠릅니다. 다시 시도해 주세요.", 400)
  }

  const fulfillmentType = payload.fulfillmentType
  if (fulfillmentType !== "delivery" && fulfillmentType !== "pickup") {
    return errorResponse("수령 방식은 delivery 또는 pickup 이어야 합니다.")
  }

  const orderItems = (() => {
    try {
      return parseOrderItems(payload.items)
    } catch (error) {
      return error instanceof Error ? error.message : "주문 상품 검증 중 오류가 발생했습니다."
    }
  })()

  if (typeof orderItems === "string") {
    return errorResponse(orderItems)
  }

  if (orderItems.length > 50) {
    return errorResponse("한 번에 50개 이상 상품은 주문할 수 없습니다.")
  }

  const totalQuantity = orderItems.reduce((acc, item) => acc + item.quantity, 0)
  if (totalQuantity > 100) {
    return errorResponse("한 번에 100개 초과 수량은 주문할 수 없습니다.")
  }

  const validatedOrderInput = (() => {
    try {
      return validatePublicOrderInput({
        customerName: String(payload.customerName ?? ""),
        customerPhone: normalizePhone(String(payload.customerPhone ?? "")),
        fulfillmentType,
        deliveryAddress: String(payload.deliveryAddress ?? ""),
        deliveryAddressDetail: String(payload.deliveryAddressDetail ?? ""),
        customerNote: String(payload.customerNote ?? ""),
      })
    } catch (error) {
      return error instanceof Error ? error.message : "주문자 정보 검증에 실패했습니다."
    }
  })()

  if (typeof validatedOrderInput === "string") {
    return errorResponse(validatedOrderInput)
  }

  if (validatedOrderInput.customerName.length > 30) {
    return errorResponse("이름은 30자 이하로 입력해 주세요.")
  }

  if ((validatedOrderInput.deliveryAddress ?? "").length > 160) {
    return errorResponse("배달 주소는 160자 이하로 입력해 주세요.")
  }

  if ((validatedOrderInput.customerNote ?? "").length > 500) {
    return errorResponse("요청사항은 500자 이하로 입력해 주세요.")
  }

  const supabase = await createClient()
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, slug, name, delivery_enabled, pickup_enabled, is_active, min_order_amount")
    .eq("slug", normalizedSlug)
    .eq("is_active", true)
    .maybeSingle()

  if (storeError) {
    return errorResponse(`매장 조회 실패: ${storeError.message}`, 500)
  }

  if (!store) {
    return errorResponse("존재하지 않거나 비활성화된 매장입니다.", 404)
  }

  if (validatedOrderInput.fulfillmentType === "delivery" && !store.delivery_enabled) {
    return errorResponse("현재 배달 주문을 받고 있지 않습니다.")
  }

  if (validatedOrderInput.fulfillmentType === "pickup" && !store.pickup_enabled) {
    return errorResponse("현재 픽업 주문을 받고 있지 않습니다.")
  }

  const requestedProductIds = orderItems.map((item) => item.productId)
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, store_id, name, price, is_active, is_sold_out")
    .eq("store_id", store.id)
    .eq("is_active", true)
    .in("id", requestedProductIds)

  if (productsError) {
    return errorResponse(`상품 조회 실패: ${productsError.message}`, 500)
  }

  if (!products || products.length !== requestedProductIds.length) {
    return errorResponse("주문 상품 중 일부를 찾을 수 없습니다. 화면을 새로고침 후 다시 시도해 주세요.")
  }

  const productMap = new Map(products.map((product) => [product.id, product]))
  for (const item of orderItems) {
    const matched = productMap.get(item.productId)
    if (!matched) {
      return errorResponse("주문 상품 검증에 실패했습니다.")
    }

    if (matched.is_sold_out) {
      return errorResponse(`품절 상품이 포함되어 있습니다: ${matched.name}`)
    }
  }

  const allPricesKnown = orderItems.every((item) => productMap.get(item.productId)?.price != null)
  if (allPricesKnown) {
    const subtotal = orderItems.reduce((acc, item) => {
      const productPrice = productMap.get(item.productId)?.price ?? 0
      return acc + productPrice * item.quantity
    }, 0)

    if (subtotal < store.min_order_amount) {
      return errorResponse(`최소 주문금액은 ${store.min_order_amount.toLocaleString("ko-KR")}원입니다.`)
    }
  }

  const orderInsert: TablesInsert<"orders"> = {
    store_id: store.id,
    customer_name: validatedOrderInput.customerName,
    customer_phone: validatedOrderInput.customerPhone,
    fulfillment_type: validatedOrderInput.fulfillmentType,
    delivery_address:
      validatedOrderInput.fulfillmentType === "delivery"
        ? validatedOrderInput.deliveryAddress
        : null,
    delivery_address_detail:
      validatedOrderInput.fulfillmentType === "delivery"
        ? validatedOrderInput.deliveryAddressDetail
        : null,
    customer_note: validatedOrderInput.customerNote,
    payment_method: "bank_transfer",
  }

  const { data: insertedOrder, error: orderInsertError } = await supabase
    .from("orders")
    .insert(orderInsert)
    .select("id, order_code, lookup_token")
    .single()

  if (orderInsertError || !insertedOrder) {
    return errorResponse(
      `주문 생성에 실패했습니다: ${orderInsertError?.message ?? "unknown error"}`,
      500
    )
  }

  const orderItemsInsert: TablesInsert<"order_items">[] = orderItems.map((item) => {
    const product = productMap.get(item.productId)
    if (!product) {
      throw new Error("상품 매핑에 실패했습니다.")
    }

    return {
      order_id: insertedOrder.id,
      product_id: product.id,
      product_name: product.name,
      quantity: item.quantity,
      unit_price: product.price,
    }
  })

  const { error: orderItemsInsertError } = await supabase.from("order_items").insert(orderItemsInsert)
  if (orderItemsInsertError) {
    return errorResponse(
      `주문 상품 저장에 실패했습니다: ${orderItemsInsertError.message}. 관리자에게 문의해 주세요.`,
      500
    )
  }

  const trackingPath = `/track?token=${encodeURIComponent(insertedOrder.lookup_token)}&phone=${encodeURIComponent(validatedOrderInput.customerPhone)}&store=${encodeURIComponent(store.slug)}`
  const appBaseUrl = getAppBaseUrl(request)
  const adminOrdersUrl = `${appBaseUrl}/admin/orders?store=${encodeURIComponent(store.slug)}&view=quote&summary=pending`
  const trackingUrl = `${appBaseUrl}${trackingPath}`
  const itemLines = orderItemsInsert.map((item) => {
    const lineTotal = item.unit_price == null ? null : item.unit_price * item.quantity
    return `- ${item.product_name} ${item.quantity}개 / ${formatKrw(lineTotal)}`
  })
  const telegramResult = await sendTelegramMessage(
    [
      "새 주문이 접수되었습니다.",
      "",
      `${store.name} / 주문번호 ${insertedOrder.order_code}`,
      `고객: ${validatedOrderInput.customerName} / ${formatPhone(validatedOrderInput.customerPhone)}`,
      `수령: ${validatedOrderInput.fulfillmentType === "delivery" ? "배달" : "픽업"}`,
      validatedOrderInput.deliveryAddress ? `주소: ${validatedOrderInput.deliveryAddress}${validatedOrderInput.deliveryAddressDetail ? ` ${validatedOrderInput.deliveryAddressDetail}` : ""}` : null,
      validatedOrderInput.customerNote ? `요청사항: ${validatedOrderInput.customerNote}` : null,
      "",
      "상품:",
      ...itemLines,
      "",
      `가격확정 바로가기: ${adminOrdersUrl}`,
      `고객 추적 페이지: ${trackingUrl}`,
    ]
      .filter(Boolean)
      .join("\n")
  )

  if (!telegramResult.ok) {
    console.error(`Telegram new order notification failed: ${telegramResult.reason}`)
  }

  return NextResponse.json(
    {
      orderId: insertedOrder.id,
      orderCode: insertedOrder.order_code,
      lookupToken: insertedOrder.lookup_token,
      customerPhone: validatedOrderInput.customerPhone,
      trackingPath,
    },
    { status: 201 }
  )
}
