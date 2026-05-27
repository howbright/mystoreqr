"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireAdminSessionOrRedirect } from "@/lib/mystoreqr/admin-auth"
import { createAdminClient } from "@/lib/supabase/admin"

function toSafeString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : ""
}

function buildRedirectPath(storeSlug: string, type: "ok" | "error", message: string) {
  const params = new URLSearchParams()
  if (storeSlug) {
    params.set("store", storeSlug)
  }
  params.set(type, message)
  return `/admin/onboarding?${params.toString()}`
}

function redirectWithError(storeSlug: string, message: string): never {
  redirect(buildRedirectPath(storeSlug, "error", message))
}

function redirectWithSuccess(storeSlug: string, message: string): never {
  redirect(buildRedirectPath(storeSlug, "ok", message))
}

export async function updateStoreOrderPolicyAction(formData: FormData) {
  const storeSlug = toSafeString(formData.get("storeSlug")).toLowerCase()
  await requireAdminSessionOrRedirect(`/admin/onboarding?store=${encodeURIComponent(storeSlug)}`)

  if (!storeSlug) {
    redirectWithError(storeSlug, "매장을 선택해 주세요.")
  }

  const orderPolicy = toSafeString(formData.get("orderPolicy"))
  if (orderPolicy.length > 1000) {
    redirectWithError(storeSlug, "주문정책은 1,000자 이내로 입력해 주세요.")
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("stores")
    .update({
      order_policy: orderPolicy || null,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", storeSlug)

  if (error) {
    redirectWithError(storeSlug, `주문정책 저장 실패: ${error.message}`)
  }

  revalidatePath(`/s/${storeSlug}`)
  revalidatePath(`/admin/onboarding`)
  redirectWithSuccess(storeSlug, "주문정책을 저장했습니다.")
}
