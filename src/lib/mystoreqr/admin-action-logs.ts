import { createAdminClient } from "@/lib/supabase/admin"

type AdminActionLogInput = {
  storeSlug: string
  orderId: string | null
  actionType: string
  summary: string
  payload?: Record<string, unknown>
}

export async function writeAdminActionLog(input: AdminActionLogInput) {
  try {
    const supabase = createAdminClient()
    await supabase.from("admin_action_logs" as never).insert({
      store_slug: input.storeSlug,
      order_id: input.orderId,
      action_type: input.actionType,
      summary: input.summary,
      payload: input.payload ?? {},
    } as never)
  } catch {
    // Logging failures should not block core business flow.
  }
}
