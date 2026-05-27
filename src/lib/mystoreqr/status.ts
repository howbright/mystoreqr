import type { Database } from "@/types/database.type"

type OrderStatus = Database["public"]["Enums"]["order_status"]
type PaymentStatus = Database["public"]["Enums"]["payment_status"]
type PriceStatus = Database["public"]["Enums"]["order_price_status"]

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "접수",
  payment_confirmed: "결제확인",
  preparing: "준비중",
  ready_for_delivery: "준비완료",
  delivering: "배달중",
  completed: "배달완료",
  canceled: "취소",
}

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  not_ready: "가격확정 전",
  waiting_transfer: "입금대기",
  transfer_submitted: "입금신고됨",
  confirmed: "입금확인",
  rejected: "입금확인 실패",
}

const PRICE_STATUS_LABEL: Record<PriceStatus, string> = {
  needs_review: "가격확정 필요",
  quoted: "가격확정 완료",
}

export function orderStatusLabel(status: OrderStatus) {
  return ORDER_STATUS_LABEL[status] ?? status
}

export function paymentStatusLabel(status: PaymentStatus) {
  return PAYMENT_STATUS_LABEL[status] ?? status
}

export function priceStatusLabel(status: PriceStatus) {
  return PRICE_STATUS_LABEL[status] ?? status
}
