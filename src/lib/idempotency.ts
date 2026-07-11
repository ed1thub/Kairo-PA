import { getRedis } from "./redis";

/**
 * Returns true the first time a given key is seen (safe to proceed), false
 * on any repeat within the TTL window (duplicate — caller should skip the
 * mutating action). Backed by Redis SET NX so concurrent callers can't both
 * "win".
 *
 * Marked "use step" for the same reason as writeAuditLog (see audit.ts) —
 * called from workflow-level code in src/lib/tool-runtime.ts, and the Redis
 * client's module code can't evaluate inside the workflow sandbox otherwise.
 */
export async function claimIdempotencyKey(key: string, ttlSeconds = 3600): Promise<boolean> {
  "use step";
  const redis = getRedis();
  const result = await redis.set(`idempotency:${key}`, "1", { nx: true, ex: ttlSeconds });
  return result === "OK";
}
