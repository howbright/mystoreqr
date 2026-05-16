import Link from "next/link"

import { createClient } from "@/lib/supabase/server"

type StoreLink = {
  slug: string
  name: string
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("stores")
    .select("slug, name")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(5)

  const stores = (data ?? []) as StoreLink[]

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-8 md:px-8">
      <header className="mq-card p-6">
        <p className="text-sm font-medium text-brand-strong">MyStoreQR</p>
        <h1 className="mt-1 text-3xl font-bold text-zinc-900">동네마트 주문 MVP</h1>
        <p className="mt-3 text-sm text-zinc-700">
          QR로 접속해서 회원가입 없이 주문하고, 사장님이 전화 확인 후 가격을 확정하는
          <strong className="text-brand"> Quote-First </strong>
          플로우입니다.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        <Link href="/track" className="mq-card p-5 transition-colors hover:bg-brand-soft">
          <p className="text-sm font-semibold text-zinc-900">주문 추적</p>
          <p className="mt-1 text-sm text-zinc-600">주문번호 + 연락처로 가격/입금/배송 상태 조회</p>
        </Link>
        <Link href="/admin/orders" className="mq-card p-5 transition-colors hover:bg-brand-soft">
          <p className="text-sm font-semibold text-zinc-900">관리자 주문 보드</p>
          <p className="mt-1 text-sm text-zinc-600">가격 확정, 상태 변경, 입금 확인 처리</p>
        </Link>
      </section>

      <section className="mq-card p-5">
        <h2 className="text-lg font-semibold text-zinc-900">매장 주문 페이지</h2>
        {stores.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">
            아직 활성화된 매장이 없습니다. `stores` 테이블에 `is_active=true` 매장을 먼저 추가해 주세요.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {stores.map((store) => (
              <li key={store.slug}>
                <Link
                  href={`/s/${store.slug}`}
                  className="inline-flex rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-strong hover:bg-brand-border"
                >
                  {store.name} 주문 열기 (`/s/{store.slug}`)
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
