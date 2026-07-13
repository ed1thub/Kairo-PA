import { getRedis } from "@/lib/redis";

const REDIS_KEY = "usage:groq:latest";

export interface UsageSnapshot {
  requests: { limit: number; remaining: number; resetAt: string };
  tokens: { limit: number; remaining: number; resetAt: string };
  capturedAt: string;
}

/**
 * Parses Groq's rate-limit reset duration strings (e.g. "2m59.56s",
 * "7.66s", "23h59m1s") into milliseconds. Hour/minute/second components
 * are each optional and always appear in that order; returns 0 if the
 * string doesn't match at all.
 */
export function parseGroqDuration(value: string): number {
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?$/);
  if (!match) return 0;
  const [, hours, minutes, seconds] = match;
  return (
    (hours ? parseInt(hours, 10) * 3_600_000 : 0) +
    (minutes ? parseInt(minutes, 10) * 60_000 : 0) +
    (seconds ? parseFloat(seconds) * 1_000 : 0)
  );
}

/**
 * Captures Groq's rate-limit headers from a chat completion response and
 * stores a snapshot in Redis for the Settings > Usage tab to read later.
 * Reset durations are converted to absolute timestamps at capture time so
 * "resets in Xm" stays accurate however long it is before the Usage tab
 * is actually opened. Silently no-ops if any expected header is missing
 * (provider/API change) rather than failing the chat turn calling it.
 */
export async function writeUsageSnapshot(headers: Record<string, string | undefined>): Promise<void> {
  const limitRequests = headers["x-ratelimit-limit-requests"];
  const remainingRequests = headers["x-ratelimit-remaining-requests"];
  const resetRequests = headers["x-ratelimit-reset-requests"];
  const limitTokens = headers["x-ratelimit-limit-tokens"];
  const remainingTokens = headers["x-ratelimit-remaining-tokens"];
  const resetTokens = headers["x-ratelimit-reset-tokens"];

  if (!limitRequests || !remainingRequests || !resetRequests || !limitTokens || !remainingTokens || !resetTokens) {
    return;
  }

  const now = Date.now();
  const snapshot: UsageSnapshot = {
    requests: {
      limit: parseInt(limitRequests, 10),
      remaining: parseInt(remainingRequests, 10),
      resetAt: new Date(now + parseGroqDuration(resetRequests)).toISOString(),
    },
    tokens: {
      limit: parseInt(limitTokens, 10),
      remaining: parseInt(remainingTokens, 10),
      resetAt: new Date(now + parseGroqDuration(resetTokens)).toISOString(),
    },
    capturedAt: new Date(now).toISOString(),
  };

  await getRedis().set(REDIS_KEY, snapshot);
}

export async function readUsageSnapshot(): Promise<UsageSnapshot | null> {
  const snapshot = await getRedis().get<UsageSnapshot>(REDIS_KEY);
  return snapshot ?? null;
}
