import {
  getOrderTrackingByOrderCode,
  getOrderTrackingByToken,
  getOrderTrackingItemsByOrderCode,
  getOrderTrackingItemsByToken,
  getOrderTrackingStoreInfoByOrderCode,
  getOrderTrackingStoreInfoByToken,
  getPublicStoreBySlug,
} from "@/lib/mystoreqr/public-queries"

import { TrackClient } from "./track-client"

function firstString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

export default async function TrackPage(props: PageProps<"/track">) {
  const searchParams = await props.searchParams
  const initialLookupToken = firstString(searchParams.token) ?? ""
  const initialOrderCode = firstString(searchParams.order) ?? ""
  const initialPhone = firstString(searchParams.phone) ?? ""
  const initialStoreSlug = firstString(searchParams.store)?.trim().toLowerCase() ?? ""
  const initialOrder =
    initialLookupToken
      ? await getOrderTrackingByToken(initialLookupToken, initialPhone)
      : initialOrderCode && initialPhone
        ? await getOrderTrackingByOrderCode(initialOrderCode, initialPhone, initialStoreSlug)
      : null
  const initialItems =
    initialLookupToken
      ? await getOrderTrackingItemsByToken(initialLookupToken, initialPhone)
      : initialOrderCode && initialPhone
        ? await getOrderTrackingItemsByOrderCode(initialOrderCode, initialPhone, initialStoreSlug)
      : []

  const storeBundle = initialStoreSlug ? await getPublicStoreBySlug(initialStoreSlug) : null
  const fallbackBankInfo =
    !storeBundle && initialLookupToken
      ? await getOrderTrackingStoreInfoByToken(initialLookupToken, initialPhone)
      : !storeBundle && initialOrderCode && initialPhone
        ? await getOrderTrackingStoreInfoByOrderCode(initialOrderCode, initialPhone, initialStoreSlug)
        : null

  const bankInfo = storeBundle
    ? {
        name: storeBundle.store.name,
        roadAddress: storeBundle.store.address_road,
        jibunAddress: storeBundle.store.address_detail,
        bankName: storeBundle.store.bank_name,
        bankAccountNumber: storeBundle.store.bank_account_number,
        bankAccountHolder: storeBundle.store.bank_account_holder,
      }
    : fallbackBankInfo

  return (
    <TrackClient
      initialLookupToken={initialLookupToken}
      initialOrderCode={initialOrderCode}
      initialPhone={initialPhone}
      initialStoreSlug={initialStoreSlug}
      initialOrder={initialOrder}
      initialItems={initialItems}
      initialBankInfo={bankInfo}
    />
  )
}
