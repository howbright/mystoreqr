import type { AdminOrder } from "@/lib/mystoreqr/admin-queries"
import type { Database } from "@/types/database.type"

type OrderStatus = Database["public"]["Enums"]["order_status"]
type PaymentStatus = Database["public"]["Enums"]["payment_status"]

export const ORDER_WORK_VIEWS = ["all", "quote", "payment", "prep", "delivery"] as const

export type OrderWorkView = (typeof ORDER_WORK_VIEWS)[number]

export const ORDER_WORK_VIEW_META: Record<OrderWorkView, { label: string; description: string }> = {
  all: {
    label: "통합 뷰",
    description: "모든 주문과 모든 액션을 한 화면에서 관리",
  },
  quote: {
    label: "가격확정담당",
    description: "가격 미확정 주문의 상품 단가와 최종 금액 확정",
  },
  payment: {
    label: "입금확인담당",
    description: "입금 대기/신고/실패 주문의 입금 확인 처리",
  },
  prep: {
    label: "준비 담당 뷰",
    description: "포장/준비완료 전환 업무 중심",
  },
  delivery: {
    label: "배달 담당 뷰",
    description: "준비완료된 배달 주문 처리 업무 중심",
  },
}

const PRIMARY_STATUS_BY_VIEW: Record<OrderWorkView, OrderStatus[]> = {
  all: ["preparing", "ready_for_delivery", "delivering", "completed"],
  quote: [],
  payment: [],
  prep: ["preparing", "ready_for_delivery"],
  delivery: ["delivering", "completed"],
}

type RoleFilteredOrder = Pick<
  AdminOrder,
  "status" | "price_status" | "payment_status" | "payment_method" | "fulfillment_type" | "customer_price_confirmed_at"
>

export function parseOrderWorkView(rawValue: string | undefined): OrderWorkView {
  if (!rawValue) {
    return "all"
  }

  const normalized = rawValue.trim().toLowerCase()
  return ORDER_WORK_VIEWS.includes(normalized as OrderWorkView) ? (normalized as OrderWorkView) : "all"
}

export function canManageQuoteInView(view: OrderWorkView) {
  return view === "all" || view === "quote"
}

export function canManagePaymentInView(view: OrderWorkView) {
  return view === "all" || view === "payment"
}

export function canCancelOrderInView(view: OrderWorkView) {
  return view === "all" || view === "quote"
}

export function getPrimaryOrderStatusOptionsForView(view: OrderWorkView) {
  return PRIMARY_STATUS_BY_VIEW[view]
}

export function getAllowedOrderStatusForAction(view: OrderWorkView): OrderStatus[] {
  const fromPrimary = PRIMARY_STATUS_BY_VIEW[view]
  if (canCancelOrderInView(view)) {
    return [...fromPrimary, "canceled"]
  }
  return fromPrimary
}

export function getAllowedPaymentStatusForAction(view: OrderWorkView): PaymentStatus[] {
  if (canManagePaymentInView(view)) {
    return ["waiting_transfer", "confirmed", "rejected", "not_ready", "transfer_submitted", "waiting_card_payment"]
  }
  return []
}

export function isOrderVisibleInWorkView(order: RoleFilteredOrder, view: OrderWorkView) {
  if (view === "all") {
    return true
  }

  if (view === "quote") {
    return (
      order.status !== "completed" &&
      order.status !== "canceled" &&
      (
        order.price_status === "needs_review" ||
        (order.price_status === "quoted" &&
          (
            order.payment_status === "waiting_transfer" ||
            (order.payment_status === "waiting_card_payment" && order.customer_price_confirmed_at === null)
          ))
      )
    )
  }

  if (view === "payment") {
    return (
      order.status !== "completed" &&
      order.status !== "canceled" &&
      order.price_status === "quoted" &&
      (
        order.payment_method === "bank_transfer" &&
        (
          order.payment_status === "waiting_transfer" ||
          order.payment_status === "transfer_submitted" ||
          order.payment_status === "rejected"
        )
      )
    )
  }

  if (view === "prep") {
    return (
      order.status === "preparing" ||
      order.status === "ready_for_delivery" ||
      order.status === "payment_confirmed" ||
      (order.status === "pending" && order.payment_status === "confirmed") ||
      (
        order.status === "pending" &&
        order.payment_method === "card_on_delivery" &&
        order.payment_status === "waiting_card_payment" &&
        order.customer_price_confirmed_at !== null
      )
    )
  }

  if (order.fulfillment_type !== "delivery") {
    return false
  }

  return order.status === "ready_for_delivery" || order.status === "delivering" || order.status === "completed"
}
