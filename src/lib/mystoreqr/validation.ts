import { normalizePhone } from "./format"

export type PublicOrderInput = {
  customerName: string
  customerPhone: string
  fulfillmentType: "delivery" | "pickup"
  deliveryAddress?: string
  deliveryAddressDetail?: string
  customerNote?: string
}

export function validatePublicOrderInput(input: PublicOrderInput) {
  const customerName = input.customerName.trim()
  const customerPhone = normalizePhone(input.customerPhone)

  if (customerName.length < 2) {
    throw new Error("고객 이름을 2자 이상 입력해 주세요.")
  }

  if (customerPhone.length < 10) {
    throw new Error("연락처를 올바르게 입력해 주세요.")
  }

  if (input.fulfillmentType === "delivery") {
    const address = (input.deliveryAddress ?? "").trim()

    if (address.length < 4) {
      throw new Error("배달 주소를 입력해 주세요.")
    }
  }

  return {
    customerName,
    customerPhone,
    fulfillmentType: input.fulfillmentType,
    deliveryAddress: input.deliveryAddress?.trim() || null,
    deliveryAddressDetail: input.deliveryAddressDetail?.trim() || null,
    customerNote: input.customerNote?.trim() || null,
  }
}

export function parsePositiveQuantity(value: unknown) {
  const quantity = Number(value)

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("수량은 1 이상 정수여야 합니다.")
  }

  return quantity
}
