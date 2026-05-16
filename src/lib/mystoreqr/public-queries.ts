import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database, Tables } from "@/types/database.type"

import { normalizeCustomerOrderCode, normalizePhone } from "./format"

type StoreRow = Tables<"stores">
type CategoryRow = Tables<"categories">
type ProductRow = Tables<"products">
type OrderItemRow = Tables<"order_items">

type PublicOrderTracking = Database["public"]["Functions"]["get_order_tracking_v2"]["Returns"][number]
type PublicOrderTrackingRow = PublicOrderTracking & {
  customer_phone: string
}
type PublicOrderIdRow = {
  id: string
  customer_phone: string
}
export type PublicTrackingStoreInfo = {
  name: string
  roadAddress: string | null
  jibunAddress: string | null
  bankName: string
  bankAccountNumber: string
  bankAccountHolder: string
}

type OrderStoreInfoRow = {
  customer_phone: string
  stores:
    | {
        name: string
        address_road: string | null
        address_detail: string | null
        bank_name: string
        bank_account_number: string
        bank_account_holder: string
      }
    | {
        name: string
        address_road: string | null
        address_detail: string | null
        bank_name: string
        bank_account_number: string
        bank_account_holder: string
      }[]
    | null
}

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
  | "address_road"
  | "address_detail"
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

export type PublicTrackingItem = Pick<OrderItemRow, "product_name" | "quantity" | "unit_price" | "line_total">

export const getPublicStoreBySlug = cache(async (slug: string): Promise<PublicStoreBundle | null> => {
  const normalizedSlug = slug.trim().toLowerCase()

  if (!normalizedSlug) {
    return null
  }

  const supabase = await createClient()

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select(
      "id, slug, name, description, phone, delivery_fee, min_order_amount, address_road, address_detail, delivery_enabled, pickup_enabled, bank_name, bank_account_number, bank_account_holder"
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

export async function getOrderTrackingByOrderCode(
  orderCode: string,
  customerPhone: string,
  storeSlug?: string
): Promise<PublicOrderTracking | null> {
  const code = normalizeCustomerOrderCode(orderCode)
  const phone = normalizePhone(customerPhone)
  const slug = storeSlug?.trim().toLowerCase()

  if (!code || phone.length < 10) {
    return null
  }

  const supabase = createAdminClient()
  const isShortCode = /^\d{4}$/.test(code)
  let query = supabase
    .from("orders")
    .select(
      "order_code, status, payment_status, price_status, price_note, subtotal_amount, delivery_fee, total_amount, created_at, updated_at, customer_phone, stores!inner(slug)"
    )
    .order("created_at", { ascending: false })
    .limit(isShortCode ? 50 : 1)

  if (slug) {
    query = query.eq("stores.slug", slug)
  }

  if (isShortCode) {
    query = query.like("order_code", `%-${code}`)
  } else {
    query = query.eq("order_code", code)
  }

  const { data: orders, error } = await query

  if (error) {
    throw new Error(`주문 조회 실패: ${error.message}`)
  }

  const order = ((orders ?? []) as PublicOrderTrackingRow[]).find(
    (row) => normalizePhone(row.customer_phone) === phone
  )

  if (!order || normalizePhone(order.customer_phone) !== phone) {
    return null
  }

  return {
    order_code: order.order_code,
    status: order.status,
    payment_status: order.payment_status,
    price_status: order.price_status,
    price_note: order.price_note ?? "",
    subtotal_amount: order.subtotal_amount,
    delivery_fee: order.delivery_fee,
    total_amount: order.total_amount,
    created_at: order.created_at,
    updated_at: order.updated_at,
  } as PublicOrderTracking
}

export async function getOrderTrackingItemsByToken(
  lookupToken: string,
  customerPhone: string
): Promise<PublicTrackingItem[]> {
  const token = lookupToken.trim()
  const phone = normalizePhone(customerPhone)

  if (!token || !isUuidLike(token) || phone.length < 10) {
    return []
  }

  const supabase = createAdminClient()
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, customer_phone")
    .eq("lookup_token", token)
    .maybeSingle()

  if (orderError) {
    throw new Error(`주문 조회 실패: ${orderError.message}`)
  }

  if (!order) {
    return []
  }

  if (normalizePhone(order.customer_phone) !== phone) {
    return []
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("product_name, quantity, unit_price, line_total")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true })

  if (itemsError) {
    throw new Error(`주문 상품 조회 실패: ${itemsError.message}`)
  }

  return items ?? []
}

export async function getOrderTrackingItemsByOrderCode(
  orderCode: string,
  customerPhone: string,
  storeSlug?: string
): Promise<PublicTrackingItem[]> {
  const code = normalizeCustomerOrderCode(orderCode)
  const phone = normalizePhone(customerPhone)
  const slug = storeSlug?.trim().toLowerCase()

  if (!code || phone.length < 10) {
    return []
  }

  const supabase = createAdminClient()
  const isShortCode = /^\d{4}$/.test(code)
  let query = supabase
    .from("orders")
    .select("id, customer_phone, stores!inner(slug)")
    .order("created_at", { ascending: false })
    .limit(isShortCode ? 50 : 1)

  if (slug) {
    query = query.eq("stores.slug", slug)
  }

  if (isShortCode) {
    query = query.like("order_code", `%-${code}`)
  } else {
    query = query.eq("order_code", code)
  }

  const { data: orders, error: orderError } = await query

  if (orderError) {
    throw new Error(`주문 조회 실패: ${orderError.message}`)
  }

  const order = ((orders ?? []) as PublicOrderIdRow[]).find(
    (row) => normalizePhone(row.customer_phone) === phone
  )

  if (!order || normalizePhone(order.customer_phone) !== phone) {
    return []
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("product_name, quantity, unit_price, line_total")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true })

  if (itemsError) {
    throw new Error(`주문 상품 조회 실패: ${itemsError.message}`)
  }

  return items ?? []
}

function mapStoreInfo(row: OrderStoreInfoRow | null | undefined): PublicTrackingStoreInfo | null {
  if (!row?.stores) {
    return null
  }

  const store = Array.isArray(row.stores) ? row.stores[0] : row.stores
  if (!store) {
    return null
  }

  return {
    name: store.name,
    roadAddress: store.address_road,
    jibunAddress: store.address_detail,
    bankName: store.bank_name,
    bankAccountNumber: store.bank_account_number,
    bankAccountHolder: store.bank_account_holder,
  }
}

export async function getOrderTrackingStoreInfoByToken(
  lookupToken: string,
  customerPhone: string
): Promise<PublicTrackingStoreInfo | null> {
  const token = lookupToken.trim()
  const phone = normalizePhone(customerPhone)

  if (!token || !isUuidLike(token) || phone.length < 10) {
    return null
  }

  const supabase = createAdminClient()
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "customer_phone, stores!inner(name, address_road, address_detail, bank_name, bank_account_number, bank_account_holder)"
    )
    .eq("lookup_token", token)
    .maybeSingle()

  if (error) {
    throw new Error(`주문 매장 조회 실패: ${error.message}`)
  }

  if (!order || normalizePhone(order.customer_phone) !== phone) {
    return null
  }

  return mapStoreInfo(order as OrderStoreInfoRow)
}

export async function getOrderTrackingStoreInfoByOrderCode(
  orderCode: string,
  customerPhone: string,
  storeSlug?: string
): Promise<PublicTrackingStoreInfo | null> {
  const code = normalizeCustomerOrderCode(orderCode)
  const phone = normalizePhone(customerPhone)
  const slug = storeSlug?.trim().toLowerCase()

  if (!code || phone.length < 10) {
    return null
  }

  const supabase = createAdminClient()
  const isShortCode = /^\d{4}$/.test(code)
  let query = supabase
    .from("orders")
    .select(
      "customer_phone, stores!inner(slug, name, address_road, address_detail, bank_name, bank_account_number, bank_account_holder)"
    )
    .order("created_at", { ascending: false })
    .limit(isShortCode ? 50 : 1)

  if (slug) {
    query = query.eq("stores.slug", slug)
  }

  if (isShortCode) {
    query = query.like("order_code", `%-${code}`)
  } else {
    query = query.eq("order_code", code)
  }

  const { data: orders, error } = await query

  if (error) {
    throw new Error(`주문 매장 조회 실패: ${error.message}`)
  }

  const order = ((orders ?? []) as OrderStoreInfoRow[]).find(
    (row) => normalizePhone(row.customer_phone) === phone
  )

  return mapStoreInfo(order)
}
