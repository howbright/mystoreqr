import { NextResponse } from "next/server"

import {
  getOrderTrackingByToken,
  getOrderTrackingItemsByToken,
  getPublicStoreBySlug,
} from "@/lib/mystoreqr/public-queries"

type TrackingBody = {
  lookupToken: string
  customerPhone: string
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
  return typeof value.lookupToken === "string" && typeof value.customerPhone === "string"
}

export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errorResponse("요청 본문(JSON) 형식이 올바르지 않습니다.")
  }

  if (!isValidTrackingPayload(payload)) {
    return errorResponse("lookupToken, customerPhone 값이 필요합니다.")
  }

  const tracking = await getOrderTrackingByToken(payload.lookupToken, payload.customerPhone)
  if (!tracking) {
    return errorResponse("주문을 찾을 수 없습니다. 토큰/연락처를 다시 확인해 주세요.", 404)
  }
  const trackingItems = await getOrderTrackingItemsByToken(payload.lookupToken, payload.customerPhone)

  const storeSlug =
    typeof payload.storeSlug === "string" && payload.storeSlug.trim().length > 0
      ? payload.storeSlug.trim().toLowerCase()
      : null

  let bankInfo: {
    name: string
    bankName: string
    bankAccountNumber: string
    bankAccountHolder: string
  } | null = null

  if (storeSlug) {
    const bundle = await getPublicStoreBySlug(storeSlug)
    if (bundle) {
      bankInfo = {
        name: bundle.store.name,
        bankName: bundle.store.bank_name,
        bankAccountNumber: bundle.store.bank_account_number,
        bankAccountHolder: bundle.store.bank_account_holder,
      }
    }
  }

  return NextResponse.json({
    order: tracking,
    items: trackingItems,
    bankInfo,
  })
}
