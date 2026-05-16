import webPush, { WebPushError } from "web-push"

import { formatCustomerOrderCode, formatKrw } from "@/lib/mystoreqr/format"
import { createAdminClient } from "@/lib/supabase/admin"

type PushSubscriptionRecord = {
  endpoint: string
  p256dh: string
  auth: string
}

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT ?? "mailto:admin@mystoreqr.local"

  if (!publicKey || !privateKey) {
    return null
  }

  return { publicKey, privateKey, subject }
}

function configureWebPush() {
  const config = getVapidConfig()
  if (!config) {
    return false
  }

  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey)
  return true
}

export function isWebPushConfigured() {
  return getVapidConfig() !== null
}

export async function sendQuoteReadyPush(orderId: string) {
  if (!configureWebPush()) {
    return
  }

  const supabase = createAdminClient()
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("order_code, lookup_token, customer_phone, total_amount, stores(name, slug)")
    .eq("id", orderId)
    .maybeSingle()

  if (orderError || !order) {
    return
  }

  const { data: subscriptions, error: subscriptionsError } = await (
    supabase as unknown as {
      from(table: "order_push_subscriptions"): {
        select(columns: string): {
          eq(column: string, value: string): Promise<{
            data: PushSubscriptionRecord[] | null
            error: { message: string } | null
          }>
        }
      }
    }
  )
    .from("order_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("order_id", orderId)

  if (subscriptionsError || !subscriptions || subscriptions.length === 0) {
    return
  }

  const storeName = Array.isArray(order.stores) ? order.stores[0]?.name : order.stores?.name
  const storeSlug = Array.isArray(order.stores) ? order.stores[0]?.slug : order.stores?.slug
  const trackingPath = `/track?token=${encodeURIComponent(order.lookup_token)}&phone=${encodeURIComponent(order.customer_phone)}${storeSlug ? `&store=${encodeURIComponent(storeSlug)}` : ""}`
  const payload = JSON.stringify({
    title: "주문 금액이 확정되었습니다",
    body: `${storeName ?? "매장"} 주문 #${formatCustomerOrderCode(order.order_code)} 금액: ${formatKrw(order.total_amount)}`,
    url: trackingPath,
  })

  await Promise.allSettled(
    subscriptions.map((subscription) =>
      webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload
      )
    )
  )
}

export function isExpiredPushSubscriptionError(error: unknown) {
  return error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)
}
