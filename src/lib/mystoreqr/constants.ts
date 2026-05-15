import type { Database } from "@/types/database.type"

type OrderStatus = Database["public"]["Enums"]["order_status"]
type PaymentStatus = Database["public"]["Enums"]["payment_status"]

export const ORDER_STATUS_OPTIONS: OrderStatus[] = [
  "pending",
  "payment_confirmed",
  "preparing",
  "delivering",
  "completed",
  "canceled",
]

export const PAYMENT_STATUS_OPTIONS: PaymentStatus[] = [
  "not_ready",
  "waiting_transfer",
  "transfer_submitted",
  "confirmed",
  "rejected",
]
