"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireAdminSessionOrRedirect } from "@/lib/mystoreqr/admin-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import type { TablesInsert, TablesUpdate } from "@/types/database.type"

type CsvProductRow = {
  id: string | null
  name: string
  category: string
  price: number | null
  originalPrice: number | null
  unit: string | null
  description: string | null
  isDiscounted: boolean
  isSoldOut: boolean
  isActive: boolean
  displayOrder: number
}

const PRODUCT_IMAGE_BUCKET = "product-images"
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function getImageExtension(file: File) {
  if (file.type === "image/jpeg") {
    return "jpg"
  }

  if (file.type === "image/png") {
    return "png"
  }

  if (file.type === "image/webp") {
    return "webp"
  }

  return null
}

function toSafeString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : ""
}

function parseNonNegativeIntOrNull(value: string) {
  if (!value.trim()) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

function parseBooleanText(input: string, defaultValue: boolean) {
  const normalized = input.trim().toLowerCase()
  if (!normalized) {
    return defaultValue
  }

  return ["1", "y", "yes", "true", "on"].includes(normalized)
}

function buildRedirectPath(storeSlug: string, type: "ok" | "error", message: string) {
  const params = new URLSearchParams()
  if (storeSlug) {
    params.set("store", storeSlug)
  }
  params.set(type, message)
  return `/admin/products?${params.toString()}`
}

function redirectWithError(storeSlug: string, message: string): never {
  redirect(buildRedirectPath(storeSlug, "error", message))
}

function redirectWithSuccess(storeSlug: string, message: string): never {
  redirect(buildRedirectPath(storeSlug, "ok", message))
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"' && nextChar === '"') {
      current += '"'
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

function parseProductsCsv(csvText: string): CsvProductRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) {
    throw new Error("CSV는 헤더 + 최소 1개 행이 필요합니다.")
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase())
  const getIndex = (name: string) => headers.indexOf(name)

  const nameIndex = getIndex("name")
  const idIndex = getIndex("id")
  const categoryIndex = getIndex("category")
  const priceIndex = getIndex("price")
  const originalPriceIndex = getIndex("original_price")
  const unitIndex = getIndex("unit")
  const descriptionIndex = getIndex("description")
  const discountedIndex = getIndex("is_discounted")
  const soldOutIndex = getIndex("is_sold_out")
  const activeIndex = getIndex("is_active")
  const displayOrderIndex = getIndex("display_order")

  if (nameIndex < 0) {
    throw new Error("CSV 헤더에 name 컬럼이 필요합니다.")
  }

  const rows: CsvProductRow[] = []
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line)
    const name = (cols[nameIndex] ?? "").trim()
    if (!name) {
      continue
    }

    const idRaw = idIndex >= 0 ? (cols[idIndex] ?? "").trim() : ""
    const id = idRaw ? idRaw : null
    if (id && !isUuidLike(id)) {
      throw new Error(`상품 "${name}"의 id 값이 올바른 UUID 형식이 아닙니다.`)
    }

    const category = (categoryIndex >= 0 ? cols[categoryIndex] : "기타")?.trim() || "기타"
    const priceRaw = priceIndex >= 0 ? (cols[priceIndex] ?? "").trim() : ""
    const price = parseNonNegativeIntOrNull(priceRaw)
    if (priceRaw && price == null) {
      throw new Error(`상품 "${name}"의 price 값이 올바르지 않습니다.`)
    }

    const originalPriceRaw = originalPriceIndex >= 0 ? (cols[originalPriceIndex] ?? "").trim() : ""
    const originalPrice = parseNonNegativeIntOrNull(originalPriceRaw)
    if (originalPriceRaw && originalPrice == null) {
      throw new Error(`상품 "${name}"의 original_price 값이 올바르지 않습니다.`)
    }

    const displayOrderRaw = displayOrderIndex >= 0 ? (cols[displayOrderIndex] ?? "").trim() : ""
    const displayOrder = parseNonNegativeIntOrNull(displayOrderRaw) ?? 0

    rows.push({
      id,
      name,
      category,
      price,
      originalPrice,
      unit: (unitIndex >= 0 ? cols[unitIndex] : "")?.trim() || null,
      description: (descriptionIndex >= 0 ? cols[descriptionIndex] : "")?.trim() || null,
      isDiscounted: parseBooleanText(discountedIndex >= 0 ? cols[discountedIndex] ?? "" : "", false),
      isSoldOut: parseBooleanText(soldOutIndex >= 0 ? cols[soldOutIndex] ?? "" : "", false),
      isActive: parseBooleanText(activeIndex >= 0 ? cols[activeIndex] ?? "" : "", true),
      displayOrder,
    })
  }

  return rows
}

async function getStoreIdBySlugOrRedirect(storeSlug: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("stores")
    .select("id")
    .eq("slug", storeSlug)
    .maybeSingle()

  if (error) {
    redirectWithError(storeSlug, `매장 조회 실패: ${error.message}`)
  }

  if (!data) {
    redirectWithError(storeSlug, "매장을 찾을 수 없습니다.")
  }

  return data.id
}

async function ensureProductImageBucket() {
  const supabase = createAdminClient()
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()

  if (listError) {
    throw new Error(`이미지 저장소 조회 실패: ${listError.message}`)
  }

  if (buckets?.some((bucket) => bucket.name === PRODUCT_IMAGE_BUCKET)) {
    return
  }

  const { error: createError } = await supabase.storage.createBucket(PRODUCT_IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: MAX_PRODUCT_IMAGE_BYTES,
    allowedMimeTypes: Array.from(ALLOWED_PRODUCT_IMAGE_TYPES),
  })

  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw new Error(`이미지 저장소 생성 실패: ${createError.message}`)
  }
}

async function uploadProductImageOrRedirect(storeSlug: string, productId: string, file: File) {
  if (file.size === 0) {
    return null
  }

  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    redirectWithError(storeSlug, "상품 이미지는 5MB 이하로 업로드해 주세요.")
  }

  const extension = getImageExtension(file)
  if (!extension) {
    redirectWithError(storeSlug, "상품 이미지는 JPG, PNG, WebP 형식만 업로드할 수 있습니다.")
  }

  try {
    await ensureProductImageBucket()
  } catch (error) {
    redirectWithError(storeSlug, error instanceof Error ? error.message : "이미지 저장소 준비 실패")
  }

  const supabase = createAdminClient()
  const path = `${storeSlug}/${productId}-${Date.now()}.${extension}`
  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    redirectWithError(storeSlug, `상품 이미지 업로드 실패: ${uploadError.message}`)
  }

  const { data } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function importProductsCsvAction(formData: FormData) {
  const storeSlug = toSafeString(formData.get("storeSlug"))
  await requireAdminSessionOrRedirect(`/admin/products?store=${encodeURIComponent(storeSlug)}`)

  const storeId = await getStoreIdBySlugOrRedirect(storeSlug)
  const csvTextInput = toSafeString(formData.get("csvText"))
  const csvFile = formData.get("csvFile")
  const csvFileText =
    csvFile instanceof File && csvFile.size > 0 ? await csvFile.text() : ""

  const csvText = csvFileText || csvTextInput
  if (!csvText) {
    redirectWithError(storeSlug, "CSV 파일 또는 CSV 텍스트를 입력해 주세요.")
  }

  let rows: CsvProductRow[]
  try {
    rows = parseProductsCsv(csvText)
  } catch (error) {
    redirectWithError(storeSlug, error instanceof Error ? error.message : "CSV 파싱 실패")
  }

  if (rows.length === 0) {
    redirectWithError(storeSlug, "처리할 CSV 데이터가 없습니다.")
  }

  const supabase = createAdminClient()
  const [{ data: categories, error: categoriesError }, { data: products, error: productsError }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, name")
        .eq("store_id", storeId),
      supabase
        .from("products")
        .select("id, name")
        .eq("store_id", storeId),
    ])

  if (categoriesError) {
    redirectWithError(storeSlug, `카테고리 조회 실패: ${categoriesError.message}`)
  }

  if (productsError) {
    redirectWithError(storeSlug, `기존 상품 조회 실패: ${productsError.message}`)
  }

  const categoryMap = new Map((categories ?? []).map((category) => [category.name.trim(), category.id]))
  const productMap = new Map((products ?? []).map((product) => [product.name.trim(), product.id]))
  const productIdMap = new Map((products ?? []).map((product) => [product.id, product.id]))

  let createdCount = 0
  let updatedCount = 0

  for (const row of rows) {
    let categoryId = categoryMap.get(row.category)
    if (!categoryId) {
      const categoryInsert: TablesInsert<"categories"> = {
        store_id: storeId,
        name: row.category,
        is_active: true,
      }

      const { data: insertedCategory, error: insertCategoryError } = await supabase
        .from("categories")
        .insert(categoryInsert)
        .select("id, name")
        .single()

      if (insertCategoryError || !insertedCategory) {
        redirectWithError(storeSlug, `카테고리 생성 실패(${row.category}): ${insertCategoryError?.message ?? "unknown error"}`)
      }

      categoryId = insertedCategory.id
      categoryMap.set(insertedCategory.name.trim(), insertedCategory.id)
    }

    const existingProductId = (row.id ? productIdMap.get(row.id) : null) ?? productMap.get(row.name)
    const payload: TablesUpdate<"products"> = {
      category_id: categoryId,
      name: row.name,
      price: row.price,
      original_price: row.originalPrice,
      unit: row.unit,
      description: row.description,
      is_discounted: row.isDiscounted,
      is_sold_out: row.isSoldOut,
      is_active: row.isActive,
      display_order: row.displayOrder,
    }

    if (existingProductId) {
      const { error: updateError } = await supabase
        .from("products")
        .update(payload)
        .eq("id", existingProductId)
      if (updateError) {
        redirectWithError(storeSlug, `상품 업데이트 실패(${row.name}): ${updateError.message}`)
      }

      updatedCount += 1
      continue
    }

    const insertPayload: TablesInsert<"products"> = {
      store_id: storeId,
      category_id: categoryId,
      name: row.name,
      price: row.price,
      original_price: row.originalPrice,
      unit: row.unit,
      description: row.description,
      is_discounted: row.isDiscounted,
      is_sold_out: row.isSoldOut,
      is_active: row.isActive,
      display_order: row.displayOrder,
    }

    const { data: insertedProduct, error: insertError } = await supabase
      .from("products")
      .insert(insertPayload)
      .select("id, name")
      .single()
    if (insertError || !insertedProduct) {
      redirectWithError(storeSlug, `상품 생성 실패(${row.name}): ${insertError?.message ?? "unknown error"}`)
    }

    productMap.set(insertedProduct.name.trim(), insertedProduct.id)
    createdCount += 1
  }

  revalidatePath("/admin/products")
  redirectWithSuccess(storeSlug, `CSV 반영 완료: 신규 ${createdCount}건, 수정 ${updatedCount}건`)
}

export async function updateProductQuickAction(formData: FormData) {
  const storeSlug = toSafeString(formData.get("storeSlug"))
  await requireAdminSessionOrRedirect(`/admin/products?store=${encodeURIComponent(storeSlug)}`)

  const productId = toSafeString(formData.get("productId"))
  const name = toSafeString(formData.get("name"))
  const unit = toSafeString(formData.get("unit"))
  const description = toSafeString(formData.get("description"))
  const priceRaw = toSafeString(formData.get("price"))
  const price = parseNonNegativeIntOrNull(priceRaw)
  const originalPriceRaw = toSafeString(formData.get("originalPrice"))
  const originalPrice = parseNonNegativeIntOrNull(originalPriceRaw)
  const imageFile = formData.get("imageFile")

  if (priceRaw && price == null) {
    redirectWithError(storeSlug, "가격은 빈값 또는 0 이상의 정수로 입력해 주세요.")
  }

  if (originalPriceRaw && originalPrice == null) {
    redirectWithError(storeSlug, "원래 가격은 빈값 또는 0 이상의 정수로 입력해 주세요.")
  }

  if (!productId) {
    redirectWithError(storeSlug, "상품 ID가 누락되었습니다.")
  }

  const storeId = await getStoreIdBySlugOrRedirect(storeSlug)
  const supabase = createAdminClient()
  const { data: existingProduct, error: existingProductError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("store_id", storeId)
    .maybeSingle()

  if (existingProductError) {
    redirectWithError(storeSlug, `상품 조회 실패: ${existingProductError.message}`)
  }

  if (!existingProduct) {
    redirectWithError(storeSlug, "상품을 찾을 수 없습니다.")
  }

  const imageUrl =
    imageFile instanceof File && imageFile.size > 0
      ? await uploadProductImageOrRedirect(storeSlug, productId, imageFile)
      : null

  const isSoldOut = formData.has("isSoldOut")
  const isActive = formData.has("isActive")
  const isDiscounted = formData.has("isDiscounted")

  const updatePayload: TablesUpdate<"products"> = {
    name,
    price,
    original_price: originalPrice,
    unit: unit || null,
    description: description || null,
    is_discounted: isDiscounted,
    is_sold_out: isSoldOut,
    is_active: isActive,
  }

  if (imageUrl) {
    updatePayload.image_url = imageUrl
  }

  const { error } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", productId)
  if (error) {
    redirectWithError(storeSlug, `상품 수정 실패: ${error.message}`)
  }

  revalidatePath("/admin/products")
  redirectWithSuccess(storeSlug, "상품 정보를 저장했습니다.")
}

export async function updateProductsActiveBulkAction(formData: FormData) {
  const storeSlug = toSafeString(formData.get("storeSlug"))
  await requireAdminSessionOrRedirect(`/admin/products?store=${encodeURIComponent(storeSlug)}`)

  const storeId = await getStoreIdBySlugOrRedirect(storeSlug)
  const allProductIds = formData
    .getAll("allProductIds")
    .map((value) => toSafeString(value))
    .filter(Boolean)
  const activeProductIdSet = new Set(
    formData
      .getAll("activeProductIds")
      .map((value) => toSafeString(value))
      .filter(Boolean)
  )

  if (allProductIds.length === 0) {
    redirectWithError(storeSlug, "처리할 상품이 없습니다.")
  }

  const nextActiveIds = allProductIds.filter((id) => activeProductIdSet.has(id))
  const nextInactiveIds = allProductIds.filter((id) => !activeProductIdSet.has(id))

  const supabase = createAdminClient()

  if (nextActiveIds.length > 0) {
    const { error: activateError } = await supabase
      .from("products")
      .update({ is_active: true })
      .eq("store_id", storeId)
      .in("id", nextActiveIds)

    if (activateError) {
      redirectWithError(storeSlug, `활성 상품 저장 실패: ${activateError.message}`)
    }
  }

  if (nextInactiveIds.length > 0) {
    const { error: deactivateError } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("store_id", storeId)
      .in("id", nextInactiveIds)

    if (deactivateError) {
      redirectWithError(storeSlug, `비활성 상품 저장 실패: ${deactivateError.message}`)
    }
  }

  revalidatePath("/admin/products")
  redirectWithSuccess(
    storeSlug,
    `사용여부 저장 완료: 사용 ${nextActiveIds.length}개 / 사용안함 ${nextInactiveIds.length}개`
  )
}
