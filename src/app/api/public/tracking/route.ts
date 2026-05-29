import { NextResponse } from "next/server"

import {
  getOrderTrackingByOrderCode,
  getOrderTrackingByToken,
  getOrderTrackingItemsByOrderCode,
  getOrderTrackingItemsByToken,
  getOrderTrackingStoreInfoByOrderCode,
  getOrderTrackingStoreInfoByToken,
  getPublicStoreBySlug,
} from "@/lib/mystoreqr/public-queries"

type TrackingBody = {
  lookupToken?: string
  orderCode?: string
  customerPhone?: string
  storeSlug?: string
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function isValidTrackingPayload(body: unknown): body is TrackingBody {
  if (typeof body !== "object" || body === null) {
    return false
  }

  const value = body as Record<string, unknown>
  return (
    (typeof value.customerPhone === "string" || value.customerPhone === undefined) &&
    (typeof value.lookupToken === "string" || typeof value.orderCode === "string")
  )
}

export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errorResponse("요청 본문(JSON) 형식이 올바르지 않습니다.")
  }

  if (!isValidTrackingPayload(payload)) {
    return errorResponse("주문번호와 연락처 값이 필요합니다.")
  }

  const storeSlug =
    typeof payload.storeSlug === "string" && payload.storeSlug.trim().length > 0
      ? payload.storeSlug.trim().toLowerCase()
      : null
  const lookupToken =
    typeof payload.lookupToken === "string" && payload.lookupToken.trim().length > 0
      ? payload.lookupToken
      : null
  const orderCode =
    typeof payload.orderCode === "string" && payload.orderCode.trim().length > 0
      ? payload.orderCode
      : null

  const tracking = orderCode
    ? await getOrderTrackingByOrderCode(orderCode, payload.customerPhone ?? "", storeSlug ?? undefined)
    : lookupToken
      ? await getOrderTrackingByToken(lookupToken, payload.customerPhone)
      : null
  if (!tracking) {
    return errorResponse("주문을 찾을 수 없습니다. 주문번호/연락처를 다시 확인해 주세요.", 404)
  }
  const trackingItems = orderCode
    ? await getOrderTrackingItemsByOrderCode(orderCode, payload.customerPhone ?? "", storeSlug ?? undefined)
    : lookupToken
      ? await getOrderTrackingItemsByToken(lookupToken, payload.customerPhone)
      : []

  let bankInfo: {
    name: string
    roadAddress: string | null
    jibunAddress: string | null
    bankName: string
    bankAccountNumber: string
    bankAccountHolder: string
  } | null = null

  if (storeSlug) {
    const bundle = await getPublicStoreBySlug(storeSlug)
    if (bundle) {
      bankInfo = {
        name: bundle.store.name,
        roadAddress: bundle.store.address_road,
        jibunAddress: bundle.store.address_detail,
        bankName: bundle.store.bank_name,
        bankAccountNumber: bundle.store.bank_account_number,
        bankAccountHolder: bundle.store.bank_account_holder,
      }
    }
  } else if (orderCode) {
    bankInfo = await getOrderTrackingStoreInfoByOrderCode(orderCode, payload.customerPhone ?? "")
  } else if (lookupToken) {
    bankInfo = await getOrderTrackingStoreInfoByToken(lookupToken, payload.customerPhone)
  }

  return NextResponse.json({
    order: tracking,
    items: trackingItems,
    bankInfo,
  })
}
