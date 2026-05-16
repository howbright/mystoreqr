import type { AdminOrder } from "@/lib/mystoreqr/admin-queries"
import type { Database } from "@/types/database.type"

type OrderStatus = Database["public"]["Enums"]["order_status"]
type PaymentStatus = Database["public"]["Enums"]["payment_status"]

export const ORDER_WORK_VIEWS = ["all", "owner", "prep", "delivery"] as const

export type OrderWorkView = (typeof ORDER_WORK_VIEWS)[number]

export const ORDER_WORK_VIEW_META: Record<OrderWorkView, { label: string; description: string }> = {
  all: {
    label: "통합 뷰",
    description: "모든 주문과 모든 액션을 한 화면에서 관리",
  },
  owner: {
    label: "사장님 뷰",
    description: "가격 확정/입금 확인 같은 정산 업무 중심",
  },
  prep: {
    label: "준비 담당 뷰",
    description: "포장/준비중 전환 업무 중심",
  },
  delivery: {
    label: "배달 담당 뷰",
    description: "배달중/배달완료 처리 업무 중심",
  },
}

const PRIMARY_STATUS_BY_VIEW: Record<OrderWorkView, OrderStatus[]> = {
  all: ["preparing", "delivering", "completed"],
  owner: [],
  prep: ["preparing"],
  delivery: ["delivering", "completed"],
}

type RoleFilteredOrder = Pick<AdminOrder, "status" | "price_status" | "payment_status" | "fulfillment_type">

export function parseOrderWorkView(rawValue: string | undefined): OrderWorkView {
  if (!rawValue) {
    return "all"
  }

  const normalized = rawValue.trim().toLowerCase()
  return ORDER_WORK_VIEWS.includes(normalized as OrderWorkView) ? (normalized as OrderWorkView) : "all"
}

export function canManageQuoteInView(view: OrderWorkView) {
  return view === "all" || view === "owner"
}

export function canManagePaymentInView(view: OrderWorkView) {
  return view === "all" || view === "owner"
}

export function canCancelOrderInView(view: OrderWorkView) {
  return view === "all" || view === "owner"
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
    return ["waiting_transfer", "confirmed", "rejected", "not_ready", "transfer_submitted"]
  }
  return []
}

export function isOrderVisibleInWorkView(order: RoleFilteredOrder, view: OrderWorkView) {
  if (view === "all") {
    return true
  }

  if (view === "owner") {
    return (
      order.status === "pending" ||
      order.price_status === "needs_review" ||
      order.payment_status === "waiting_transfer" ||
      order.payment_status === "transfer_submitted" ||
      order.payment_status === "rejected"
    )
  }

  if (view === "prep") {
    return (
      order.status === "preparing" ||
      order.status === "payment_confirmed" ||
      (order.status === "pending" && order.payment_status === "confirmed")
    )
  }

  if (order.fulfillment_type !== "delivery") {
    return false
  }

  return order.status === "preparing" || order.status === "delivering" || order.status === "completed"
}
