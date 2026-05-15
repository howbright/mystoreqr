import { redirect } from "next/navigation"

import { requireAdminSessionOrRedirect } from "@/lib/mystoreqr/admin-auth"

export default async function AdminHomePage() {
  await requireAdminSessionOrRedirect("/admin/dashboard")
  redirect("/admin/dashboard")
}
