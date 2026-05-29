import Link from "next/link"
import { redirect } from "next/navigation"

import { isAdminAuthenticated, sanitizeAdminNextPath } from "@/lib/mystoreqr/admin-auth"

import { loginAdminAction } from "../_actions/auth"

function firstString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

export default async function AdminLoginPage(props: PageProps<"/admin/login">) {
  const searchParams = await props.searchParams
  const nextPath = sanitizeAdminNextPath(firstString(searchParams.next))
  const errorMessage = firstString(searchParams.error)
  const ok = firstString(searchParams.ok)

  const isAuthenticated = await isAdminAuthenticated()
  if (isAuthenticated) {
    redirect(nextPath)
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-10">
      <section className="mq-card p-6">
        <p className="text-sm font-semibold text-brand-strong">MyStoreQR Admin</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">관리자 로그인</h1>
        <p className="mt-2 text-sm text-zinc-600">사장님 PIN으로 관리자 화면에 접속합니다.</p>

        {errorMessage ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
        ) : null}
        {ok ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">로그아웃되었습니다.</p>
        ) : null}

        <form action={loginAdminAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="next" value={nextPath} />
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">관리자 PIN</span>
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              className="mq-input"
              placeholder="예: 1234"
              autoComplete="off"
              required
            />
          </label>

          <button type="submit" className="mq-btn-primary h-11 w-full">
            로그인
          </button>
        </form>

        <div className="mt-4">
          <Link href="/" className="text-sm text-brand-strong underline">
            홈으로 돌아가기
          </Link>
        </div>
      </section>
    </main>
  )
}
