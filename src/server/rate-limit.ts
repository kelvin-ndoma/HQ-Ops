import { AppError } from "./errors";

type Bucket = { count: number; reset: number };

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (current.count >= limit) return { ok: false, remaining: 0 };
  current.count += 1;
  return { ok: true, remaining: limit - current.count };
}

export function assertRateLimit(key: string, limit: number, windowMs: number, message: string) {
  const result = consumeRateLimit(key, limit, windowMs);
  if (!result.ok) throw new AppError(message);
  return result;
}

export function clearRateLimits() {
  buckets.clear();
}
