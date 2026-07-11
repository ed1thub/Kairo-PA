import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Safety-net re-trigger for reminders whose sleep()-based workflow run
    // may have been lost; sleep() is the primary delivery mechanism.
    { path: "/api/cron/check-reminders", schedule: "*/5 * * * *" },
    // Polls due automations (scheduled reports/recurring summaries) and
    // starts an automation-run workflow for each.
    { path: "/api/cron/run-automations", schedule: "*/15 * * * *" },
    // Sweeps pending_actions past their expiry so a workflow never hangs
    // waiting on a confirmation the user never answered.
    { path: "/api/cron/expire-confirmations", schedule: "*/5 * * * *" },
  ],
};
