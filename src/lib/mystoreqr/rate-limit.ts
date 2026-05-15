const hitStore = new Map<string, number[]>()

type RateLimitResult = {
  allowed: boolean
  retryAfterSeconds: number
}

export function checkRateLimit(
  key: string,
  options: { max: number; windowMs: number }
): RateLimitResult {
  const now = Date.now()
  const windowStart = now - options.windowMs
  const currentHits = hitStore.get(key) ?? []
  const activeHits = currentHits.filter((timestamp) => timestamp > windowStart)

  if (activeHits.length >= options.max) {
    const oldest = activeHits[0] ?? now
    const retryAfterMs = Math.max(options.windowMs - (now - oldest), 1000)
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    }
  }

  activeHits.push(now)
  hitStore.set(key, activeHits)

  if (hitStore.size > 5000) {
    // Keep memory bounded in long-running processes.
    for (const [storedKey, timestamps] of hitStore.entries()) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] < windowStart) {
        hitStore.delete(storedKey)
      }
    }
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
  }
}

export function getRequestIp(headers: Headers) {
  const fromForwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const fromRealIp = headers.get("x-real-ip")?.trim()
  const fromCf = headers.get("cf-connecting-ip")?.trim()

  return fromForwarded || fromRealIp || fromCf || "unknown"
}
