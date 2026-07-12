import type { VercelConfig } from "@vercel/config/v1";

// Vercel's free Hobby plan only allows daily cron schedules (a sub-daily
// expression fails the whole deploy) — see docs/ASSUMPTIONS.md. All three
// crons below are safety nets or batch sweeps, not primary delivery paths
// (reminders/confirmations resume via each workflow's own sleep()/hook,
// independent of cron), so daily cadence is a real but acceptable
// precision loss, not a correctness break. Staggered 15 minutes apart so
// they don't all fire at once.
export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Safety-net re-trigger for reminders whose sleep()-based workflow run
    // may have been lost; sleep() is the primary delivery mechanism.
    { path: "/api/cron/check-reminders", schedule: "0 3 * * *" },
    // Sweeps pending_actions past their expiry so a workflow never hangs
    // waiting on a confirmation the user never answered.
    { path: "/api/cron/expire-confirmations", schedule: "15 3 * * *" },
    // Polls due automations (scheduled reports/recurring summaries) and
    // starts an automation-run workflow for each. Automations finer than
    // daily granularity won't fire precisely on Hobby — known limitation.
    { path: "/api/cron/run-automations", schedule: "30 3 * * *" },
  ],
};
