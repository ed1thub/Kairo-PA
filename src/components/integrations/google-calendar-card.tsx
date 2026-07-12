"use client";

import { useState } from "react";
import { CalendarCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function GoogleCalendarCard({ connected }: { connected: boolean }) {
  const [busy, setBusy] = useState(false);

  if (!connected) {
    return (
      <Button asChild>
        <a href="/api/integrations/google-calendar/connect">
          <CalendarCheck2 /> Connect Google Calendar
        </a>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        <CalendarCheck2 className="size-3" /> Connected
      </Badge>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        className="text-destructive hover:text-destructive"
        onClick={async () => {
          setBusy(true);
          await fetch("/api/integrations/google-calendar/revoke", { method: "POST" });
          window.location.reload();
        }}
      >
        Disconnect
      </Button>
    </div>
  );
}
