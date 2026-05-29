"use client"

import { useEffect, useState } from "react"

type ProductImageFieldProps = {
  productName: string
  imageUrl: string | null
}

export function ProductImageField({ productName, imageUrl }: ProductImageFieldProps) {
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const previewUrl = localPreviewUrl ?? imageUrl

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl)
      }
    }
  }, [localPreviewUrl])

  return (
    <>
      <div className="grid gap-1 text-xs text-zinc-600">
        <span>사진</span>
        <div className="h-24 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
          {previewUrl ? (
            <div
              className="h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${previewUrl})` }}
              role="img"
              aria-label={`${productName} 상품 사진`}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-400">
              사진 없음
            </div>
          )}
        </div>
      </div>

      <label className="grid gap-1 text-xs text-zinc-600">
        사진 업로드
        <input
          type="file"
          name="imageFile"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) {
              setLocalPreviewUrl(null)
              return
            }

            const nextPreviewUrl = URL.createObjectURL(file)
            setLocalPreviewUrl((currentPreviewUrl) => {
              if (currentPreviewUrl?.startsWith("blob:")) {
                URL.revokeObjectURL(currentPreviewUrl)
              }
              return nextPreviewUrl
            })
          }}
          className="w-full max-w-28 text-[0px] file:mr-0 file:h-8 file:w-full file:cursor-pointer file:rounded-md file:border file:border-brand-border file:bg-brand-soft file:px-2 file:text-xs file:font-semibold file:text-brand-strong hover:file:bg-brand-border"
        />
      </label>
    </>
  )
}
