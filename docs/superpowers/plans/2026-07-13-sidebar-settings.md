# Sidebar Restructure and Settings Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar's static "Account" footer row with an account dropdown menu (Settings, Log out), and add a Settings dialog with Account/General/Usage rendered inline and Documents/Reminders/Automations/Calendar/Memory/Integrations/Activity as launcher links, removing those 7 as direct sidebar nav items.

**Architecture:** One new API route (`GET /api/model`, reused by the General section). Two new client components (`SettingsDialog`, `AccountMenu`). One modified file (`app-sidebar.tsx`) that drops `NAV_ITEMS` and the old footer markup in favor of `<AccountMenu />`.

**Tech Stack:** Next.js App Router (Route Handlers, Client Components), `@clerk/nextjs` (`useUser`, `useClerk`, `UserProfile`), shadcn/ui (`dialog`, `dropdown-menu`, `avatar`), `next-themes` via the existing `ThemeToggle`.

## Global Constraints

- No `—` (em dash) in any user-facing string.
- No test suite exists in this repo. "Test" steps mean: `npx tsc --noEmit`, `npx eslint <files>`, `npm run build`, and `curl`-based manual verification against the running dev server (`pnpm dev`, already running at `localhost:3000`). Do not introduce a test runner.
- Every route must scope by auth the same way every other route does: this repo's default (Clerk's `clerkMiddleware` in `src/proxy.ts` protects every `/api/*` path not explicitly listed as public; `GET /api/model` stays off that public list, so it inherits the default 307-to-sign-in redirect for unauthenticated requests, same as `/api/conversations`).
- Follow existing file conventions: `"use client"` for anything with interaction/state, `NextResponse.json(...)` for API responses.
- Dev server is already running (`pnpm dev`). If a task's verification curl fails with connection refused, start it: `(nohup pnpm dev > /tmp/kairo-dev.log 2>&1 &) ; sleep 5`. If a freshly-created route 404s immediately after being written, wait 2 seconds and retry once before treating it as a real failure (Turbopack needs a moment to pick up new route files).

---

### Task 1: `GET /api/model`

**Files:**
- Create: `src/app/api/model/route.ts`

**Interfaces:**
- Consumes: `getModelName()` from `@/lib/llm` (already exported, already used by the chat routes for the `x-model` header).
- Produces: `GET /api/model` → `{ model: string }`. Consumed by Task 2's `GeneralSection`.

- [ ] **Step 1: Write the route**

Create `src/app/api/model/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getModelName } from "@/lib/llm";

export async function GET() {
  return NextResponse.json({ model: getModelName() });
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/model/route.ts`
Expected: no output from either command.

- [ ] **Step 3: Verify auth gating**

Run: `curl -sI http://localhost:3000/api/model | head -3`
Expected: `HTTP/1.1 307 Temporary Redirect` with a `location` header pointing at `/sign-in?...`, matching every other authed route in this app (e.g. `/api/conversations`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/model/route.ts
git commit -m "Add GET /api/model for the settings General section"
```

---

### Task 2: `SettingsDialog` component

**Files:**
- Create: `src/components/settings/settings-dialog.tsx`

**Interfaces:**
- Consumes: `GET /api/model` (Task 1); `UserProfile` from `@clerk/nextjs`; `ThemeToggle` from `@/components/theme-toggle`; `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` from `@/components/ui/dialog`.
- Produces: `SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })`. Consumed by Task 3's `AccountMenu`.

- [ ] **Step 1: Write the component**

Create `src/components/settings/settings-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const INLINE_SECTIONS = [
  { id: "account", label: "Account", icon: User },
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "usage", label: "Usage", icon: Gauge },
] as const;

const LINK_SECTIONS = [
  { id: "documents", label: "Documents", icon: FileText, href: "/documents" },
  { id: "reminders", label: "Reminders", icon: Bell, href: "/reminders" },
  { id: "automations", label: "Automations", icon: Workflow, href: "/automations" },
  { id: "calendar", label: "Calendar", icon: CalendarIcon, href: "/calendar" },
  { id: "memory", label: "Memory", icon: BrainCircuit, href: "/memory" },
  { id: "integrations", label: "Integrations", icon: Plug, href: "/integrations" },
  { id: "activity", label: "Activity", icon: Activity, href: "/activity" },
] as const;

type InlineSectionId = (typeof INLINE_SECTIONS)[number]["id"];

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [active, setActive] = useState<InlineSectionId>("account");

  function openLink(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[32rem] max-w-3xl flex-row gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <nav className="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-2">
          {INLINE_SECTIONS.map((section) => (
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
          <div className="my-1 border-t" />
          {LINK_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => openLink(section.href)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <section.icon className="size-4" />
              {section.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto p-4">
          {active === "account" && <AccountSection />}
          {active === "general" && <GeneralSection />}
          {active === "usage" && <UsageSection />}
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

function UsageSection() {
  return (
    <div>
      <p className="text-sm font-medium">Usage</p>
      <p className="mt-1 text-sm text-muted-foreground">Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/settings/settings-dialog.tsx`
Expected: no output from either command. If `react-hooks/set-state-in-effect` flags a line in `GeneralSection`, add `// eslint-disable-next-line react-hooks/set-state-in-effect` directly above that specific `setModel`/`setFailed` call inside the `.then`/`.catch` callback (not above the `useEffect` line itself), matching the pattern already used in `src/components/chat/chat-list.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/settings-dialog.tsx
git commit -m "Add SettingsDialog component"
```

---

### Task 3: `AccountMenu` component

**Files:**
- Create: `src/components/settings/account-menu.tsx`

**Interfaces:**
- Consumes: `SettingsDialog` (Task 2); `useUser`, `useClerk` from `@clerk/nextjs`; `Avatar`/`AvatarImage`/`AvatarFallback` from `@/components/ui/avatar`; `DropdownMenu*` from `@/components/ui/dropdown-menu`.
- Produces: `AccountMenu()` (no props) — consumed by Task 4's `app-sidebar.tsx`.

- [ ] **Step 1: Write the component**

Create `src/components/settings/account-menu.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingsDialog } from "@/components/settings/settings-dialog";

export function AccountMenu() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!isLoaded || !user) return null;

  const name = user.fullName ?? user.primaryEmailAddress?.emailAddress ?? "Account";
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const initials =
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <Avatar className="size-6 shrink-0">
              <AvatarImage src={user.imageUrl} alt={name} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col leading-none group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-medium">{name}</span>
              {email && <span className="text-xs text-muted-foreground">{email}</span>}
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="text-sm font-medium">{name}</span>
            {email && <span className="text-xs font-normal text-muted-foreground">{email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setSettingsOpen(true);
            }}
          >
            <SettingsIcon /> Settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => signOut({ redirectUrl: "/sign-in" })}>
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
```

Note on the `onSelect={(e) => { e.preventDefault(); ... }}` handler for Settings: this is required, not optional style. Radix's `DropdownMenuItem` calls `preventDefault` inside `onSelect` to stop it from returning focus to the trigger button before the dialog mounts; skipping this causes the dropdown's focus-return behavior to fight the dialog's own focus trap on open.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/settings/account-menu.tsx`
Expected: no output from either command.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/account-menu.tsx
git commit -m "Add AccountMenu sidebar footer component"
```

---

### Task 4: Wire `AccountMenu` into the sidebar, remove relocated nav items, final verification

**Files:**
- Modify: `src/components/app-sidebar.tsx`

**Interfaces:**
- Consumes: `AccountMenu` from Task 3.

- [ ] **Step 1: Replace the entire file**

`NAV_ITEMS` and its render block go away, along with the old `UserButton`/`ThemeToggle` footer markup and every import only they used (`usePathname`, `UserButton`, `ThemeToggle`, `SidebarGroup`, `SidebarGroupContent`, and every relocated-page icon). Replace the full contents of `src/components/app-sidebar.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { Bot } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ChatList } from "@/components/chat/chat-list";
import { AccountMenu } from "@/components/settings/account-menu";

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/chat">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Bot className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Kairo-PA</span>
                  <span className="text-xs text-muted-foreground">Personal assistant</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <ChatList />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/app-sidebar.tsx`
Expected: no output from either command (no unused-import warnings for `usePathname`, `UserButton`, `ThemeToggle`, or any relocated-page icon).

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: `✓ Compiled successfully`. The route list is unchanged from before this task (no routes added or removed, only sidebar composition changed) plus `/api/model` from Task 1.

- [ ] **Step 4: Full-repo lint**

Run: `npx eslint .`
Expected: only the pre-existing warnings in `src/app/.well-known/workflow/v1/*` (unrelated autogenerated files). Zero errors.

- [ ] **Step 5: Live smoke test**

Run:
```bash
curl -s http://localhost:3000/api/health
curl -sI http://localhost:3000/api/model | head -3
curl -sI http://localhost:3000/documents | head -3
```
Expected: health check `{"db":"ok","redis":"ok"}`; `/api/model` and `/documents` both 307-redirect to `/sign-in` (unauthenticated, consistent gating; `/documents` itself is untouched by this plan and should still work exactly as before, just no longer linked directly from the sidebar).

- [ ] **Step 6: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "Replace sidebar Account footer with AccountMenu and settings dialog"
```

- [ ] **Step 7: Tell the user what needs their own browser to confirm**

This plan's automated verification (typecheck, lint, build, curl) confirms the code is structurally correct and auth-gated properly. It cannot confirm the actual UX. After both tasks are committed, tell the user to check, signed in, in their own browser:

1. Sidebar bottom-left now shows an avatar/name/email row instead of the old "Account" label; clicking it opens a dropdown with a name/email header, Settings, and Log out (no Upgrade plan, Personalization, Profile, or Help items).
2. The 7 old sidebar links (Documents, Reminders, Automations, Calendar, Memory, Integrations, Activity) are gone from the sidebar itself.
3. Clicking "Settings" opens a dialog with a left rail listing Account, General, Usage, then Documents through Activity.
4. Account shows Clerk's own profile management UI (email, password, sessions) inline.
5. General shows the theme toggle (still functional) and a line showing the current LLM model name.
6. Usage shows a "Coming soon" message.
7. Clicking Documents (or any of the other 6 launcher items) closes the dialog and navigates to that page exactly as it did before this change.
8. Clicking "Log out" signs out and lands on the sign-in page.
9. Collapsing the sidebar to icon-only mode still shows just the avatar in the footer, no broken layout.
