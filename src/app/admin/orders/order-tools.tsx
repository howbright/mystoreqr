"use client"

import { useState } from "react"

type OrderToolsProps = {
  orderCode: string
  summaryText: string
}

export function OrderTools({ orderCode, summaryText }: OrderToolsProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summaryText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  function handlePrint() {
    const printWindow = window.open("", "_blank", "width=560,height=720")
    if (!printWindow) {
      return
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>주문서 ${orderCode}</title>
          <style>
            body { font-family: sans-serif; padding: 24px; line-height: 1.5; }
            h1 { font-size: 18px; margin: 0 0 8px; }
            pre { white-space: pre-wrap; font-size: 13px; }
          </style>
        </head>
        <body>
          <h1>주문서 ${orderCode}</h1>
          <pre>${summaryText.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</pre>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-lg bg-brand-soft px-2 py-1 text-xs font-medium text-brand-strong hover:bg-brand-border"
      >
        {copied ? "복사됨" : "주문문구 복사"}
      </button>
      <button
        type="button"
        onClick={handlePrint}
        className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
      >
        출력
      </button>
    </div>
  )
}
