import { createHmac, timingSafeEqual } from "node:crypto"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const ADMIN_SESSION_COOKIE = "mq_admin_session"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14

type SessionPayload = {
  exp: number
}

function getAdminPin() {
  const pin = process.env.MYSTOREQR_ADMIN_PIN ?? process.env.ADMIN_PIN
  if (!pin) {
    throw new Error("Missing MYSTOREQR_ADMIN_PIN (or ADMIN_PIN)")
  }

  return pin.trim()
}

function getAdminAuthSecret() {
  const secret = process.env.MYSTOREQR_ADMIN_AUTH_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error("Missing MYSTOREQR_ADMIN_AUTH_SECRET (or SUPABASE_SERVICE_ROLE_KEY)")
  }

  return secret
}

function sign(input: string) {
  return createHmac("sha256", getAdminAuthSecret()).update(input).digest("base64url")
}

function encodePayload(payload: SessionPayload) {
  const json = JSON.stringify(payload)
  return Buffer.from(json, "utf8").toString("base64url")
}

function decodePayload(encoded: string): SessionPayload | null {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8")
    const parsed = JSON.parse(json) as SessionPayload
    if (typeof parsed.exp !== "number") {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)

  if (aBuf.length !== bBuf.length) {
    return false
  }

  return timingSafeEqual(aBuf, bBuf)
}

export function sanitizeAdminNextPath(nextPath: string | null | undefined) {
  const normalized = (nextPath ?? "").trim()
  if (!normalized.startsWith("/admin")) {
    return "/admin/dashboard"
  }

  return normalized
}

async function setAdminSessionCookie() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  const encoded = encodePayload({ exp: expiresAt })
  const signature = sign(encoded)
  const token = `${encoded}.${signature}`

  const cookieStore = await cookies()
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export async function clearAdminSession() {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_SESSION_COOKIE)
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value
  if (!token) {
    return false
  }

  const [encoded, providedSignature] = token.split(".")
  if (!encoded || !providedSignature) {
    return false
  }

  const expectedSignature = sign(encoded)
  if (!safeEqual(providedSignature, expectedSignature)) {
    return false
  }

  const payload = decodePayload(encoded)
  if (!payload) {
    return false
  }

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp < now) {
    return false
  }

  return true
}

export async function requireAdminSessionOrRedirect(nextPath: string) {
  const isAuthenticated = await isAdminAuthenticated()
  if (isAuthenticated) {
    return
  }

  const safeNextPath = sanitizeAdminNextPath(nextPath)
  redirect(`/admin/login?next=${encodeURIComponent(safeNextPath)}`)
}

export async function loginWithPin(pin: string) {
  const normalizedInput = pin.trim()
  const expectedPin = getAdminPin()

  if (!safeEqual(normalizedInput, expectedPin)) {
    return false
  }

  await setAdminSessionCookie()
  return true
}
