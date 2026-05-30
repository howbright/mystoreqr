import { NextResponse } from "next/server"

import { normalizeCustomerOrderCode, normalizePhone } from "@/lib/mystoreqr/format"
import { createAdminClient } from "@/lib/supabase/admin"

type CancelOrderBody = {
  orderCode: string
  customerPhone: string
  storeSlug?: string
  cancelReason?: string
}

type OrderForCancel = {
  id: string
  customer_phone: string
  status: string
  payment_method: string
  payment_status: string
  price_status: string
  customer_price_confirmed_at: string | null
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function isValidBody(body: unknown): body is CancelOrderBody {
  if (typeof body !== "object" || body === null) {
    return false
  }

  const value = body as Record<string, unknown>
  return typeof value.orderCode === "string" && typeof value.customerPhone === "string"
}

export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errorResponse("요청 본문(JSON) 형식이 올바르지 않습니다.")
  }

  if (!isValidBody(payload)) {
    return errorResponse("주문번호와 연락처 값이 필요합니다.")
  }

  const orderCode = normalizeCustomerOrderCode(payload.orderCode)
  const customerPhone = normalizePhone(payload.customerPhone)
  const storeSlug = payload.storeSlug?.trim().toLowerCase()
  const cancelReason = payload.cancelReason?.trim()

  if (!orderCode || customerPhone.length < 10) {
    return errorResponse("주문번호와 연락처를 다시 확인해 주세요.")
  }

  const supabase = createAdminClient()
  const isShortCode = /^\d{4}$/.test(orderCode)
  let query = supabase
    .from("orders")
    .select("id, customer_phone, status, payment_method, payment_status, price_status, customer_price_confirmed_at, stores!inner(slug)")
    .order("created_at", { ascending: false })
    .limit(isShortCode ? 50 : 1)

  if (storeSlug) {
    query = query.eq("stores.slug", storeSlug)
  }

  if (isShortCode) {
    query = query.like("order_code", `%-${orderCode}`)
  } else {
    query = query.eq("order_code", orderCode)
  }

  const { data: orders, error: orderError } = await query

  if (orderError) {
    return errorResponse(`주문 조회 실패: ${orderError.message}`, 500)
  }

  const order = ((orders ?? []) as OrderForCancel[]).find(
    (row) => normalizePhone(row.customer_phone) === customerPhone
  )

  if (!order) {
    return errorResponse("주문을 찾을 수 없습니다. 주문번호/연락처를 다시 확인해 주세요.", 404)
  }

  if (order.status === "canceled") {
    return NextResponse.json({ ok: true, message: "이미 취소된 주문입니다." })
  }

  const canCancelBeforePriceQuote =
    order.status !== "pending" ||
    order.price_status !== "needs_review" ||
    order.payment_status !== "not_ready"
      ? false
      : true
  const canCancelCardBeforeCustomerConfirm =
    order.status === "pending" &&
    order.payment_method === "card_on_delivery" &&
    order.price_status === "quoted" &&
    order.payment_status === "waiting_card_payment" &&
    order.customer_price_confirmed_at === null

  if (!canCancelBeforePriceQuote && !canCancelCardBeforeCustomerConfirm) {
    return errorResponse("이미 상품 준비가 시작되어 직접 취소할 수 없습니다. 매장에 문의해 주세요.")
  }

  let updateQuery = supabase
    .from("orders")
    .update({
      status: "canceled",
      cancel_reason: cancelReason || "고객 직접 취소",
    })
    .eq("id", order.id)
    .eq("status", "pending")

  if (canCancelBeforePriceQuote) {
    updateQuery = updateQuery.eq("price_status", "needs_review").eq("payment_status", "not_ready")
  } else {
    updateQuery = updateQuery
      .eq("price_status", "quoted")
      .eq("payment_status", "waiting_card_payment")
      .is("customer_price_confirmed_at", null)
  }

  const { data, error: updateError } = await updateQuery.select("id")

  if (updateError) {
    return errorResponse(`주문 취소 실패: ${updateError.message}`, 500)
  }

  if (!data || data.length === 0) {
    return errorResponse("이미 처리 중인 주문이라 직접 취소할 수 없습니다.")
  }

  return NextResponse.json({ ok: true, message: "주문이 취소되었습니다." })
}
