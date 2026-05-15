import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { Tables } from "@/types/database.type"

type StoreRow = Tables<"stores">
type OrderRow = Tables<"orders">
type OrderItemRow = Tables<"order_items">
type TransferReportRow = Tables<"transfer_reports">
type ProductRow = Tables<"products">
type CategoryRow = Tables<"categories">
type OrderStatusEventRow = Tables<"order_status_events">

export type AdminStore = Pick<StoreRow, "id" | "slug" | "name" | "delivery_fee" | "phone">

export type AdminOrderItem = Pick<OrderItemRow, "id" | "product_name" | "quantity" | "unit_price" | "line_total">

export type AdminTransferReport = Pick<
  TransferReportRow,
  "id" | "depositor_name" | "transferred_amount" | "status" | "note" | "created_at"
>

export type AdminOrder = Pick<
  OrderRow,
  | "id"
  | "order_code"
  | "customer_name"
  | "customer_phone"
  | "fulfillment_type"
  | "delivery_address"
  | "delivery_address_detail"
  | "customer_note"
  | "cancel_reason"
  | "status"
  | "payment_status"
  | "price_status"
  | "price_note"
  | "subtotal_amount"
  | "delivery_fee"
  | "total_amount"
  | "created_at"
  | "updated_at"
  | "quoted_at"
> & {
  order_items: AdminOrderItem[]
  transfer_reports: AdminTransferReport[]
}

export type AdminProduct = Pick<
  ProductRow,
  | "id"
  | "name"
  | "price"
  | "unit"
  | "description"
  | "is_active"
  | "is_sold_out"
  | "display_order"
  | "category_id"
  | "updated_at"
> & {
  category_name: string | null
}

export type AdminCategory = Pick<CategoryRow, "id" | "name" | "display_order" | "is_active">

export type AdminDashboardMetrics = {
  periodDays: number
  totalOrders: number
  quotedOrders: number
  completedOrders: number
  canceledOrders: number
  waitingTransferOrders: number
  confirmedPayments: number
  totalRevenue: number
  averageOrderAmount: number
  dailyOrders: Array<{ date: string; count: number }>
}

export type AdminOrderStatusEvent = Pick<
  OrderStatusEventRow,
  "id" | "order_id" | "new_status" | "previous_status" | "created_at" | "note"
> & {
  order_code: string | null
}

export async function getAdminStores(): Promise<AdminStore[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("stores")
    .select("id, slug, name, delivery_fee, phone")
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(`관리자 매장 조회 실패: ${error.message}`)
  }

  return data ?? []
}

export async function getAdminOrdersByStoreId(storeId: string, limit = 100): Promise<AdminOrder[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("orders")
    .select(
      [
        "id",
        "order_code",
        "customer_name",
        "customer_phone",
        "fulfillment_type",
        "delivery_address",
        "delivery_address_detail",
        "customer_note",
        "cancel_reason",
        "status",
        "payment_status",
        "price_status",
        "price_note",
        "subtotal_amount",
        "delivery_fee",
        "total_amount",
        "created_at",
        "updated_at",
        "quoted_at",
        "order_items(id, product_name, quantity, unit_price, line_total)",
        "transfer_reports(id, depositor_name, transferred_amount, status, note, created_at)",
      ].join(", ")
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`관리자 주문 조회 실패: ${error.message}`)
  }

  const orders = (data ?? []) as unknown as AdminOrder[]

  return orders.map((order) => ({
    ...order,
    order_items: order.order_items ?? [],
    transfer_reports: order.transfer_reports ?? [],
  }))
}

export async function getAdminProductsByStoreId(storeId: string): Promise<AdminProduct[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, price, unit, description, is_active, is_sold_out, display_order, category_id, updated_at, categories(name)"
    )
    .eq("store_id", storeId)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true })

  if (error) {
    throw new Error(`관리자 상품 조회 실패: ${error.message}`)
  }

  const rows = (data ?? []) as Array<
    Omit<AdminProduct, "category_name"> & { categories: { name: string } | null }
  >

  return rows.map((row) => ({
    ...row,
    category_name: row.categories?.name ?? null,
  }))
}

export async function getAdminCategoriesByStoreId(storeId: string): Promise<AdminCategory[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, display_order, is_active")
    .eq("store_id", storeId)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true })

  if (error) {
    throw new Error(`카테고리 조회 실패: ${error.message}`)
  }

  return data ?? []
}

export async function getAdminDashboardMetricsByStoreId(
  storeId: string,
  periodDays = 7
): Promise<AdminDashboardMetrics> {
  const supabase = await createClient()
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from("orders")
    .select("created_at, status, payment_status, price_status, total_amount")
    .eq("store_id", storeId)
    .gte("created_at", since)
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(`대시보드 지표 조회 실패: ${error.message}`)
  }

  const orders = data ?? []
  const totalOrders = orders.length
  const quotedOrders = orders.filter((order) => order.price_status === "quoted").length
  const completedOrders = orders.filter((order) => order.status === "completed").length
  const canceledOrders = orders.filter((order) => order.status === "canceled").length
  const waitingTransferOrders = orders.filter((order) => order.payment_status === "waiting_transfer").length
  const confirmedPayments = orders.filter((order) => order.payment_status === "confirmed").length
  const totalRevenue = orders.reduce((acc, order) => acc + (order.total_amount ?? 0), 0)
  const averageOrderAmount = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0

  const dailyMap = new Map<string, number>()
  for (let i = periodDays - 1; i >= 0; i -= 1) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const key = date.toISOString().slice(0, 10)
    dailyMap.set(key, 0)
  }

  for (const order of orders) {
    const key = order.created_at.slice(0, 10)
    if (!dailyMap.has(key)) {
      dailyMap.set(key, 0)
    }

    dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1)
  }

  const dailyOrders = [...dailyMap.entries()].map(([date, count]) => ({ date, count }))

  return {
    periodDays,
    totalOrders,
    quotedOrders,
    completedOrders,
    canceledOrders,
    waitingTransferOrders,
    confirmedPayments,
    totalRevenue,
    averageOrderAmount,
    dailyOrders,
  }
}

export async function getRecentOrderStatusEventsByStoreId(
  storeId: string,
  limit = 40
): Promise<AdminOrderStatusEvent[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("order_status_events")
    .select("id, order_id, new_status, previous_status, created_at, note, orders(order_code)")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`주문 이벤트 조회 실패: ${error.message}`)
  }

  const rows = (data ?? []) as Array<
    Omit<AdminOrderStatusEvent, "order_code"> & { orders: { order_code: string } | null }
  >

  return rows.map((row) => ({
    ...row,
    order_code: row.orders?.order_code ?? null,
  }))
}
