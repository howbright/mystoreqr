import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { Tables } from "@/types/database.type"

type StoreRow = Tables<"stores">
type OrderRow = Tables<"orders">
type OrderItemRow = Tables<"order_items">
type TransferReportRow = Tables<"transfer_reports">

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
