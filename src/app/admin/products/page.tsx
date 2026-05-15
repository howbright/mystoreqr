import Link from "next/link"

import { logoutAdminAction } from "@/app/admin/_actions/auth"
import { requireAdminSessionOrRedirect } from "@/lib/mystoreqr/admin-auth"
import {
  getAdminCategoriesByStoreId,
  getAdminProductsByStoreId,
  getAdminStores,
} from "@/lib/mystoreqr/admin-queries"
import { formatKrw } from "@/lib/mystoreqr/format"

import { importProductsCsvAction, updateProductQuickAction } from "./actions"

function firstString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

const SAMPLE_CSV = `name,category,price,unit,description,is_sold_out,is_active,display_order
상추,채소/과일,3000,봉,신선한 상추,false,true,1
토마토,채소/과일,,kg,시세 상품,true,true,2
우유 1L,유제품,2800,개,,false,true,1`

export default async function AdminProductsPage(props: PageProps<"/admin/products">) {
  const searchParams = await props.searchParams
  const queryString = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      queryString.set(key, value)
    }
  }

  const nextPath = `/admin/products${queryString.toString() ? `?${queryString.toString()}` : ""}`
  await requireAdminSessionOrRedirect(nextPath)

  const storeSlugParam = firstString(searchParams.store)?.trim().toLowerCase()
  const successMessage = firstString(searchParams.ok)
  const errorMessage = firstString(searchParams.error)

  const stores = await getAdminStores()
  if (stores.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-bold text-zinc-900">상품 관리</h1>
        <section className="mq-card p-5 text-sm text-zinc-700">
          <p>조회 가능한 매장이 없습니다.</p>
        </section>
      </main>
    )
  }

  const selectedStore = stores.find((store) => store.slug === storeSlugParam) ?? stores[0]
  const [products, categories] = await Promise.all([
    getAdminProductsByStoreId(selectedStore.id),
    getAdminCategoriesByStoreId(selectedStore.id),
  ])

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:px-8">
      <header className="mq-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-brand-strong">MyStoreQR Admin</p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-900">상품 관리</h1>
            <p className="mt-2 text-sm text-zinc-600">
              매장: {selectedStore.name} / 카테고리 {categories.length}개 / 상품 {products.length}개
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/orders?store=${encodeURIComponent(selectedStore.slug)}`}
              className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand-strong hover:bg-brand-border"
            >
              주문 보드
            </Link>
            <Link
              href={`/admin/dashboard?store=${encodeURIComponent(selectedStore.slug)}`}
              className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand-strong hover:bg-brand-border"
            >
              대시보드
            </Link>
            <Link
              href={`/admin/onboarding?store=${encodeURIComponent(selectedStore.slug)}`}
              className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand-strong hover:bg-brand-border"
            >
              온보딩
            </Link>
            <form action={logoutAdminAction}>
              <button
                type="submit"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {stores.map((store) => (
          <Link
            key={store.id}
            href={`/admin/products?store=${encodeURIComponent(store.slug)}`}
            className={`rounded-full px-4 py-2 text-sm ${
              store.id === selectedStore.id
                ? "bg-brand text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-brand-soft"
            }`}
          >
            {store.name}
          </Link>
        ))}
      </nav>

      {successMessage ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
      ) : null}

      <section className="mq-card p-4">
        <h2 className="text-lg font-semibold text-zinc-900">CSV 업로드 (엑셀 내보내기용)</h2>
        <p className="mt-1 text-sm text-zinc-600">
          CSV 파일을 업로드하거나 텍스트를 붙여넣으면 이름 기준으로 기존 상품은 수정, 신규는 생성합니다.
        </p>

        <form action={importProductsCsvAction} className="mt-3 grid gap-3">
          <input type="hidden" name="storeSlug" value={selectedStore.slug} />
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">CSV 파일</span>
            <input
              type="file"
              name="csvFile"
              accept=".csv,text/csv"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">CSV 텍스트 (파일 대체)</span>
            <textarea
              name="csvText"
              defaultValue={SAMPLE_CSV}
              className="min-h-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono focus:border-brand focus:outline-none"
            />
          </label>
          <button type="submit" className="mq-btn-primary h-10 w-full md:w-56">
            CSV 반영
          </button>
        </form>
      </section>

      <section className="mq-card p-4">
        <h2 className="text-lg font-semibold text-zinc-900">빠른 수정</h2>
        <p className="mt-1 text-sm text-zinc-600">가격/품절/활성 여부를 바로 수정할 수 있습니다.</p>

        <div className="mt-3 space-y-3">
          {products.map((product) => (
            <form
              key={product.id}
              action={updateProductQuickAction}
              className="rounded-xl border border-zinc-200 p-3"
            >
              <input type="hidden" name="storeSlug" value={selectedStore.slug} />
              <input type="hidden" name="productId" value={product.id} />

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-7">
                <label className="grid gap-1 text-xs text-zinc-600 xl:col-span-2">
                  상품명
                  <input
                    name="name"
                    defaultValue={product.name}
                    className="h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-brand focus:outline-none"
                  />
                </label>

                <div className="grid gap-1 text-xs text-zinc-600">
                  <span>카테고리</span>
                  <p className="h-9 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 text-sm text-zinc-700">
                    {product.category_name ?? "미분류"}
                  </p>
                </div>

                <label className="grid gap-1 text-xs text-zinc-600">
                  가격
                  <input
                    name="price"
                    defaultValue={product.price ?? ""}
                    className="h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-brand focus:outline-none"
                    placeholder="미입력"
                  />
                </label>

                <label className="grid gap-1 text-xs text-zinc-600">
                  단위
                  <input
                    name="unit"
                    defaultValue={product.unit ?? ""}
                    className="h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-brand focus:outline-none"
                    placeholder="개"
                  />
                </label>

                <label className="grid gap-1 text-xs text-zinc-600 xl:col-span-2">
                  설명
                  <input
                    name="description"
                    defaultValue={product.description ?? ""}
                    className="h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-brand focus:outline-none"
                  />
                </label>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                    <input name="isSoldOut" type="checkbox" value="1" defaultChecked={product.is_sold_out} />
                    품절
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                    <input name="isActive" type="checkbox" value="1" defaultChecked={product.is_active} />
                    활성
                  </label>
                  <p className="text-xs text-zinc-500">현재가: {formatKrw(product.price)}</p>
                </div>

                <div className="flex items-center gap-2">
                  <p className="text-[11px] text-zinc-400">
                    수정일 {new Date(product.updated_at).toLocaleDateString("ko-KR")}
                  </p>
                  <button type="submit" className="mq-btn-primary h-9 w-20 rounded-md text-xs">
                    저장
                  </button>
                </div>
              </div>
            </form>
          ))}
        </div>
      </section>
    </main>
  )
}
