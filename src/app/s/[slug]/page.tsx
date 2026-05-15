import { notFound } from "next/navigation"

import { getPublicStoreBySlug } from "@/lib/mystoreqr/public-queries"

import { Storefront } from "./storefront"

export default async function StorePage(props: PageProps<"/s/[slug]">) {
  const { slug } = await props.params
  const storeBundle = await getPublicStoreBySlug(slug)

  if (!storeBundle) {
    notFound()
  }

  return <Storefront storeBundle={storeBundle} />
}
