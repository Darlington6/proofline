import { NextResponse } from "next/server";

/**
 * Sliding-window rate limiter kept in server memory.
 *
 * On Vercel each running instance has its own memory, so this bounds bursts
 * per instance rather than enforcing an exact global limit. That is enough to
 * stop one client from draining the RPC quota or the AI budget; a Vercel
 * Firewall rule can add a global limit on top.
 */
export type RateLimiter = {
  /** Record one hit for `key`. Returns seconds to wait, or 0 if allowed. */
  take(key: string, now?: number): number;
};

const MAX_TRACKED_KEYS = 5_000;

export function createRateLimiter({
  limit,
  windowMs,
}: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    take(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      }
      recent.push(now);
      // Re-insert so the Map's order tracks the most recently active keys.
      hits.delete(key);
      hits.set(key, recent);
      if (hits.size > MAX_TRACKED_KEYS) {
        hits.delete(hits.keys().next().value!);
      }
      return 0;
    },
  };
}

/** Best-effort client identifier from the proxy headers Vercel sets. */
export function clientKey(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

const MINUTE = 60_000;

/** Transaction checks: decode + simulate + explain. */
export const checkLimiter = createRateLimiter({ limit: 20, windowMs: MINUTE });
/** Confirmed transaction and receipt lookups. */
export const lookupLimiter = createRateLimiter({ limit: 30, windowMs: MINUTE });
/** AI explanations per client. Over the limit, the rules engine answers. */
export const modelClientLimiter = createRateLimiter({
  limit: 8,
  windowMs: MINUTE,
});
/** AI explanations across all clients on this instance (cost ceiling). */
export const modelGlobalLimiter = createRateLimiter({
  limit: 60,
  windowMs: MINUTE,
});

export function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}
