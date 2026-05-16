"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { writeAdminActionLog } from "@/lib/mystoreqr/admin-action-logs"
import { requireAdminSessionOrRedirect } from "@/lib/mystoreqr/admin-auth"
import { ORDER_STATUS_OPTIONS, PAYMENT_STATUS_OPTIONS } from "@/lib/mystoreqr/constants"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/types/database.type"

type OrderStatus = Database["public"]["Enums"]["order_status"]
type PaymentStatus = Database["public"]["Enums"]["payment_status"]

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function toSafeString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : ""
}

function parseNonNegativeInteger(rawValue: string) {
  const value = Number(rawValue)
  if (!Number.isInteger(value) || value < 0) {
    return null
  }

  return value
}

function buildRedirectPath(storeSlug: string, type: "ok" | "error", message: string) {
  const params = new URLSearchParams()
  if (storeSlug) {
    params.set("store", storeSlug)
  }
  params.set(type, message)
  return `/admin/orders?${params.toString()}`
}

function redirectWithError(storeSlug: string, message: string): never {
  redirect(buildRedirectPath(storeSlug, "error", message))
}

function redirectWithSuccess(storeSlug: string, message: string): never {
  redirect(buildRedirectPath(storeSlug, "ok", message))
}

function getAdminClientOrRedirect(storeSlug: string) {
  try {
    return createAdminClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "관리자 서버 클라이언트 생성 실패"
    redirectWithError(storeSlug, message)
  }
}

export async function setOrderQuoteAction(formData: FormData) {
  const storeSlug = toSafeString(formData.get("storeSlug"))
  await requireAdminSessionOrRedirect(`/admin/orders?store=${encodeURIComponent(storeSlug)}`)

  const orderId = toSafeString(formData.get("orderId"))
  const subtotalAmount = parseNonNegativeInteger(toSafeString(formData.get("subtotalAmount")))
  const deliveryFee = parseNonNegativeInteger(toSafeString(formData.get("deliveryFee")))
  const priceNote = toSafeString(formData.get("priceNote"))

  if (!isUuidLike(orderId)) {
    redirectWithError(storeSlug, "주문 ID 형식이 올바르지 않습니다.")
  }

  if (subtotalAmount == null || deliveryFee == null) {
    redirectWithError(storeSlug, "금액은 0 이상의 정수로 입력해 주세요.")
  }

  const supabase = getAdminClientOrRedirect(storeSlug)
  const totalAmount = subtotalAmount + deliveryFee

  const { data: existingOrder, error: existingOrderError } = await supabase
    .from("orders")
    .select("payment_status")
    .eq("id", orderId)
    .maybeSingle()

  if (existingOrderError) {
    redirectWithError(storeSlug, `주문 조회 실패: ${existingOrderError.message}`)
  }

  const nextPaymentStatus =
    existingOrder?.payment_status === "not_ready"
      ? "waiting_transfer"
      : existingOrder?.payment_status ?? "waiting_transfer"

  const { data, error } = await supabase
    .from("orders")
    .update({
      subtotal_amount: subtotalAmount,
      delivery_fee: deliveryFee,
      total_amount: totalAmount,
      price_status: "quoted",
      price_note: priceNote || null,
      quoted_at: new Date().toISOString(),
      quoted_by: null,
      payment_status: nextPaymentStatus,
    })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id, payment_status")

  if (error) {
    redirectWithError(storeSlug, `가격 확정 실패: ${error.message}`)
  }

  if (!data || data.length === 0) {
    redirectWithError(storeSlug, "가격 확정 가능한 주문이 아닙니다. (pending 상태만 가능)")
  }

  await writeAdminActionLog({
    storeSlug,
    orderId,
    actionType: "quote_set",
    summary: `가격 확정: 상품합계 ${subtotalAmount}, 배달비 ${deliveryFee}`,
    payload: {
      subtotalAmount,
      deliveryFee,
      totalAmount,
      priceNote: priceNote || null,
    },
  })

  revalidatePath("/admin/orders")
  redirectWithSuccess(storeSlug, "가격 확정을 완료했습니다.")
}

export async function setOrderStatusAction(formData: FormData) {
  const storeSlug = toSafeString(formData.get("storeSlug"))
  await requireAdminSessionOrRedirect(`/admin/orders?store=${encodeURIComponent(storeSlug)}`)

  const orderId = toSafeString(formData.get("orderId"))
  const nextStatus = toSafeString(formData.get("status")) as OrderStatus
  const statusNote = toSafeString(formData.get("statusNote"))

  if (!isUuidLike(orderId)) {
    redirectWithError(storeSlug, "주문 ID 형식이 올바르지 않습니다.")
  }

  if (!ORDER_STATUS_OPTIONS.includes(nextStatus)) {
    redirectWithError(storeSlug, "변경할 주문 상태 값이 올바르지 않습니다.")
  }

  const supabase = getAdminClientOrRedirect(storeSlug)
  const updatePayload: Database["public"]["Tables"]["orders"]["Update"] = {
    status: nextStatus,
    cancel_reason: nextStatus === "canceled" ? statusNote || "관리자 취소" : null,
  }

  const { error } = await supabase.from("orders").update(updatePayload).eq("id", orderId)
  if (error) {
    redirectWithError(storeSlug, `주문 상태 변경 실패: ${error.message}`)
  }

  await writeAdminActionLog({
    storeSlug,
    orderId,
    actionType: "order_status_set",
    summary: `주문 상태 변경: ${nextStatus}`,
    payload: {
      status: nextStatus,
      statusNote: statusNote || null,
    },
  })

  revalidatePath("/admin/orders")
  redirectWithSuccess(storeSlug, "주문 상태를 변경했습니다.")
}

export async function setPaymentStatusAction(formData: FormData) {
  const storeSlug = toSafeString(formData.get("storeSlug"))
  await requireAdminSessionOrRedirect(`/admin/orders?store=${encodeURIComponent(storeSlug)}`)

  const orderId = toSafeString(formData.get("orderId"))
  const paymentStatus = toSafeString(formData.get("paymentStatus")) as PaymentStatus

  if (!isUuidLike(orderId)) {
    redirectWithError(storeSlug, "주문 ID 형식이 올바르지 않습니다.")
  }

  if (!PAYMENT_STATUS_OPTIONS.includes(paymentStatus)) {
    redirectWithError(storeSlug, "결제 상태 값이 올바르지 않습니다.")
  }

  const supabase = getAdminClientOrRedirect(storeSlug)
  const updatePayload: Database["public"]["Tables"]["orders"]["Update"] = {
    payment_status: paymentStatus,
  }

  if (paymentStatus === "confirmed") {
    updatePayload.confirmed_at = new Date().toISOString()
    updatePayload.confirmed_by = null
  } else {
    updatePayload.confirmed_at = null
    updatePayload.confirmed_by = null
  }

  const { data, error } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .select("id, payment_status")
  if (error) {
    redirectWithError(storeSlug, `결제 상태 변경 실패: ${error.message}`)
  }

  if (!data || data.length === 0) {
    redirectWithError(storeSlug, "결제 상태 변경 대상 주문을 찾지 못했습니다.")
  }

  const appliedPaymentStatus = data[0]?.payment_status
  if (appliedPaymentStatus !== paymentStatus) {
    redirectWithError(
      storeSlug,
      `결제 상태 저장 불일치: 요청=${paymentStatus}, 실제=${appliedPaymentStatus ?? "unknown"}`
    )
  }

  await writeAdminActionLog({
    storeSlug,
    orderId,
    actionType: "payment_status_set",
    summary: `결제 상태 변경: ${paymentStatus}`,
    payload: {
      paymentStatus,
    },
  })

  revalidatePath("/admin/orders", "page")
  revalidatePath("/track", "page")
  redirectWithSuccess(storeSlug, "결제 상태를 변경했습니다.")
}
