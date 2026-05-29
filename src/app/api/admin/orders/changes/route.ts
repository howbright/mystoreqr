import { NextResponse } from "next/server"

import { isAdminAuthenticated } from "@/lib/mystoreqr/admin-auth"
import { createAdminClient } from "@/lib/supabase/admin"

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: Request) {
  const isAuthenticated = await isAdminAuthenticated()
  if (!isAuthenticated) {
    return errorResponse("관리자 로그인이 필요합니다.", 401)
  }

  const url = new URL(request.url)
  const storeSlug = url.searchParams.get("store")?.trim().toLowerCase()
  const since = url.searchParams.get("since")?.trim()

  if (!storeSlug || !since) {
    return errorResponse("매장과 기준 시각이 필요합니다.")
  }

  const sinceDate = new Date(since)
  if (Number.isNaN(sinceDate.getTime())) {
    return errorResponse("기준 시각 형식이 올바르지 않습니다.")
  }

  const supabase = createAdminClient()
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("slug", storeSlug)
    .maybeSingle()

  if (storeError) {
    return errorResponse(`매장 조회 실패: ${storeError.message}`, 500)
  }

  if (!store) {
    return errorResponse("매장을 찾을 수 없습니다.", 404)
  }

  const { data: latestOrder, error: latestOrderError } = await supabase
    .from("orders")
    .select("updated_at")
    .eq("store_id", store.id)
    .gt("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestOrderError) {
    return errorResponse(`주문 변경 조회 실패: ${latestOrderError.message}`, 500)
  }

  return NextResponse.json({
    hasChanges: Boolean(latestOrder),
    latestUpdatedAt: latestOrder?.updated_at ?? null,
  })
}
