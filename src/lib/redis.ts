import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

export function getRedis() {
  if (!_redis) {
    // fromEnv() falls back to KV_REST_API_URL/TOKEN (what the Upstash
    // Marketplace integration provisions) if UPSTASH_REDIS_REST_* isn't set.
    _redis = Redis.fromEnv();
  }
  return _redis;
}
