import { NextResponse } from "next/server"

import { isAdminAuthenticated } from "@/lib/mystoreqr/admin-auth"
import { createAdminClient } from "@/lib/supabase/admin"

function escapeCsvField(value: string) {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

function toCsvBoolean(value: boolean) {
  return value ? "true" : "false"
}

export async function GET(request: Request) {
  const isAuthenticated = await isAdminAuthenticated()
  if (!isAuthenticated) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 })
  }

  const requestUrl = new URL(request.url)
  const storeSlug = requestUrl.searchParams.get("store")?.trim().toLowerCase() ?? ""
  if (!storeSlug) {
    return NextResponse.json({ error: "store 파라미터가 필요합니다." }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, slug")
    .eq("slug", storeSlug)
    .maybeSingle()

  if (storeError) {
    return NextResponse.json({ error: `매장 조회 실패: ${storeError.message}` }, { status: 500 })
  }

  if (!store) {
    return NextResponse.json({ error: "매장을 찾을 수 없습니다." }, { status: 404 })
  }

  const [{ data: categories, error: categoriesError }, { data: products, error: productsError }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, name")
        .eq("store_id", store.id),
      supabase
        .from("products")
        .select("id, name, category_id, price, unit, description, is_sold_out, is_active, display_order")
        .eq("store_id", store.id)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
    ])

  if (categoriesError) {
    return NextResponse.json({ error: `카테고리 조회 실패: ${categoriesError.message}` }, { status: 500 })
  }

  if (productsError) {
    return NextResponse.json({ error: `상품 조회 실패: ${productsError.message}` }, { status: 500 })
  }

  const categoryMap = new Map((categories ?? []).map((category) => [category.id, category.name]))

  const lines = [
    "id,name,category,price,unit,description,is_sold_out,is_active,display_order",
    ...(products ?? []).map((product) =>
      [
        product.id,
        product.name,
        product.category_id ? (categoryMap.get(product.category_id) ?? "") : "",
        product.price == null ? "" : String(product.price),
        product.unit ?? "",
        product.description ?? "",
        toCsvBoolean(product.is_sold_out),
        toCsvBoolean(product.is_active),
        String(product.display_order ?? 0),
      ]
        .map((field) => escapeCsvField(field))
        .join(",")
    ),
  ]

  const filenameDate = new Date().toISOString().slice(0, 10)
  const filename = `${store.slug}-products-${filenameDate}.csv`
  const csvContent = `\uFEFF${lines.join("\n")}`

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
