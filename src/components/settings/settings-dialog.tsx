"use client";

import { useEffect, useState } from "react";
import { UserProfile } from "@clerk/nextjs";
import {
  User,
  SlidersHorizontal,
  Gauge,
  FileText,
  Bell,
  Workflow,
  Calendar as CalendarIcon,
  BrainCircuit,
  Plug,
  Activity,
  CalendarX2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { RemindersPanel } from "@/components/reminders/reminders-panel";
import { AutomationsPanel } from "@/components/automations/automations-panel";
import { MemoryPanel } from "@/components/memory/memory-panel";
import { ActivityPanel } from "@/components/activity/activity-panel";
import { CalendarEvents, type CalendarEvent } from "@/components/calendar/calendar-events";
import { TelegramLinkForm } from "@/components/integrations/telegram-link-form";
import { GoogleCalendarCard } from "@/components/integrations/google-calendar-card";
import { ToolPermissionsPanel } from "@/components/integrations/tool-permissions-panel";

const SECTIONS = [
  { id: "account", label: "Account", icon: User },
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "usage", label: "Usage", icon: Gauge },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "automations", label: "Automations", icon: Workflow },
  { id: "calendar", label: "Calendar", icon: CalendarIcon },
  { id: "memory", label: "Memory", icon: BrainCircuit },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "activity", label: "Activity", icon: Activity },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [active, setActive] = useState<SectionId>("account");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[85vh] max-h-[46rem] w-[95vw] max-w-7xl sm:max-w-7xl flex-row gap-0 overflow-hidden p-0"
        aria-describedby={undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <nav className="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-2">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActive(section.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                active === section.id && "bg-accent font-medium",
              )}
            >
              <section.icon className="size-4" />
              {section.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 overflow-x-hidden overflow-y-auto p-4">
          {active === "account" && <AccountSection />}
          {active === "general" && <GeneralSection />}
          {active === "usage" && <UsageSection />}
          {active === "documents" && <DocumentsPanel />}
          {active === "reminders" && <RemindersPanel />}
          {active === "automations" && <AutomationsPanel />}
          {active === "calendar" && <CalendarSection onGoToIntegrations={() => setActive("integrations")} />}
          {active === "memory" && <MemoryPanel />}
          {active === "integrations" && <IntegrationsSection />}
          {active === "activity" && <ActivityPanel />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccountSection() {
  return <UserProfile routing="hash" />;
}

function GeneralSection() {
  const [model, setModel] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/model")
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((body: { model: string }) => {
        if (!cancelled) setModel(body.model);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Theme</p>
          <p className="text-sm text-muted-foreground">Light, dark, or match your system.</p>
        </div>
        <ThemeToggle />
      </div>
      <div>
        <p className="text-sm font-medium">Current model</p>
        <p className="text-sm text-muted-foreground">{failed ? "Unavailable" : (model ?? "Loading...")}</p>
      </div>
    </div>
  );
}

interface UsageSnapshotResponse {
  available: boolean;
  requests?: { limit: number; remaining: number; resetAt: string };
  tokens?: { limit: number; remaining: number; resetAt: string };
  capturedAt?: string;
}

function formatCountdown(resetAt: string): string {
  const ms = new Date(resetAt).getTime() - Date.now();
  if (ms <= 0) return "any moment now";
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function UsageBar({
  label,
  remaining,
  limit,
  resetAt,
}: {
  label: string;
  remaining: number;
  limit: number;
  resetAt: string;
}) {
  const pct = limit > 0 ? Math.max(0, Math.min(100, (remaining / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">
          {remaining.toLocaleString()} / {limit.toLocaleString()} remaining
        </p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Resets in {formatCountdown(resetAt)}</p>
    </div>
  );
}

function UsageSection() {
  const [data, setData] = useState<UsageSnapshotResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage")
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((body: UsageSnapshotResponse) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return <p className="text-sm text-muted-foreground">Unavailable.</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }
  if (!data.available || !data.requests || !data.tokens) {
    return <p className="text-sm text-muted-foreground">No usage data yet, send a message first.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Kairo runs on a single shared Groq account, so these are the account&apos;s real limits, not a per-user quota.
      </p>
      <UsageBar
        label="Requests today"
        remaining={data.requests.remaining}
        limit={data.requests.limit}
        resetAt={data.requests.resetAt}
      />
      <UsageBar
        label="Tokens this minute"
        remaining={data.tokens.remaining}
        limit={data.tokens.limit}
        resetAt={data.tokens.resetAt}
      />
    </div>
  );
}

function CalendarSection({ onGoToIntegrations }: { onGoToIntegrations: () => void }) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [connected, setConnected] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar/upcoming")
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((body: { connected: boolean; events?: CalendarEvent[] }) => {
        if (cancelled) return;
        setConnected(body.connected);
        setEvents(body.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return <p className="text-sm text-muted-foreground">Unavailable.</p>;
  }
  if (events === null) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }
  if (!connected) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <CalendarX2 className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">Calendar not connected</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Connect Google Calendar to view and manage your events here.
          </p>
        </div>
        <Button size="sm" className="mt-1" onClick={onGoToIntegrations}>
          Go to Integrations
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2">
      <p className="text-sm text-muted-foreground">Next 7 days from your connected Google Calendar.</p>
      <CalendarEvents events={events} />
    </div>
  );
}

function IntegrationsSection() {
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/status")
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((body: { calendarConnected: boolean }) => {
        if (!cancelled) setCalendarConnected(body.calendarConnected);
      })
      .catch(() => {
        if (!cancelled) setCalendarConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Telegram</CardTitle>
          <CardDescription>Link your Telegram account to chat with Kairo there too.</CardDescription>
        </CardHeader>
        <CardContent>
          <TelegramLinkForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription>Let Kairo view, create, and manage events on your behalf.</CardDescription>
        </CardHeader>
        <CardContent>
          <GoogleCalendarCard connected={calendarConnected ?? false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tool permissions</CardTitle>
          <CardDescription>Enable or disable individual tools and confirmation requirements.</CardDescription>
        </CardHeader>
        <CardContent>
          <ToolPermissionsPanel />
        </CardContent>
      </Card>
    </div>
  );
}
