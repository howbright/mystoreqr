import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

type PushSubscriptionBody = {
  orderId: string
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isValidPushSubscriptionBody(body: unknown): body is PushSubscriptionBody {
  if (typeof body !== "object" || body === null) {
    return false
  }

  const value = body as Record<string, unknown>
  const keys = value.keys as Record<string, unknown> | undefined

  return (
    typeof value.orderId === "string" &&
    isUuidLike(value.orderId) &&
    typeof value.endpoint === "string" &&
    value.endpoint.startsWith("https://") &&
    typeof keys?.p256dh === "string" &&
    typeof keys.auth === "string"
  )
}

export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errorResponse("요청 본문(JSON) 형식이 올바르지 않습니다.")
  }

  if (!isValidPushSubscriptionBody(payload)) {
    return errorResponse("푸시 구독 정보가 올바르지 않습니다.")
  }

  const supabase = createAdminClient()
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, store_id")
    .eq("id", payload.orderId)
    .maybeSingle()

  if (orderError) {
    return errorResponse(`주문 조회 실패: ${orderError.message}`, 500)
  }

  if (!order) {
    return errorResponse("주문을 찾을 수 없습니다.", 404)
  }

  const { error } = await (
    supabase as unknown as {
      from(table: "order_push_subscriptions"): {
        upsert(
          values: {
            order_id: string
            store_id: string
            endpoint: string
            p256dh: string
            auth: string
            user_agent: string | null
          },
          options: { onConflict: string }
        ): Promise<{ error: { message: string } | null }>
      }
    }
  )
    .from("order_push_subscriptions")
    .upsert(
      {
        order_id: order.id,
        store_id: order.store_id,
        endpoint: payload.endpoint,
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth,
        user_agent: request.headers.get("user-agent"),
      },
      { onConflict: "endpoint" }
    )

  if (error) {
    return errorResponse(`푸시 구독 저장 실패: ${error.message}`, 500)
  }

  return NextResponse.json({ ok: true })
}
