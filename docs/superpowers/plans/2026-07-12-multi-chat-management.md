# Multi-chat Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single, localStorage-pinned web conversation with a real multi-chat system — list, create, switch, rename, pin, delete — each chat addressable by its own URL.

**Architecture:** Add a `pinned` column to the existing `conversations` table; add `GET /api/conversations` (list) and `PATCH`/`DELETE /api/conversations/[id]`; move the chat route from static `/chat` to `/chat/[conversationId]` with a thin `/chat` redirector to the most recent chat; `ChatPanel` takes `conversationId` as a prop instead of self-managing it; a new `ChatList` sidebar component replaces the single "Chat" nav link.

**Tech Stack:** Next.js App Router (Server Components + Route Handlers), Drizzle ORM / Neon Postgres, `@ai-sdk/react`'s `useChat`, shadcn/ui (`sidebar`, `dropdown-menu`, `alert-dialog`, `input`), Vercel Workflow DevKit (`workflow/api`'s `getRun().cancel()`).

## Global Constraints

- No `—` (em dash) in any user-facing string. Use a comma, period, or colon instead. (User's explicit standing instruction from earlier this session.)
- Every route must scope every query by `eq(conversations.userId, user.id)` via `getCurrentUser()` — never trust a client-supplied id alone. Follow the exact pattern already in `src/app/api/reminders/[id]/route.ts` and `src/app/api/documents/[id]/route.ts`.
- This repo has no test suite (`package.json` has no `"test"` script, no `*.test.ts` files exist). Per this session's established, user-accepted practice, "test" steps in this plan mean: `npx tsc --noEmit`, `npx eslint <files>`, `npm run build`, and `curl`-based manual verification against the running dev server (`pnpm dev`, already running at `localhost:3000` in this session) — not a fabricated test framework. Do not introduce a test runner as part of this plan.
- Follow existing file conventions exactly: Server Components for pages that read the DB directly, `"use client"` for anything with interaction/state, `NextResponse.json(...)` for API responses, 404 via `new NextResponse("Not found", { status: 404 })`.
- Dev server is already running (`pnpm dev` in this session). If a task's verification curl fails with connection refused, start it: `(nohup pnpm dev > /tmp/kairo-dev.log 2>&1 &) ; sleep 5`.

---

### Task 1: Add `pinned` column to `conversations`

**Files:**
- Modify: `src/db/schema.ts:68-77` (the `conversations` table definition)

**Interfaces:**
- Produces: `conversations.pinned` (boolean, not null, default `false`) — consumed by Tasks 2 and 3.

- [ ] **Step 1: Add the column**

In `src/db/schema.ts`, find:

```ts
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  title: text("title"),
  workflowRunId: text("workflow_run_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Replace with:

```ts
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  title: text("title"),
  pinned: boolean("pinned").notNull().default(false),
  workflowRunId: text("workflow_run_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

(`boolean` is already imported at the top of this file — no import change needed.)

- [ ] **Step 2: Push the schema to the database**

Run: `source <(grep -v '^#' .env.local | sed 's/^/export /') && npx drizzle-kit push`
Expected: prompts to confirm adding the `pinned` column (a new nullable-then-defaulted column on an existing table); accept. Output ends with something like `Changes applied`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 4: Verify the column exists**

Run: `curl -s http://localhost:3000/api/health`
Expected: `{"db":"ok","redis":"ok"}` (confirms the app still connects after the schema push; a bad push would typically surface as a `db` failure here or on the next DB-touching request).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts
git commit -m "Add pinned column to conversations table"
```

---

### Task 2: `GET /api/conversations`

**Files:**
- Create: `src/app/api/conversations/route.ts`

**Interfaces:**
- Consumes: `getCurrentUser()` from `@/lib/auth` (returns `{ user, workspace }`), `conversations` table from `@/db/schema` (with `pinned` from Task 1).
- Produces: `GET /api/conversations` → `{ conversations: { id: string; title: string | null; pinned: boolean; updatedAt: string }[] }`, ordered pinned-first then most-recently-updated. Consumed by Task 5's `ChatList` component.

- [ ] **Step 1: Write the route**

Create `src/app/api/conversations/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { conversations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const { user } = await getCurrentUser();
  const db = getDb();
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      pinned: conversations.pinned,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(and(eq(conversations.userId, user.id), eq(conversations.channel, "web")))
    .orderBy(desc(conversations.pinned), desc(conversations.updatedAt));
  return NextResponse.json({ conversations: rows });
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/conversations/route.ts`
Expected: no output from either command.

- [ ] **Step 3: Verify auth gating**

Run: `curl -sI http://localhost:3000/api/conversations | head -3`
Expected: `HTTP/1.1 307 Temporary Redirect` with a `location` header pointing at `/sign-in?...` (unauthenticated request correctly redirected, matching every other authed route in this app — see `src/proxy.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/conversations/route.ts
git commit -m "Add GET /api/conversations to list a user's web chats"
```

---

### Task 3: `PATCH` and `DELETE /api/conversations/[id]`

**Files:**
- Create: `src/app/api/conversations/[id]/route.ts`

**Interfaces:**
- Consumes: `getCurrentUser()`, `conversations` table, `getRun` from `workflow/api` (used identically to `src/app/api/chat/route.ts`'s existing `getRun(existing.workflowRunId)` call).
- Produces: `PATCH /api/conversations/[id]` (body `{ title?: string; pinned?: boolean }`) → `{ conversation: {...} }` or 404. `DELETE /api/conversations/[id]` → `{ deleted: true }` or 404. Consumed by Task 5's `ChatList`.

- [ ] **Step 1: Write the route**

Create `src/app/api/conversations/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getRun } from "workflow/api";
import { getDb } from "@/db/client";
import { conversations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

async function findOwnedConversation(userId: string, id: string) {
  const db = getDb();
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId), eq(conversations.channel, "web")))
    .limit(1);
  return conversation;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await getCurrentUser();
  const { id } = await params;
  const conversation = await findOwnedConversation(user.id, id);
  if (!conversation) return new NextResponse("Not found", { status: 404 });

  const body = await request.json();
  const patch: { title?: string; pinned?: boolean; updatedAt: Date } = { updatedAt: new Date() };
  if (typeof body.title === "string" && body.title.trim()) {
    patch.title = body.title.trim().slice(0, 80);
  }
  if (typeof body.pinned === "boolean") {
    patch.pinned = body.pinned;
  }

  const db = getDb();
  const [updated] = await db
    .update(conversations)
    .set(patch)
    .where(eq(conversations.id, id))
    .returning();

  return NextResponse.json({ conversation: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await getCurrentUser();
  const { id } = await params;
  const conversation = await findOwnedConversation(user.id, id);
  if (!conversation) return new NextResponse("Not found", { status: 404 });

  if (conversation.workflowRunId) {
    const run = getRun(conversation.workflowRunId);
    await run.cancel().catch(() => {
      // Run may have already finished or been cleaned up. Deleting the
      // conversation row (and its cascaded messages) is what matters for
      // correctness here.
    });
  }

  const db = getDb();
  await db.delete(conversations).where(eq(conversations.id, id));
  return NextResponse.json({ deleted: true });
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint "src/app/api/conversations/[id]/route.ts"`
Expected: no output from either command.

- [ ] **Step 3: Verify auth gating**

Run: `curl -sI -X PATCH http://localhost:3000/api/conversations/00000000-0000-0000-0000-000000000000 | head -3`
Expected: `HTTP/1.1 307 Temporary Redirect` (same auth gate as every other route).

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/conversations/[id]/route.ts"
git commit -m "Add PATCH/DELETE /api/conversations/[id] for rename, pin, and delete"
```

---

### Task 4: Per-conversation routing and `ChatPanel` migration

**Files:**
- Create: `src/app/(dashboard)/chat/[conversationId]/page.tsx`
- Modify: `src/app/(dashboard)/chat/page.tsx` (becomes a redirector to the most recent chat)
- Modify: `src/components/chat/chat-panel.tsx` (accepts `conversationId` as a prop; drops `getOrCreateConversationId`/`STORAGE_KEY`)

**Interfaces:**
- Consumes: `getCurrentUser()`, `conversations` table (for the redirector's "most recent" lookup).
- Produces: `ChatPanel({ conversationId }: { conversationId: string })` — the new required prop signature every future caller (Task 5's `ChatList` doesn't call `ChatPanel` directly, but the route does) must use.

- [ ] **Step 1: Create the dynamic chat page**

Create `src/app/(dashboard)/chat/[conversationId]/page.tsx`:

```tsx
import { PageHeader } from "@/components/page-header";
import { ChatPanel } from "@/components/chat/chat-panel";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader title="Chat" description="Talk to Kairo." />
      <ChatPanel conversationId={conversationId} />
    </div>
  );
}
```

(Description copy shortened from "Talk to Kairo, same conversation as Telegram." — that claim was already inaccurate before this change, per the codebase's own separate `channel` tracking, and is more clearly inaccurate now that web has multiple independent chats.)

- [ ] **Step 2: Replace the old chat page with a redirector**

Replace the full contents of `src/app/(dashboard)/chat/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { conversations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export default async function ChatIndexPage() {
  const { user } = await getCurrentUser();
  const db = getDb();
  const [latest] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.userId, user.id), eq(conversations.channel, "web")))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);

  redirect(`/chat/${latest?.id ?? crypto.randomUUID()}`);
}
```

- [ ] **Step 3: Migrate `ChatPanel` to take `conversationId` as a prop**

Replace the full contents of `src/components/chat/chat-panel.tsx` with:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Sparkles, TriangleAlert, SquarePlus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PendingConfirmations } from "@/components/chat/pending-confirmations";
import { cn } from "@/lib/utils";

const STARTED_KEY_PREFIX = "kairo-conversation-started:";

export function ChatPanel({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  // A conversation only has something to resume once its first message has
  // actually reached the server (row + workflow run created). Resuming a
  // brand-new id 404s on GET /api/chat/stream/[id] and permanently wedges
  // useChat's status at "error", disabling the composer. This is decided
  // once per conversationId and never flipped again afterward: useChat's
  // resume effect re-fires resumeStream() on every false->true transition
  // of `resume`, so toggling it true right after the first sendMessage()
  // (as opposed to only reading it once when the conversation loads) races
  // the same GET against the POST that's still creating the conversation
  // row server-side.
  const [shouldResume, setShouldResume] = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Re-derive on every conversationId change, not just on mount: this
    // component instance is reused across chat switches (Next.js keeps the
    // same page component mounted when only the dynamic segment changes),
    // so a [] dependency array here would leave shouldResume/input stuck
    // from the previously-open chat.
    setInput("");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShouldResume(localStorage.getItem(STARTED_KEY_PREFIX + conversationId) === "1");
  }, [conversationId]);

  const transport = useMemo(() => {
    return new WorkflowChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ id, messages, api }) => {
        const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
        const text =
          lastUserMessage?.parts
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("") ?? "";
        return { api, body: { conversationId: id, message: text } };
      },
      prepareReconnectToStreamRequest: ({ id, ...rest }) => ({
        ...rest,
        api: `/api/chat/stream/${encodeURIComponent(id)}`,
      }),
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        const model = res.headers.get("x-model");
        if (model) console.info(`[Kairo] LLM model: ${model}`);
        return res;
      },
    });
  }, [conversationId]);

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    resume: shouldResume,
    transport,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function submit() {
    if (!input.trim() || status !== "ready") return;
    sendMessage({ text: input });
    setInput("");
    localStorage.setItem(STARTED_KEY_PREFIX + conversationId, "1");
  }

  // The underlying workflow run backing a conversation can fail outright
  // (Groq's free-tier models occasionally reject a tool call; see
  // docs/ASSUMPTIONS.md) and there is no way to resume a dead run. Once
  // that happens the composer would otherwise stay disabled forever with
  // no way out.
  function startNewConversation() {
    router.push(`/chat/${crypto.randomUUID()}`);
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 sm:p-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Say hello to Kairo</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ask about your documents, set a reminder, check your calendar, or just chat.
                </p>
              </div>
            </div>
          )}
          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div key={message.id} className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback className={cn(isUser ? "bg-secondary" : "bg-primary text-primary-foreground")}>
                    {isUser ? "Y" : <Bot className="size-3.5" />}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                    isUser ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {message.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <PendingConfirmations />

      {error && (
        <div className="flex items-center gap-2 border-t bg-destructive/10 px-4 py-3 text-sm text-destructive sm:px-6">
          <TriangleAlert className="size-4 shrink-0" />
          <span>
            This conversation hit an error and can&apos;t continue. Starting a new one (+ below) usually fixes it,
            but if a fresh conversation fails too, the AI provider&apos;s usage limit may be temporarily exhausted;
            wait a bit and try again.
          </span>
        </div>
      )}

      <div className="border-t p-4 sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mx-auto flex w-full max-w-2xl items-end gap-2"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={startNewConversation}
            title="Start new conversation"
          >
            <SquarePlus />
            <span className="sr-only">Start new conversation</span>
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={status !== "ready"}
            placeholder="Message Kairo..."
            rows={1}
            className="min-h-9 flex-1 resize-none"
          />
          <Button type="submit" size="icon" disabled={status !== "ready" || !input.trim()}>
            <Send />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Point the sidebar's Chat link at the redirector (no change needed if it already points at `/chat`)**

Run: `grep -n '"/chat"' src/components/app-sidebar.tsx`
Expected: one match, `{ href: "/chat", label: "Chat", icon: MessageSquare },` — already correct, since `/chat` (the redirector) is still the right link target. No edit needed here; this step is a verification, not a change.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(dashboard)/chat/[conversationId]/page.tsx" "src/app/(dashboard)/chat/page.tsx" src/components/chat/chat-panel.tsx`
Expected: no output from either command.

- [ ] **Step 6: Full build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, and the route list includes `├ ƒ /chat` and `├ ƒ /chat/[conversationId]` (both dynamic now, since both read the DB per-request).

- [ ] **Step 7: Manual verification**

Run:
```bash
curl -sI http://localhost:3000/chat | head -5
```
Expected: `HTTP/1.1 307 Temporary Redirect` to `/sign-in` (unauthenticated) — confirms the redirector route itself doesn't 500 before the auth check even runs. Full click-through (sign in, land on `/chat`, get redirected to `/chat/<uuid>`, send a message, refresh, confirm it's still there) needs to be done by the user in their own browser, same as the rest of this session's UI work — note this to the user when this task completes.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/chat/[conversationId]/page.tsx" "src/app/(dashboard)/chat/page.tsx" src/components/chat/chat-panel.tsx
git commit -m "Move chat to per-conversation URLs (/chat/[conversationId])"
```

---

### Task 5: `ChatList` sidebar component

**Files:**
- Create: `src/components/chat/chat-list.tsx`

**Interfaces:**
- Consumes: `GET /api/conversations`, `PATCH`/`DELETE /api/conversations/[id]` (Tasks 2-3); shadcn primitives `SidebarGroup`/`SidebarGroupContent`/`SidebarGroupLabel`/`SidebarMenu`/`SidebarMenuItem`/`SidebarMenuButton`/`SidebarMenuAction` from `@/components/ui/sidebar`; `DropdownMenu`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuTrigger` from `@/components/ui/dropdown-menu`; `AlertDialog` family from `@/components/ui/alert-dialog`; `Input` from `@/components/ui/input`; `toast` from `sonner`.
- Produces: `<ChatList />` (no props) — consumed by Task 6's `app-sidebar.tsx`.

- [ ] **Step 1: Write the component**

Create `src/components/chat/chat-list.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ConversationRow {
  id: string;
  title: string | null;
  pinned: boolean;
  updatedAt: string;
}

export function ChatList() {
  const router = useRouter();
  const params = useParams<{ conversationId?: string }>();
  const activeId = params?.conversationId;

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (!res.ok) return;
    const body = await res.json();
    setConversations(body.conversations);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh, activeId]);

  async function togglePin(id: string, pinned: boolean) {
    const res = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    });
    if (!res.ok) {
      toast.error("Failed to update chat");
      return;
    }
    await refresh();
  }

  function startRename(row: ConversationRow) {
    setRenamingId(row.id);
    setRenameDraft(row.title ?? "");
  }

  async function saveRename(id: string) {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title) return;
    const res = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      toast.error("Failed to rename chat");
      return;
    }
    await refresh();
  }

  async function confirmDelete() {
    if (!deletingId) return;
    const id = deletingId;
    setDeletingId(null);
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete chat");
      return;
    }
    toast("Chat deleted");
    if (id === activeId) {
      router.push("/chat");
    }
    await refresh();
  }

  const pinned = conversations.filter((c) => c.pinned);
  const recent = conversations.filter((c) => !c.pinned);

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => router.push(`/chat/${crypto.randomUUID()}`)}>
                <Plus />
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {pinned.length > 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Pinned</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {pinned.map((row) => (
                <ChatListItem
                  key={row.id}
                  row={row}
                  isActive={row.id === activeId}
                  isRenaming={renamingId === row.id}
                  renameDraft={renameDraft}
                  onRenameDraftChange={setRenameDraft}
                  onOpen={() => router.push(`/chat/${row.id}`)}
                  onStartRename={() => startRename(row)}
                  onSaveRename={() => saveRename(row.id)}
                  onTogglePin={() => togglePin(row.id, row.pinned)}
                  onDelete={() => setDeletingId(row.id)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        {pinned.length > 0 && <SidebarGroupLabel>Recent</SidebarGroupLabel>}
        <SidebarGroupContent>
          <SidebarMenu>
            {recent.map((row) => (
              <ChatListItem
                key={row.id}
                row={row}
                isActive={row.id === activeId}
                isRenaming={renamingId === row.id}
                renameDraft={renameDraft}
                onRenameDraftChange={setRenameDraft}
                onOpen={() => router.push(`/chat/${row.id}`)}
                onStartRename={() => startRename(row)}
                onSaveRename={() => saveRename(row.id)}
                onTogglePin={() => togglePin(row.id, row.pinned)}
                onDelete={() => setDeletingId(row.id)}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog open={deletingId !== null} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the conversation and its messages. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ChatListItem({
  row,
  isActive,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onOpen,
  onStartRename,
  onSaveRename,
  onTogglePin,
  onDelete,
}: {
  row: ConversationRow;
  isActive: boolean;
  isRenaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onOpen: () => void;
  onStartRename: () => void;
  onSaveRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  if (isRenaming) {
    return (
      <SidebarMenuItem>
        <Input
          autoFocus
          value={renameDraft}
          onChange={(e) => onRenameDraftChange(e.target.value)}
          onKeyDown={(e) => {
            // Both Enter and Escape just blur the input; onBlur is the
            // single place that actually saves, so there is exactly one
            // commit path regardless of how the user exits rename mode.
            // Escape resets the draft back to the original title first,
            // making the resulting "save" a harmless no-op.
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              onRenameDraftChange(row.title ?? "");
              e.currentTarget.blur();
            }
          }}
          onBlur={onSaveRename}
          className="h-8"
        />
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem className="group/menu-item">
      <SidebarMenuButton isActive={isActive} onClick={onOpen}>
        <span className="truncate">{row.title ?? "New chat"}</span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover>
            <MoreHorizontal />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onStartRename}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onTogglePin}>
            {row.pinned ? <PinOff /> : <Pin />} {row.pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/chat/chat-list.tsx`
Expected: no output from either command.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/chat-list.tsx
git commit -m "Add ChatList sidebar component"
```

---

### Task 6: Wire `ChatList` into the sidebar and final verification

**Files:**
- Modify: `src/components/app-sidebar.tsx`

**Interfaces:**
- Consumes: `ChatList` from Task 5.

- [ ] **Step 1: Remove the "Chat" nav item and render `ChatList` instead**

In `src/components/app-sidebar.tsx`, find the `NAV_ITEMS` array:

```ts
const NAV_ITEMS = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/memory", label: "Memory", icon: BrainCircuit },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/activity", label: "Activity", icon: Activity },
] as const;
```

Remove the `/chat` entry:

```ts
const NAV_ITEMS = [
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/memory", label: "Memory", icon: BrainCircuit },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/activity", label: "Activity", icon: Activity },
] as const;
```

`MessageSquare` is now an unused import from `lucide-react` in this file — remove it from the import line:

```ts
import {
  Bot,
  FileText,
  Bell,
  Workflow,
  Calendar,
  BrainCircuit,
  Plug,
  Activity,
} from "lucide-react";
```

Add the `ChatList` import alongside the existing `ThemeToggle` import:

```ts
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatList } from "@/components/chat/chat-list";
```

Find the `<SidebarContent>` block:

```tsx
<SidebarContent>
  <SidebarGroup>
    <SidebarGroupContent>
      <SidebarMenu>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</SidebarContent>
```

Replace with `<ChatList />` rendered before the remaining nav items, wrapped in its own group so it's visually separated:

```tsx
<SidebarContent>
  <ChatList />
  <SidebarGroup>
    <SidebarGroupContent>
      <SidebarMenu>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</SidebarContent>
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/app-sidebar.tsx`
Expected: no output from either command (no unused-import warnings for `MessageSquare`).

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, same route list as Task 4's build plus no new warnings.

- [ ] **Step 4: Full-repo lint (catch anything missed across all changed files this plan touched)**

Run: `npx eslint .`
Expected: only the pre-existing warnings in `src/app/.well-known/workflow/v1/*` (unrelated autogenerated files, already present before this plan — confirmed in this session's prior work). Zero errors.

- [ ] **Step 5: Live smoke test**

Run:
```bash
curl -s http://localhost:3000/api/health
curl -sI http://localhost:3000/chat | head -3
curl -sI "http://localhost:3000/chat/$(python3 -c 'import uuid; print(uuid.uuid4())')" | head -3
```
Expected: health check `{"db":"ok","redis":"ok"}`; both chat URLs 307-redirect to `/sign-in` (unauthenticated, consistent gating on both the redirector and the dynamic route).

- [ ] **Step 6: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "Replace single Chat nav link with ChatList in sidebar"
```

- [ ] **Step 7: Tell the user what needs their own browser to confirm**

This plan's automated verification (typecheck, lint, build, curl) confirms the code is structurally correct and auth-gated properly. It cannot confirm the actual UX. After all 6 tasks are committed, tell the user to check, signed in, in their own browser:

1. Sidebar now shows "New chat" + a chat list where "Chat" used to be a single link; other 7 nav items still present below it.
2. Click "New chat" → lands on a fresh `/chat/<uuid>` URL, empty composer.
3. Send a message → chat gets a title (from the message text) and appears in the sidebar list after it refreshes.
4. Click a different chat in the list → switches to it, composer/messages update, URL changes.
5. Rename a chat via the "..." menu → inline input appears, Enter or clicking away saves it, Escape cancels without saving.
6. Pin a chat → moves to a "Pinned" section above "Recent".
7. Delete a chat → confirm dialog appears; confirming removes it from the list; if it was the open chat, you land back on `/chat` (redirects to your next most recent, or a fresh chat if none left).
8. Browser back/forward buttons move between previously-visited chats correctly (confirms the URL-based routing, not just client state).
