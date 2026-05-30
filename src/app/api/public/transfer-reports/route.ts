import { NextResponse } from "next/server"

import { normalizeCustomerOrderCode, normalizePhone } from "@/lib/mystoreqr/format"
import { createAdminClient } from "@/lib/supabase/admin"

type TransferReportBody = {
  orderCode: string
  customerPhone: string
  storeSlug?: string
  depositorName: string
  transferredAmount: number
  note?: string
}

type OrderForTransferReport = {
  id: string
  store_id: string
  customer_phone: string
  status: string
  payment_method: string
  payment_status: string
  price_status: string
  total_amount: number
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function isValidBody(body: unknown): body is TransferReportBody {
  if (typeof body !== "object" || body === null) {
    return false
  }

  const value = body as Record<string, unknown>
  return (
    typeof value.orderCode === "string" &&
    typeof value.customerPhone === "string" &&
    typeof value.depositorName === "string" &&
    typeof value.transferredAmount === "number"
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
    return errorResponse("주문번호, 연락처, 입금자명, 입금액이 필요합니다.")
  }

  const orderCode = normalizeCustomerOrderCode(payload.orderCode)
  const customerPhone = normalizePhone(payload.customerPhone)
  const depositorName = payload.depositorName.trim()
  const transferredAmount = Math.round(payload.transferredAmount)
  const storeSlug = payload.storeSlug?.trim().toLowerCase()
  const note = typeof payload.note === "string" ? payload.note.trim() : ""

  if (!orderCode || customerPhone.length < 10) {
    return errorResponse("주문번호와 연락처를 다시 확인해 주세요.")
  }

  if (!depositorName) {
    return errorResponse("입금자명을 입력해 주세요.")
  }

  if (!Number.isFinite(transferredAmount) || transferredAmount < 0) {
    return errorResponse("입금액을 다시 확인해 주세요.")
  }

  const supabase = createAdminClient()
  const isShortCode = /^\d{4}$/.test(orderCode)
  let query = supabase
    .from("orders")
    .select("id, store_id, customer_phone, status, payment_method, payment_status, price_status, total_amount, stores!inner(slug)")
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

  const order = ((orders ?? []) as OrderForTransferReport[]).find(
    (row) => normalizePhone(row.customer_phone) === customerPhone
  )

  if (!order) {
    return errorResponse("주문을 찾을 수 없습니다. 주문번호/연락처를 다시 확인해 주세요.", 404)
  }

  if (order.status === "canceled") {
    return errorResponse("취소된 주문에는 입금 신고를 할 수 없습니다.")
  }

  if (order.price_status !== "quoted") {
    return errorResponse("최종 금액이 확정된 뒤 입금 신고를 할 수 있습니다.")
  }

  if (order.payment_method !== "bank_transfer") {
    return errorResponse("이 주문은 계좌이체 주문이 아니라 입금 신고가 필요하지 않습니다.")
  }

  if (order.payment_status === "confirmed") {
    return NextResponse.json({ ok: true, message: "이미 입금 확인되었습니다. 배송 준비중입니다." })
  }

  if (order.payment_status === "transfer_submitted") {
    return NextResponse.json({ ok: true, message: "이미 입금 신고가 접수되었습니다." })
  }

  const { error: insertError } = await supabase.from("transfer_reports").insert({
    order_id: order.id,
    depositor_name: depositorName,
    depositor_phone: customerPhone,
    transferred_amount: transferredAmount,
    transferred_at: new Date().toISOString(),
    note: note || null,
  })

  if (insertError) {
    return errorResponse(`입금 신고 저장 실패: ${insertError.message}`, 500)
  }

  if (order.payment_status === "rejected") {
    await supabase
      .from("orders")
      .update({
        payment_status: "transfer_submitted",
        bank_depositor_name: depositorName,
        transferred_at: new Date().toISOString(),
      })
      .eq("id", order.id)
  }

  return NextResponse.json({ ok: true, message: "입금 신고가 접수되었습니다." })
}
