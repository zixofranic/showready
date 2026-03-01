/** Simple in-memory rate limiter for public endpoints */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);

/**
 * Check rate limit for a given key.
 * @returns null if allowed, or { retryAfter } if blocked
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { retryAfter: number } | null {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (entry.count >= maxRequests) {
    return { retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return null;
}

/** Get client IP from request headers */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
