import { getOrderTrackingByToken, getPublicStoreBySlug } from "@/lib/mystoreqr/public-queries"

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
  const initialPhone = firstString(searchParams.phone) ?? ""
  const initialStoreSlug = firstString(searchParams.store)?.trim().toLowerCase() ?? ""
  const initialOrder =
    initialLookupToken && initialPhone
      ? await getOrderTrackingByToken(initialLookupToken, initialPhone)
      : null

  const storeBundle = initialStoreSlug ? await getPublicStoreBySlug(initialStoreSlug) : null

  const bankInfo = storeBundle
    ? {
        name: storeBundle.store.name,
        bankName: storeBundle.store.bank_name,
        bankAccountNumber: storeBundle.store.bank_account_number,
        bankAccountHolder: storeBundle.store.bank_account_holder,
      }
    : null

  return (
    <TrackClient
      initialLookupToken={initialLookupToken}
      initialPhone={initialPhone}
      initialStoreSlug={initialStoreSlug}
      initialOrder={initialOrder}
      initialBankInfo={bankInfo}
    />
  )
}
