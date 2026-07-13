# Inline Settings Sections + Real Usage Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 10 Settings sections (Account/General/Usage plus Documents/Reminders/Automations/Calendar/Memory/Integrations/Activity) render inline in the dialog instead of the 7 navigating away to full-page routes, and replace Usage's "Coming soon" with Groq's real account-wide rate-limit data.

**Architecture:** Three new read-only API routes (`/api/usage`, `/api/calendar/upcoming`, `/api/integrations/status`) each wrapping data-fetching logic that currently lives in a Server Component page. One new lib module (`usage-snapshot.ts`) that captures Groq's rate-limit response headers into Redis after every chat turn. `settings-dialog.tsx` gains 7 new inline sections consuming these routes plus the existing self-contained panel components. The 7 standalone pages are deleted.

**Tech Stack:** Next.js App Router (Route Handlers), `@upstash/redis` (already wired via `getRedis()`), existing panel/card components, shadcn/ui.

## Global Constraints

- No `—` (em dash) in any user-facing string.
- No test suite exists in this repo. "Test" steps mean: `npx tsc --noEmit`, `npx eslint <files>`, `npm run build`, and `curl`-based auth-gate verification against the running dev server (`pnpm dev`, already running at `localhost:3000`). Do not introduce a test runner.
- Every new route inherits the default auth gate (Clerk's `clerkMiddleware` in `src/proxy.ts` protects every `/api/*` path not explicitly listed as public). None of this plan's new routes go on that public list — same as `/api/model`.
- Follow existing file conventions: `"use client"` for anything with interaction/state, `NextResponse.json(...)` for API responses, `getCurrentUser()` from `@/lib/auth` for user-scoped DB/tool reads.
- Dev server is already running (`pnpm dev`). If a task's verification curl fails with connection refused, start it: `(nohup pnpm dev > /tmp/kairo-dev.log 2>&1 &) ; sleep 5`. If a freshly-created route 404s immediately after being written, wait 2 seconds and retry once before treating it as a real failure (Turbopack needs a moment to pick up new route files).
- Functions called from workflow-level or step-level code that touch Node-only resources (Redis, DB) need a `"use step"` directive **only** when invoked directly from a `"use workflow"` function body (see `src/lib/idempotency.ts::claimIdempotencyKey` for the precedent). `writeUsageSnapshot` in this plan is only ever called from inside `callModel`, which is already `"use step"`, so it needs no directive of its own — matches how `persist-message.ts`'s functions call `getDb()` directly.
- `@upstash/redis`'s client auto-serializes/deserializes plain objects passed to `.set()`/`.get<T>()` — no manual `JSON.stringify`/`JSON.parse` needed (see `src/lib/redis.ts` and the Vercel storage skill's documented pattern).
- Full click-through verification (opening each of the 10 tabs, confirming none navigate away, confirming Calendar/Integrations/Usage show real data after a chat message) requires a signed-in browser session and is explicitly the controller/user's job at the end of this plan, not something task implementers can curl — matching how the previous two plans in this repo (`docs/superpowers/plans/2026-07-12-multi-chat-management.md`, `docs/superpowers/plans/2026-07-13-sidebar-settings.md`) handled the same limitation.

---

### Task 1: Usage snapshot capture

**Files:**
- Create: `src/lib/usage-snapshot.ts`
- Modify: `src/workflows/steps/model-call.ts`

**Interfaces:**
- Produces: `writeUsageSnapshot(headers: Record<string, string | undefined>): Promise<void>`, `readUsageSnapshot(): Promise<UsageSnapshot | null>`, `parseGroqDuration(value: string): number`, and the exported `UsageSnapshot` interface (`{ requests: { limit: number; remaining: number; resetAt: string }; tokens: { limit: number; remaining: number; resetAt: string }; capturedAt: string }`). Consumed by Task 2's `/api/usage` route.

- [ ] **Step 1: Write `src/lib/usage-snapshot.ts`**

```ts
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
```

- [ ] **Step 2: Wire it into `callModel`**

Modify `src/workflows/steps/model-call.ts`. Add the import:

```ts
import { writeUsageSnapshot } from "@/lib/usage-snapshot";
```

Then change the end of `callModel` from:

```ts
  const response = await result.response;

  return {
    responseMessages: response.messages,
```

to:

```ts
  const response = await result.response;

  await writeUsageSnapshot(response.headers ?? {});

  return {
    responseMessages: response.messages,
```

The rest of the function (`toolCalls: ...` and the closing brace) is unchanged.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/usage-snapshot.ts src/workflows/steps/model-call.ts`
Expected: no output from either command.

- [ ] **Step 4: Commit**

```bash
git add src/lib/usage-snapshot.ts src/workflows/steps/model-call.ts
git commit -m "Capture Groq rate-limit headers into a Redis usage snapshot"
```

---

### Task 2: `GET /api/usage`

**Files:**
- Create: `src/app/api/usage/route.ts`

**Interfaces:**
- Consumes: `readUsageSnapshot()` from `@/lib/usage-snapshot` (Task 1).
- Produces: `GET /api/usage` → `{ available: false }` or `{ available: true, requests: {...}, tokens: {...}, capturedAt: string }`. Consumed by Task 5's `UsageSection`.

- [ ] **Step 1: Write the route**

Create `src/app/api/usage/route.ts`:

```ts
import { NextResponse } from "next/server";
import { readUsageSnapshot } from "@/lib/usage-snapshot";

export async function GET() {
  const snapshot = await readUsageSnapshot();
  if (!snapshot) {
    return NextResponse.json({ available: false });
  }
  return NextResponse.json({ available: true, ...snapshot });
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/usage/route.ts`
Expected: no output from either command.

- [ ] **Step 3: Verify auth gating**

Run: `curl -sI http://localhost:3000/api/usage | head -3`
Expected: `HTTP/1.1 307 Temporary Redirect` with a `location` header pointing at `/sign-in?...`, matching `/api/model`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/usage/route.ts
git commit -m "Add GET /api/usage for the settings Usage section"
```

---

### Task 3: `GET /api/calendar/upcoming`

**Files:**
- Create: `src/app/api/calendar/upcoming/route.ts`
- Modify: `src/components/calendar/calendar-events.tsx:6` (export the `CalendarEvent` type)

**Interfaces:**
- Consumes: `calendarView(userId, input)` from `@/tools/calendar` (already exported, already called the same way by the page this replaces), `CalendarNotConnectedError` from `@/lib/google-calendar`, `getCurrentUser()` from `@/lib/auth`.
- Produces: `GET /api/calendar/upcoming` → `{ connected: false }` or `{ connected: true, events: CalendarEvent[] }`. The exported `CalendarEvent` type. Both consumed by Task 5's `CalendarSection`.

- [ ] **Step 1: Export `CalendarEvent` from `calendar-events.tsx`**

In `src/components/calendar/calendar-events.tsx`, change line 6 from:

```ts
type CalendarEvent = Awaited<ReturnType<typeof calendarView>>[number];
```

to:

```ts
export type CalendarEvent = Awaited<ReturnType<typeof calendarView>>[number];
```

No other change to this file — `CalendarEvents({ events })` keeps working exactly as before.

- [ ] **Step 2: Write the route**

Create `src/app/api/calendar/upcoming/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { calendarView } from "@/tools/calendar";
import { CalendarNotConnectedError } from "@/lib/google-calendar";

export async function GET() {
  const { user } = await getCurrentUser();

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  try {
    const events = await calendarView(user.id, {
      timeMin: now.toISOString(),
      timeMax: in7Days.toISOString(),
    });
    return NextResponse.json({ connected: true, events });
  } catch (error) {
    if (error instanceof CalendarNotConnectedError) {
      return NextResponse.json({ connected: false });
    }
    throw error;
  }
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/calendar/upcoming/route.ts src/components/calendar/calendar-events.tsx`
Expected: no output from either command.

- [ ] **Step 4: Verify auth gating**

Run: `curl -sI http://localhost:3000/api/calendar/upcoming | head -3`
Expected: `HTTP/1.1 307 Temporary Redirect` with a `location` header pointing at `/sign-in?...`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/calendar/upcoming/route.ts src/components/calendar/calendar-events.tsx
git commit -m "Add GET /api/calendar/upcoming for the settings Calendar section"
```

---

### Task 4: `GET /api/integrations/status`

**Files:**
- Create: `src/app/api/integrations/status/route.ts`

**Interfaces:**
- Consumes: `getDb()` from `@/db/client`, `integrations` table from `@/db/schema`, `getCurrentUser()` from `@/lib/auth`.
- Produces: `GET /api/integrations/status` → `{ calendarConnected: boolean }`. Consumed by Task 5's `IntegrationsSection`.

- [ ] **Step 1: Write the route**

Create `src/app/api/integrations/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { integrations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const { user } = await getCurrentUser();
  const db = getDb();
  const [calendarIntegration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, user.id), eq(integrations.provider, "google_calendar")))
    .limit(1);

  return NextResponse.json({ calendarConnected: calendarIntegration?.status === "connected" });
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/integrations/status/route.ts`
Expected: no output from either command.

- [ ] **Step 3: Verify auth gating**

Run: `curl -sI http://localhost:3000/api/integrations/status | head -3`
Expected: `HTTP/1.1 307 Temporary Redirect` with a `location` header pointing at `/sign-in?...`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/integrations/status/route.ts
git commit -m "Add GET /api/integrations/status for the settings Integrations section"
```

---

### Task 5: Rewrite `settings-dialog.tsx` with all 10 sections inline

**Files:**
- Modify: `src/components/settings/settings-dialog.tsx` (full-file replacement)

**Interfaces:**
- Consumes: `GET /api/usage` (Task 2), `GET /api/calendar/upcoming` + `CalendarEvent` type (Task 3), `GET /api/integrations/status` (Task 4), plus the already-existing `DocumentsPanel`, `RemindersPanel`, `AutomationsPanel`, `MemoryPanel`, `ActivityPanel`, `CalendarEvents`, `TelegramLinkForm`, `GoogleCalendarCard`, `ToolPermissionsPanel`, `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent` from `@/components/ui/card`, `Button` from `@/components/ui/button`.
- Produces: `SettingsDialog({ open, onOpenChange })` unchanged signature — still consumed by `account-menu.tsx` exactly as today, no change needed there.

- [ ] **Step 1: Replace the entire file**

Replace all of `src/components/settings/settings-dialog.tsx` with:

```tsx
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
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/settings/settings-dialog.tsx`
Expected: no output from either command.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/settings-dialog.tsx
git commit -m "Render all 10 settings sections inline instead of 7 navigating away"
```

---

### Task 6: Delete the 7 standalone pages and final verification

**Files:**
- Delete: `src/app/(dashboard)/documents/page.tsx`
- Delete: `src/app/(dashboard)/reminders/page.tsx`
- Delete: `src/app/(dashboard)/automations/page.tsx`
- Delete: `src/app/(dashboard)/calendar/page.tsx`
- Delete: `src/app/(dashboard)/memory/page.tsx`
- Delete: `src/app/(dashboard)/integrations/page.tsx`
- Delete: `src/app/(dashboard)/activity/page.tsx`

**Interfaces:**
- Consumes: nothing new — this task only removes now-unreachable routes. The panel/card components those pages imported are not deleted (Task 5 already imports them into `settings-dialog.tsx`).

- [ ] **Step 1: Confirm nothing else links to these routes**

Run:

```bash
grep -rn 'href="/documents"\|href="/reminders"\|href="/automations"\|href="/calendar"\|href="/memory"\|href="/integrations"\|href="/activity"' src/
```

Expected: no output (the sidebar already dropped these links in the prior sub-project, and Task 5's `CalendarSection` uses `onGoToIntegrations` — a state callback, not a link).

- [ ] **Step 2: Delete the 7 page files**

```bash
rm "src/app/(dashboard)/documents/page.tsx"
rm "src/app/(dashboard)/reminders/page.tsx"
rm "src/app/(dashboard)/automations/page.tsx"
rm "src/app/(dashboard)/calendar/page.tsx"
rm "src/app/(dashboard)/memory/page.tsx"
rm "src/app/(dashboard)/integrations/page.tsx"
rm "src/app/(dashboard)/activity/page.tsx"
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npx tsc --noEmit && npx eslint . && npm run build`
Expected: all three succeed. The build's route list should no longer include `/documents`, `/reminders`, `/automations`, `/calendar`, `/memory`, `/integrations`, or `/activity`.

- [ ] **Step 4: Verify the deleted routes now 404**

Run:

```bash
for p in documents reminders automations calendar memory integrations activity; do
  echo "$p: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/$p)"
done
```

Expected: each prints `404` (no page left to redirect through auth for; Next.js's not-found kicks in before the middleware would otherwise 307 a real page).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Remove standalone pages for sections that now render inline in Settings"
```

- [ ] **Step 6: Note the manual browser checklist for the controller/user**

This step has no code — it's a reminder for whoever runs this plan. After Task 6 lands, ask the user (in their own signed-in browser at the deployed URL, or `localhost:3000` if they're testing locally) to confirm:

1. Every one of the 10 left-rail items (Account, General, Usage, Documents, Reminders, Automations, Calendar, Memory, Integrations, Activity) switches the content pane without closing the dialog or navigating away.
2. Usage shows real numbers (not "Loading..." forever, not "Unavailable") after they've sent at least one chat message since this deployed.
3. Calendar shows their upcoming events if Google Calendar is connected, or the not-connected empty state with a working "Go to Integrations" button (that also stays inside the dialog) if it isn't.
4. Integrations still lets them link Telegram, connect/disconnect Google Calendar, and toggle tool permissions, exactly as the old standalone page did.
5. `/documents`, `/reminders`, `/automations`, `/calendar`, `/memory`, `/integrations`, `/activity` typed directly into the URL bar now 404.

---

## Self-Review Notes

- **Spec coverage:** all 7 sections rendered inline (Task 5), Calendar/Integrations client-fetch wrappers (Tasks 3-4), Usage real data with absolute reset timestamps (Task 1-2, 5), 7 standalone pages deleted (Task 6), panel/card components preserved and reused (Task 5's imports) — every spec item has a task.
- **Placeholder scan:** none found; every step has complete code.
- **Type consistency:** `CalendarEvent` exported in Task 3 Step 1 is imported by name in Task 5's `CalendarSection`; `UsageSnapshot`'s field names (`requests`/`tokens`/`limit`/`remaining`/`resetAt`/`capturedAt`) match exactly between Task 1's `usage-snapshot.ts`, Task 2's route (spread directly), and Task 5's `UsageSnapshotResponse` interface; `writeUsageSnapshot`'s parameter type (`Record<string, string | undefined>`) matches `response.headers`'s type from the `ai` package (`Record<string, string | undefined> | undefined`, guarded with `?? {}` at the call site in Task 1 Step 2).
