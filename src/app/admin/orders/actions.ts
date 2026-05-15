"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { ORDER_STATUS_OPTIONS, PAYMENT_STATUS_OPTIONS } from "@/lib/mystoreqr/constants"
import { createClient } from "@/lib/supabase/server"
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

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    return null
  }

  return data.user
}

export async function setOrderQuoteAction(formData: FormData) {
  const storeSlug = toSafeString(formData.get("storeSlug"))
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

  const user = await getAuthenticatedUser()
  if (!user) {
    redirectWithError(storeSlug, "관리자 로그인이 필요합니다.")
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("quote_order_price", {
    p_order_id: orderId,
    p_subtotal_amount: subtotalAmount,
    p_delivery_fee: deliveryFee,
    p_price_note: priceNote || undefined,
  })

  if (error) {
    redirectWithError(storeSlug, `가격 확정 실패: ${error.message}`)
  }

  revalidatePath("/admin/orders")
  redirectWithSuccess(storeSlug, "가격 확정을 완료했습니다.")
}

export async function setOrderStatusAction(formData: FormData) {
  const storeSlug = toSafeString(formData.get("storeSlug"))
  const orderId = toSafeString(formData.get("orderId"))
  const nextStatus = toSafeString(formData.get("status")) as OrderStatus
  const statusNote = toSafeString(formData.get("statusNote"))

  if (!isUuidLike(orderId)) {
    redirectWithError(storeSlug, "주문 ID 형식이 올바르지 않습니다.")
  }

  if (!ORDER_STATUS_OPTIONS.includes(nextStatus)) {
    redirectWithError(storeSlug, "변경할 주문 상태 값이 올바르지 않습니다.")
  }

  const user = await getAuthenticatedUser()
  if (!user) {
    redirectWithError(storeSlug, "관리자 로그인이 필요합니다.")
  }

  const supabase = await createClient()
  const updatePayload: Database["public"]["Tables"]["orders"]["Update"] = {
    status: nextStatus,
    cancel_reason: nextStatus === "canceled" ? statusNote || "관리자 취소" : null,
  }

  const { error } = await supabase.from("orders").update(updatePayload).eq("id", orderId)
  if (error) {
    redirectWithError(storeSlug, `주문 상태 변경 실패: ${error.message}`)
  }

  revalidatePath("/admin/orders")
  redirectWithSuccess(storeSlug, "주문 상태를 변경했습니다.")
}

export async function setPaymentStatusAction(formData: FormData) {
  const storeSlug = toSafeString(formData.get("storeSlug"))
  const orderId = toSafeString(formData.get("orderId"))
  const paymentStatus = toSafeString(formData.get("paymentStatus")) as PaymentStatus

  if (!isUuidLike(orderId)) {
    redirectWithError(storeSlug, "주문 ID 형식이 올바르지 않습니다.")
  }

  if (!PAYMENT_STATUS_OPTIONS.includes(paymentStatus)) {
    redirectWithError(storeSlug, "결제 상태 값이 올바르지 않습니다.")
  }

  const user = await getAuthenticatedUser()
  if (!user) {
    redirectWithError(storeSlug, "관리자 로그인이 필요합니다.")
  }

  const supabase = await createClient()
  const updatePayload: Database["public"]["Tables"]["orders"]["Update"] = {
    payment_status: paymentStatus,
  }

  if (paymentStatus === "confirmed") {
    updatePayload.confirmed_at = new Date().toISOString()
    updatePayload.confirmed_by = user.id
  } else {
    updatePayload.confirmed_at = null
    updatePayload.confirmed_by = null
  }

  const { error } = await supabase.from("orders").update(updatePayload).eq("id", orderId)
  if (error) {
    redirectWithError(storeSlug, `결제 상태 변경 실패: ${error.message}`)
  }

  revalidatePath("/admin/orders")
  redirectWithSuccess(storeSlug, "결제 상태를 변경했습니다.")
}
