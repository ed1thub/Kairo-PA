# Multi-chat management (sub-project 1 of 4)

Status: approved, ready for implementation planning.

## Context

The user asked for a broader navigation redesign of the web dashboard:

1. **Multi-chat management** (this spec) — a real chat list (create, switch,
   rename, pin, delete), matching Claude/ChatGPT conventions.
2. Sidebar restructure — sidebar keeps only the chat list; the other 7 nav
   items (Documents, Reminders, Automations, Calendar, Memory, Integrations,
   Activity) move into a Settings shell, reached via an account-icon dropdown
   at the bottom of the sidebar (replacing the current "Account" footer row).
3. Settings shell — houses Account (Clerk profile), General (app prefs,
   including the dark-mode toggle currently in the sidebar footer), Usage,
   and the 7 relocated pages, plus a Developer section for the current
   `[Kairo] LLM model` console-log behavior.
4. Token usage tracking — a popup (early warning at ~90% used, and a
   blocking "out of tokens" popup with cooldown time when exhausted) plus a
   Usage tab with progress bars for Groq's daily token and daily request
   limits, sourced from Groq's own `x-ratelimit-*` response headers.

These were explicitly sequenced: **multi-chat first**, since sidebar
restructure and the Settings shell both assume a working chat list exists.
Sub-projects 2-4 are out of scope for this spec and this implementation
pass; each gets its own spec before being built.

## Current state (what this replaces)

- `conversations` table (`src/db/schema.ts`) already has `id`, `userId`,
  `workspaceId`, `channel`, `title`, `workflowRunId`, `createdAt`,
  `updatedAt`. No `pinned` column yet.
- Exactly one active conversation id is tracked client-side, in
  `src/components/chat/chat-panel.tsx`, via a single localStorage key
  (`kairo-active-conversation-id`) generated once with `crypto.randomUUID()`
  and reused forever. There is no way to have more than one web chat, no
  list, no rename, no pin, no delete.
- `src/app/(dashboard)/chat/page.tsx` is a static route with no id in the
  URL.
- The conversation row is created lazily, inside `POST /api/chat`
  (`src/app/api/chat/route.ts`), the first time a message is sent for a
  given client-generated id — not via any explicit "create conversation"
  step.
- Telegram tracks its own separate conversation per user
  (`channel: 'telegram'`, `src/bot/handlers.ts`), continuing the single
  most-recent one indefinitely. This spec does not touch Telegram's
  behavior or expose Telegram conversations in the new web list (explicit
  decision — see Decisions Made below).

## Decisions made during brainstorming

- **Web-only chat list.** The new list shows only `channel = 'web'`
  conversations. Telegram is unaffected and not shown in this list.
- **Delete cancels the run.** Deleting a chat calls `run.cancel()`
  (confirmed available via `workflow/api`'s run object, per
  `node_modules/workflow/docs/api-reference/workflow-errors/workflow-run-cancelled-error.mdx`)
  on the conversation's `workflowRunId` if one exists, before deleting the
  row, so no orphaned run keeps consuming Groq quota after deletion.
- **Lazy creation stays.** "New Chat" does not insert a DB row immediately.
  It only clears client state to a fresh id; the row is created on first
  message exactly as today. This avoids empty ghost conversations from
  users who click "New Chat" and never type anything.
- **Real per-chat URLs.** Routing moves to `/chat/[conversationId]` so each
  chat is bookmarkable and browser back/forward works between chats, not
  just a client-side state swap.

## Schema change

One column on `conversations`:

```ts
pinned: boolean("pinned").notNull().default(false),
```

Applied via `drizzle-kit push` (this project's existing migration
workflow — no separate migration files are checked in; see
`docs/ASSUMPTIONS.md` for why).

`messages.conversationId` and `pending_actions.conversationId` already
have `onDelete: "cascade"` — deleting a `conversations` row cleans up both
automatically. No further schema change needed for delete to be safe.

## API routes (new)

All under `src/app/api/conversations/`, all scoped to
`and(eq(conversations.userId, user.id), eq(conversations.channel, "web"))`
(same auth pattern as every other route — `getCurrentUser()`, never trust
a client-supplied id without a userId match).

- **`GET /api/conversations`** — list the current user's web conversations,
  ordered `pinned DESC, updatedAt DESC`. Returns
  `{ conversations: { id, title, pinned, updatedAt }[] }`.
- **`PATCH /api/conversations/[id]`** — body is
  `Partial<{ title: string; pinned: boolean }>`. Updates only the provided
  fields, scoped to the current user; 404 if the conversation doesn't exist
  or belongs to someone else. Also bumps `updatedAt`.
- **`DELETE /api/conversations/[id]`** — scoped lookup first (userId +
  channel='web'); if `workflowRunId` is set, `getRun(workflowRunId).cancel()`
  wrapped in try/catch (a run that already finished may reject cancel — not
  fatal, proceed to delete regardless); then `DELETE FROM conversations
  WHERE id = ...`. Returns 204.

No `POST /api/conversations` — creation stays implicit inside
`POST /api/chat`, unchanged from today.

## Routing change

- `src/app/(dashboard)/chat/page.tsx` becomes
  `src/app/(dashboard)/chat/[conversationId]/page.tsx`, rendering
  `<ChatPanel conversationId={params.conversationId} />` instead of
  `<ChatPanel />` self-managing its id.
- A new `src/app/(dashboard)/chat/page.tsx` (no id segment) becomes a thin
  redirect: look up the user's most-recently-updated web conversation and
  redirect to `/chat/[thatId]`; if none exist, redirect to
  `/chat/[freshClientGeneratedId]` — since ids are UUIDs generated
  client-side today, the redirect target for a brand-new user needs a
  server-generated UUID instead (`crypto.randomUUID()` works fine
  server-side in a Route Handler/Server Component too).
- Sidebar nav's "Chat" link (`src/components/app-sidebar.tsx`) points at
  `/chat` (the redirector), not a specific id, so it always lands you on
  your latest/newest chat.

## Client-side changes

- `chat-panel.tsx`: drop `getOrCreateConversationId()` and the
  `STORAGE_KEY`/localStorage-based id resolution entirely — the id now
  comes from the route (`conversationId` prop). `STARTED_KEY` (the
  resume-race fix from the earlier session) becomes keyed per conversation
  id rather than a single global flag, since multiple chats now coexist:
  `localStorage.getItem(\`kairo-conversation-started:${conversationId}\`)`.
- New component, `src/components/chat/chat-list.tsx` ("use client"):
  - Fetches `GET /api/conversations` on mount, and re-fetches after any
    mutation (create-via-first-message, rename, pin, delete) and when the
    active conversation's title likely changed (first message sent).
  - Renders a "New Chat" button at top (navigates to
    `/chat/[crypto.randomUUID()]`, no API call), then a "Pinned" section
    (if any pinned chats exist) and a "Recent" section, each item showing
    title (or "New chat" placeholder if `title` is null — a conversation
    row only gets a title once the first message lands), highlighted if
    it matches the current route's `conversationId`.
  - Per-item overflow menu (reusing `dropdown-menu.tsx`, already
    installed): Rename (switches the item to an inline text input, saves
    via `PATCH` on blur/Enter), Pin/Unpin (`PATCH`), Delete (opens the
    existing `alert-dialog.tsx` confirm pattern already used elsewhere in
    the app, then `DELETE`; if deleting the currently-open chat, navigate
    to `/chat` afterward so the user isn't left on a dead route).
  - Replaces the current single "Chat" `SidebarMenuItem` in
    `app-sidebar.tsx`. The other 7 nav items are untouched in this pass
    (sub-project 2 relocates them later).

## Data flow summary

```
Sidebar chat-list.tsx --GET /api/conversations--> list, render
       |                                                  |
       | click chat                                        | click "New Chat"
       v                                                  v
router.push(/chat/[id])                    router.push(/chat/[crypto.randomUUID()])
       |
       v
chat/[conversationId]/page.tsx --renders--> ChatPanel(conversationId)
       |
       v
  existing POST /api/chat / GET /api/chat/stream/[id] flow, unchanged
```

## Error handling

- `GET /api/conversations` failing (network, 401) — chat-list.tsx shows the
  list empty with a small inline retry affordance, consistent with how
  other panels in the app already handle fetch failures (e.g.
  `tool-permissions-panel.tsx`'s "No permission rows yet" pattern) —
  no new pattern invented here.
- `PATCH`/`DELETE` failures — same `res.ok` check + `toast.error(...)` +
  rollback pattern already established this session in
  `tool-permissions-panel.tsx` and the four *-panel.tsx delete handlers.
  Rename input reverts to the previous title on failure; pin toggle
  reverts on failure.
- `run.cancel()` throwing (run already finished, or `WorkflowRunNotFoundError`)
  — caught and ignored; deletion proceeds. The user's intent ("get rid of
  this chat") is satisfied either way.
- Navigating to a `/chat/[id]` that doesn't belong to the current user (or
  doesn't exist) — `ChatPanel`/the page does the same ownership-scoped
  lookup pattern as every other authed route; returns a 404-equivalent
  (redirect to `/chat`, same as the empty-state case), never leaks
  existence of another user's conversation.

## Testing / verification approach

No test suite exists in this repo (confirmed earlier this session). Given
the sandbox here still can't launch a browser reliably, verification is:
`tsc --noEmit`, `eslint`, a full `next build`, and live smoke-testing via
`curl` against the dev server for the new API routes (auth gating, scoped
ownership, correct status codes) — the same practical substitute already
used for prior work in this session. Actual UI click-through (rename, pin,
delete, switching chats) needs to be confirmed by the user in their own
browser, same as the rest of this session's UI work.

## Explicitly out of scope for this spec

- Sidebar restructure, Settings shell, Usage feature (sub-projects 2-4,
  each gets its own spec later).
- Telegram multi-chat / listing Telegram conversations on web.
- Search/filter within the chat list, folders/grouping beyond
  pinned-vs-recent, bulk delete, archiving.
