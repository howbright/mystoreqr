"use server"

import { redirect } from "next/navigation"

import { clearAdminSession, loginWithPin, sanitizeAdminNextPath } from "@/lib/mystoreqr/admin-auth"

function toSafeString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : ""
}

export async function loginAdminAction(formData: FormData) {
  const pin = toSafeString(formData.get("pin"))
  const nextPath = sanitizeAdminNextPath(toSafeString(formData.get("next")) || "/admin/dashboard")

  const isLoggedIn = await loginWithPin(pin)
  if (!isLoggedIn) {
    redirect(`/admin/login?error=${encodeURIComponent("PIN이 올바르지 않습니다.")}&next=${encodeURIComponent(nextPath)}`)
  }

  redirect(nextPath)
}

export async function logoutAdminAction() {
  await clearAdminSession()
  redirect("/admin/login?ok=logout")
}
