import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "진로마트 QR 주문",
  description: "진로마트 QR 주문 안내",
}

const orderPageUrl = "https://mystoreqr.vercel.app/s/jinro"
const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(orderPageUrl)}`

export default function JinroQrPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-10 text-center">
      <section className="flex w-full max-w-xl flex-col items-center gap-8">
        <div>
          <p className="text-lg font-semibold text-brand-strong">진로마트 모란점</p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-zinc-950 md:text-5xl">
            이제는 QR코드로
            <br />
            편리하게 주문하세요
          </h1>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrImageUrl} alt="진로마트 주문 페이지 QR 코드" className="h-72 w-72 md:h-96 md:w-96" />
        </div>

        <p className="break-all text-sm font-medium text-zinc-500">{orderPageUrl}</p>
      </section>
    </main>
  )
}
