"use client";

import { useState } from "react";

export function GoogleCalendarCard({ connected }: { connected: boolean }) {
  const [busy, setBusy] = useState(false);

  if (!connected) {
    return (
      <a
        href="/api/integrations/google-calendar/connect"
        className="inline-block rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm"
      >
        Connect Google Calendar
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-green-600">Connected</span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch("/api/integrations/google-calendar/revoke", { method: "POST" });
          window.location.reload();
        }}
        className="text-sm underline text-red-600 disabled:opacity-50"
      >
        Disconnect
      </button>
    </div>
  );
}
