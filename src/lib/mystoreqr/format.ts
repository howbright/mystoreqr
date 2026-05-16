const krwFormatter = new Intl.NumberFormat("ko-KR")

export function formatKrw(amount: number | null | undefined) {
  if (amount == null) {
    return "가격 협의"
  }

  return `${krwFormatter.format(amount)}원`
}

export function normalizePhone(input: string) {
  return input.replace(/[^0-9]/g, "")
}

export function formatCustomerOrderCode(orderCode: string | null | undefined) {
  if (!orderCode) {
    return ""
  }

  const match = orderCode.match(/^\d{8}-(\d+)$/)
  if (!match) {
    return orderCode
  }

  return match[1].padStart(4, "0")
}

export function normalizeCustomerOrderCode(input: string) {
  const value = input.trim().toUpperCase()
  if (/^\d{1,4}$/.test(value)) {
    return value.padStart(4, "0")
  }

  return value
}

export function formatPhone(phone: string | null | undefined) {
  if (!phone) {
    return ""
  }

  const digits = normalizePhone(phone)

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  return phone
}
