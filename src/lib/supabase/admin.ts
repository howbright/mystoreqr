import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database.type"

import { getSupabaseEnv } from "./env"

function getSupabaseAdminKey() {
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY

  if (!adminKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)")
  }

  return adminKey
}

export function createAdminClient() {
  const { url } = getSupabaseEnv()
  const adminKey = getSupabaseAdminKey()

  return createClient<Database>(url, adminKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}
