/**
 * Verifies a request actually came from Vercel Cron (or a trusted manual
 * trigger using the same secret), per Vercel's documented cron auth
 * pattern: `Authorization: Bearer ${CRON_SECRET}`.
 */
export function verifyCronRequest(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  return Boolean(process.env.CRON_SECRET) && authHeader === `Bearer ${process.env.CRON_SECRET}`;
}
