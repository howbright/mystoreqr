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

function sanitizeReturnToPath(rawReturnTo: string, fallbackStoreSlug: string) {
  const fallbackParams = new URLSearchParams()
  if (fallbackStoreSlug) {
    fallbackParams.set("store", fallbackStoreSlug)
  }
  const fallbackPath = `/admin/orders${fallbackParams.toString() ? `?${fallbackParams.toString()}` : ""}`

  if (!rawReturnTo) {
    return fallbackPath
  }

  let parsed: URL
  try {
    parsed = new URL(rawReturnTo, "http://localhost")
  } catch {
    return fallbackPath
  }

  if (parsed.pathname !== "/admin/orders") {
    return fallbackPath
  }

  const params = new URLSearchParams(parsed.search)
  params.delete("ok")
  params.delete("error")
  if (fallbackStoreSlug && !params.get("store")) {
    params.set("store", fallbackStoreSlug)
  }

  return `/admin/orders${params.toString() ? `?${params.toString()}` : ""}`
}

function buildRedirectPathWithReturn(
  storeSlug: string,
  type: "ok" | "error",
  message: string,
  returnTo: string
) {
  const basePath = sanitizeReturnToPath(returnTo, storeSlug)
  const parsed = new URL(basePath, "http://localhost")
  const params = parsed.searchParams
  params.delete("ok")
  params.delete("error")
  if (storeSlug && !params.get("store")) {
    params.set("store", storeSlug)
  }
  params.set(type, message)
  return `${parsed.pathname}?${params.toString()}`
}

function redirectWithError(storeSlug: string, message: string, returnTo = ""): never {
  redirect(buildRedirectPathWithReturn(storeSlug, "error", message, returnTo))
}

function redirectWithSuccess(storeSlug: string, message: string, returnTo = ""): never {
  redirect(buildRedirectPathWithReturn(storeSlug, "ok", message, returnTo))
}

function getAdminClientOrRedirect(storeSlug: string, returnTo = "") {
  try {
    return createAdminClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "관리자 서버 클라이언트 생성 실패"
    redirectWithError(storeSlug, message, returnTo)
  }
}

export async function setOrderQuoteAction(formData: FormData) {
  const storeSlug = toSafeString(formData.get("storeSlug"))
  const returnTo = toSafeString(formData.get("returnTo"))
  await requireAdminSessionOrRedirect(`/admin/orders?store=${encodeURIComponent(storeSlug)}`)

  const orderId = toSafeString(formData.get("orderId"))
  const subtotalAmount = parseNonNegativeInteger(toSafeString(formData.get("subtotalAmount")))
  const deliveryFee = parseNonNegativeInteger(toSafeString(formData.get("deliveryFee")))
  const priceNote = toSafeString(formData.get("priceNote"))

  if (!isUuidLike(orderId)) {
    redirectWithError(storeSlug, "주문 ID 형식이 올바르지 않습니다.", returnTo)
  }

  if (subtotalAmount == null || deliveryFee == null) {
    redirectWithError(storeSlug, "금액은 0 이상의 정수로 입력해 주세요.", returnTo)
  }

  const supabase = getAdminClientOrRedirect(storeSlug, returnTo)
  const totalAmount = subtotalAmount + deliveryFee

  const { data: existingOrder, error: existingOrderError } = await supabase
    .from("orders")
    .select("payment_status")
    .eq("id", orderId)
    .maybeSingle()

  if (existingOrderError) {
    redirectWithError(storeSlug, `주문 조회 실패: ${existingOrderError.message}`, returnTo)
  }

  if (!existingOrder) {
    redirectWithError(storeSlug, "주문을 찾을 수 없습니다.", returnTo)
  }

  if (existingOrder.payment_status === "confirmed") {
    redirectWithError(storeSlug, "입금확인된 주문은 가격을 다시 확정할 수 없습니다.", returnTo)
  }

  const nextPaymentStatus =
    existingOrder.payment_status === "not_ready"
      ? "waiting_transfer"
      : existingOrder.payment_status

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
    .neq("payment_status", "confirmed")
    .select("id, payment_status")

  if (error) {
    redirectWithError(storeSlug, `가격 확정 실패: ${error.message}`, returnTo)
  }

  if (!data || data.length === 0) {
    redirectWithError(
      storeSlug,
      "가격 확정 가능한 주문이 아닙니다. (pending 상태이며 입금확인 전 주문만 가능)",
      returnTo
    )
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
  redirectWithSuccess(storeSlug, "가격 확정을 완료했습니다.", returnTo)
}

export async function setOrderStatusAction(formData: FormData) {
  const storeSlug = toSafeString(formData.get("storeSlug"))
  const returnTo = toSafeString(formData.get("returnTo"))
  await requireAdminSessionOrRedirect(`/admin/orders?store=${encodeURIComponent(storeSlug)}`)

  const orderId = toSafeString(formData.get("orderId"))
  const nextStatus = toSafeString(formData.get("status")) as OrderStatus
  const statusNote = toSafeString(formData.get("statusNote"))

  if (!isUuidLike(orderId)) {
    redirectWithError(storeSlug, "주문 ID 형식이 올바르지 않습니다.", returnTo)
  }

  if (!ORDER_STATUS_OPTIONS.includes(nextStatus)) {
    redirectWithError(storeSlug, "변경할 주문 상태 값이 올바르지 않습니다.", returnTo)
  }

  const supabase = getAdminClientOrRedirect(storeSlug, returnTo)
  const updatePayload: Database["public"]["Tables"]["orders"]["Update"] = {
    status: nextStatus,
    cancel_reason: nextStatus === "canceled" ? statusNote || "관리자 취소" : null,
  }

  const { error } = await supabase.from("orders").update(updatePayload).eq("id", orderId)
  if (error) {
    redirectWithError(storeSlug, `주문 상태 변경 실패: ${error.message}`, returnTo)
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
  redirectWithSuccess(storeSlug, "주문 상태를 변경했습니다.", returnTo)
}

export async function setPaymentStatusAction(formData: FormData) {
  const storeSlug = toSafeString(formData.get("storeSlug"))
  const returnTo = toSafeString(formData.get("returnTo"))
  await requireAdminSessionOrRedirect(`/admin/orders?store=${encodeURIComponent(storeSlug)}`)

  const orderId = toSafeString(formData.get("orderId"))
  const paymentStatus = toSafeString(formData.get("paymentStatus")) as PaymentStatus

  if (!isUuidLike(orderId)) {
    redirectWithError(storeSlug, "주문 ID 형식이 올바르지 않습니다.", returnTo)
  }

  if (!PAYMENT_STATUS_OPTIONS.includes(paymentStatus)) {
    redirectWithError(storeSlug, "결제 상태 값이 올바르지 않습니다.", returnTo)
  }

  const supabase = getAdminClientOrRedirect(storeSlug, returnTo)
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
    redirectWithError(storeSlug, `결제 상태 변경 실패: ${error.message}`, returnTo)
  }

  if (!data || data.length === 0) {
    redirectWithError(storeSlug, "결제 상태 변경 대상 주문을 찾지 못했습니다.", returnTo)
  }

  const appliedPaymentStatus = data[0]?.payment_status
  if (appliedPaymentStatus !== paymentStatus) {
    redirectWithError(
      storeSlug,
      `결제 상태 저장 불일치: 요청=${paymentStatus}, 실제=${appliedPaymentStatus ?? "unknown"}`,
      returnTo
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
  redirectWithSuccess(storeSlug, "결제 상태를 변경했습니다.", returnTo)
}
