import { NextResponse } from "next/server"

import { normalizeCustomerOrderCode, normalizePhone } from "@/lib/mystoreqr/format"
import { createAdminClient } from "@/lib/supabase/admin"

type ConfirmPriceBody = {
  lookupToken?: string
  orderCode?: string
  customerPhone?: string
  storeSlug?: string
}

type OrderForConfirmPrice = {
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

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isValidBody(body: unknown): body is ConfirmPriceBody {
  if (typeof body !== "object" || body === null) {
    return false
  }

  const value = body as Record<string, unknown>
  return (
    (typeof value.lookupToken === "string" || typeof value.orderCode === "string") &&
    (typeof value.customerPhone === "string" || value.customerPhone === undefined) &&
    (typeof value.storeSlug === "string" || value.storeSlug === undefined)
  )
}

export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errorResponse("요청 본문(JSON) 형식이 올바르지 않습니다.")
  }

  if (!isValidBody(payload)) {
    return errorResponse("주문 조회 값이 필요합니다.")
  }

  const lookupToken = payload.lookupToken?.trim() ?? ""
  const orderCode = normalizeCustomerOrderCode(payload.orderCode ?? "")
  const customerPhone = normalizePhone(payload.customerPhone ?? "")
  const storeSlug = payload.storeSlug?.trim().toLowerCase()

  if (!lookupToken && (!orderCode || customerPhone.length < 10)) {
    return errorResponse("주문번호와 연락처를 다시 확인해 주세요.")
  }

  if (lookupToken && !isUuidLike(lookupToken)) {
    return errorResponse("주문 조회 토큰이 올바르지 않습니다.")
  }

  const supabase = createAdminClient()
  let query = supabase
    .from("orders")
    .select(
      "id, customer_phone, status, payment_method, payment_status, price_status, customer_price_confirmed_at, stores!inner(slug)"
    )
    .limit(lookupToken ? 1 : /^\d{4}$/.test(orderCode) ? 50 : 1)

  if (lookupToken) {
    query = query.eq("lookup_token", lookupToken)
  } else if (/^\d{4}$/.test(orderCode)) {
    query = query.like("order_code", `%-${orderCode}`)
  } else {
    query = query.eq("order_code", orderCode)
  }

  if (storeSlug) {
    query = query.eq("stores.slug", storeSlug)
  }

  const { data: orders, error: orderError } = await query

  if (orderError) {
    return errorResponse(`주문 조회 실패: ${orderError.message}`, 500)
  }

  const order = ((orders ?? []) as OrderForConfirmPrice[]).find((row) => {
    if (lookupToken && customerPhone.length < 10) {
      return true
    }

    return normalizePhone(row.customer_phone) === customerPhone
  })

  if (!order) {
    return errorResponse("주문을 찾을 수 없습니다. 주문번호/연락처를 다시 확인해 주세요.", 404)
  }

  if (order.status === "canceled") {
    return errorResponse("취소된 주문은 진행할 수 없습니다.")
  }

  if (order.payment_method !== "card_on_delivery") {
    return errorResponse("배달 시 카드결제 주문만 금액 동의가 필요합니다.")
  }

  if (order.customer_price_confirmed_at) {
    return NextResponse.json({ ok: true, message: "이미 확정 금액에 동의되었습니다. 상품을 준비하겠습니다." })
  }

  if (order.price_status !== "quoted" || order.payment_status !== "waiting_card_payment") {
    return errorResponse("아직 고객 동의가 가능한 상태가 아닙니다.")
  }

  const { data, error: updateError } = await supabase
    .from("orders")
    .update({
      customer_price_confirmed_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", "pending")
    .eq("price_status", "quoted")
    .eq("payment_status", "waiting_card_payment")
    .is("customer_price_confirmed_at", null)
    .select("id")

  if (updateError) {
    return errorResponse(`금액 동의 저장 실패: ${updateError.message}`, 500)
  }

  if (!data || data.length === 0) {
    return errorResponse("이미 처리 중인 주문입니다. 새로고침 후 확인해 주세요.")
  }

  return NextResponse.json({ ok: true, message: "확정 금액에 동의되었습니다. 상품을 준비하겠습니다." })
}
