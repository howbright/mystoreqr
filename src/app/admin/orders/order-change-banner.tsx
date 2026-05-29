"use client"

import { useEffect, useState } from "react"

type OrderChangeBannerProps = {
  storeSlug: string
  initialLatestUpdatedAt: string
  pollIntervalMs?: number
}

export function OrderChangeBanner({
  storeSlug,
  initialLatestUpdatedAt,
  pollIntervalMs = 15000,
}: OrderChangeBannerProps) {
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function checkForChanges() {
      if (document.visibilityState !== "visible") {
        return
      }

      try {
        const params = new URLSearchParams({
          store: storeSlug,
          since: initialLatestUpdatedAt,
        })
        const response = await fetch(`/api/admin/orders/changes?${params.toString()}`, {
          cache: "no-store",
        })

        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as { hasChanges?: boolean }
        if (isMounted && payload.hasChanges) {
          setHasChanges(true)
        }
      } catch {
        // 변경 감지는 보조 기능이므로 실패해도 주문 보드 사용을 막지 않습니다.
      }
    }

    const timer = window.setInterval(() => {
      void checkForChanges()
    }, pollIntervalMs)

    return () => {
      isMounted = false
      window.clearInterval(timer)
    }
  }, [initialLatestUpdatedAt, pollIntervalMs, storeSlug])

  if (!hasChanges) {
    return null
  }

  return (
    <div className="fixed top-4 right-4 left-4 z-50 mx-auto max-w-xl rounded-2xl border border-brand-border bg-white px-4 py-4 shadow-2xl ring-4 ring-brand-soft sm:left-auto sm:mx-0 sm:w-[28rem]">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-base font-black text-zinc-950">새 변경사항이 있습니다.</p>
          <p className="mt-1 text-sm leading-5 text-zinc-600">
            새 주문, 취소, 가격확정, 입금확인, 배송 상태 변경 등이 반영되었을 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            window.location.reload()
          }}
          className="h-10 rounded-lg bg-brand px-3 text-sm font-bold text-white hover:bg-brand-strong"
        >
          목록 새로고침
        </button>
      </div>
    </div>
  )
}
