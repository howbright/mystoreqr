import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import type { Database, Tables } from "@/types/database.type"

import { normalizePhone } from "./format"

type StoreRow = Tables<"stores">
type CategoryRow = Tables<"categories">
type ProductRow = Tables<"products">

type PublicOrderTracking = Database["public"]["Functions"]["get_order_tracking_v2"]["Returns"][number]

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export type PublicStore = Pick<
  StoreRow,
  | "id"
  | "slug"
  | "name"
  | "description"
  | "phone"
  | "delivery_fee"
  | "min_order_amount"
  | "delivery_enabled"
  | "pickup_enabled"
  | "bank_name"
  | "bank_account_number"
  | "bank_account_holder"
>

export type PublicCategory = Pick<CategoryRow, "id" | "name" | "display_order">

export type PublicProduct = Pick<
  ProductRow,
  | "id"
  | "category_id"
  | "name"
  | "description"
  | "unit"
  | "price"
  | "display_order"
  | "is_sold_out"
>

export type PublicStoreBundle = {
  store: PublicStore
  categories: PublicCategory[]
  products: PublicProduct[]
}

export const getPublicStoreBySlug = cache(async (slug: string): Promise<PublicStoreBundle | null> => {
  const normalizedSlug = slug.trim().toLowerCase()

  if (!normalizedSlug) {
    return null
  }

  const supabase = await createClient()

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select(
      "id, slug, name, description, phone, delivery_fee, min_order_amount, delivery_enabled, pickup_enabled, bank_name, bank_account_number, bank_account_holder"
    )
    .eq("slug", normalizedSlug)
    .eq("is_active", true)
    .maybeSingle()

  if (storeError) {
    throw new Error(`매장 조회 실패: ${storeError.message}`)
  }

  if (!store) {
    return null
  }

  const [{ data: categories, error: categoriesError }, { data: products, error: productsError }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, name, display_order")
        .eq("store_id", store.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("products")
        .select("id, category_id, name, description, unit, price, display_order, is_sold_out")
        .eq("store_id", store.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
    ])

  if (categoriesError) {
    throw new Error(`카테고리 조회 실패: ${categoriesError.message}`)
  }

  if (productsError) {
    throw new Error(`상품 조회 실패: ${productsError.message}`)
  }

  return {
    store,
    categories: categories ?? [],
    products: products ?? [],
  }
})

export async function getOrderTrackingByToken(
  lookupToken: string,
  customerPhone: string
): Promise<PublicOrderTracking | null> {
  const token = lookupToken.trim()
  const phone = normalizePhone(customerPhone)

  if (!token || !isUuidLike(token) || phone.length < 10) {
    return null
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_order_tracking_v2", {
    p_lookup_token: token,
    p_customer_phone: phone,
  })

  if (error) {
    throw new Error(`주문 조회 실패: ${error.message}`)
  }

  if (!data || data.length === 0) {
    return null
  }

  return data[0]
}
