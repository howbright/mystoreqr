import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "진로마트 QR 주문 안내지",
  description: "진로마트 QR 주문 소개 출력물",
}

const orderPageUrl = "https://mystoreqr.vercel.app/s/jinro"
const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=520x520&data=${encodeURIComponent(orderPageUrl)}`

const orderSteps = [
  "고객 주문 접수",
  "마트에서 최종 금액 확정",
  "고객이 금액 확인 후 사장님 계좌로 계좌이체",
  "입금 확인 후 상품 준비/배송",
  "배송 완료",
]

const ownerPoints = [
  {
    title: "건별 수수료를 떼지 않습니다",
    body: "고객은 모바일에서 상품을 선택해 주문하고, 사장님 계좌로 직접 입금합니다.",
  },
  {
    title: "상품 가격이 매번 정확하지 않아도 됩니다",
    body: "고객 주문 접수 후 마트에서 최종 금액을 확정할 수 있습니다. 시세 상품이나 할인 적용도 그때 반영할 수 있습니다.",
  },
  {
    title: "처음 상품목록 등록을 도와드립니다",
    body: "엑셀 파일을 주시면 초기 상품 등록을 도와드립니다. 이후에는 관리자 화면에서 가격, 품절, 할인상품, 사진을 쉽게 수정할 수 있습니다.",
  },
]

export default function JinroFlyerPage() {
  return (
    <main className="bg-zinc-100 text-zinc-950 print:bg-white">
      <section className="mx-auto flex min-h-screen w-full max-w-[210mm] flex-col items-center justify-center bg-white px-10 py-12 text-center print:h-screen print:max-w-none print:px-10 print:py-8">
        <p className="text-xl font-black text-brand-strong">우리동네 진로마트</p>
        <h1 className="mt-5 text-5xl font-black leading-tight tracking-normal md:text-6xl">
          이제는 QR코드로
          <br />
          편리하게 주문하세요
        </h1>
        <p className="mt-6 text-2xl font-bold leading-relaxed text-zinc-800">
          대형마트는 새벽배송,
          <br />
          진로마트는 동네 즉시배송
        </p>

        <div className="mt-10 rounded-[28px] border-4 border-zinc-950 bg-white p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrImageUrl} alt="진로마트 주문 페이지 QR 코드" className="h-80 w-80 md:h-96 md:w-96" />
        </div>

        <p className="mt-7 text-2xl font-black text-zinc-950">휴대폰 카메라로 QR을 찍어 주문하세요</p>
      </section>

      <section className="mx-auto mt-8 flex min-h-screen w-full max-w-[210mm] flex-col bg-white px-10 py-12 print:mt-0 print:h-screen print:max-w-none print:break-before-page print:px-10 print:py-8">
        <div>
          <p className="text-lg font-black text-brand-strong">사장님께 소개드립니다</p>
          <h2 className="mt-3 text-4xl font-black leading-tight text-zinc-950">
            진로마트용 QR 주문 페이지를
            <br />
            만들어봤습니다
          </h2>
          <p className="mt-5 text-xl font-bold leading-relaxed text-zinc-700">
            고객은 QR로 주문하고,
            <br />
            최종 금액은 사장님이 확정하고,
            <br />
            입금은 사장님 계좌로 바로 받습니다.
          </p>
        </div>

        <div className="mt-8">
          <h3 className="text-xl font-black text-zinc-950">주문 흐름</h3>
          <ol className="mt-4 grid gap-3">
            {orderSteps.map((step, index) => (
              <li key={step} className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-black text-white">
                  {index + 1}
                </span>
                <span className="text-lg font-bold text-zinc-800">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-8">
          <h3 className="text-xl font-black text-zinc-950">특징</h3>
          <div className="mt-4 grid gap-4">
            {ownerPoints.map((point) => (
              <article key={point.title} className="rounded-xl bg-zinc-50 px-4 py-3">
                <p className="text-lg font-black text-zinc-950">{point.title}</p>
                <p className="mt-1 text-sm font-medium leading-relaxed text-zinc-600">{point.body}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-5 rounded-2xl border-2 border-zinc-950 p-4">
          <div>
            <p className="text-lg font-black text-zinc-950">오른쪽 QR로 바로 고객 입장에서 체험해보실 수 있습니다</p>
            <p className="mt-3 text-base font-black text-brand-strong">
              관심 있으시면 전화주세요. 이나현 010-6380-8672
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrImageUrl} alt="진로마트 주문 페이지 QR 코드" className="h-28 w-28" />
          </div>
        </div>
      </section>
    </main>
  )
}
