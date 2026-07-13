# Inline settings sections + real Usage data

Status: approved, ready for implementation planning.

## Context

Sub-project 2 (sidebar restructure + Settings shell,
`docs/superpowers/specs/2026-07-13-sidebar-settings-design.md`) made
Documents/Reminders/Automations/Calendar/Memory/Integrations/Activity
launcher-only: clicking one closed the Settings dialog and navigated to
that section's existing full-page route. After using it, the user wants
all ten sections (Account/General/Usage plus these seven) to render
inline in the dialog the same way, with no navigation away. They also
want the Usage tab to show real Groq quota data instead of "Coming soon".

## Current state

- `src/components/settings/settings-dialog.tsx` has `INLINE_SECTIONS`
  (account/general/usage, rendered inline) and `LINK_SECTIONS` (the
  other 7, rendered as `<button onClick={() => openLink(href)}>` that
  closes the dialog and `router.push()`es to the standalone page).
- Five of the seven standalone pages are a thin wrapper: `<PageHeader/>`
  plus one self-contained `"use client"` panel component that fetches
  its own data (`DocumentsPanel`, `RemindersPanel`, `AutomationsPanel`,
  `MemoryPanel`, `ActivityPanel`). These need no backend changes to
  render inline.
- `calendar/page.tsx` is an `async` Server Component: calls the
  `calendarView` tool directly, catches `CalendarNotConnectedError`,
  renders `<CalendarEvents events={...}/>` or a "not connected" empty
  state. This data-fetching can't run inside a client-rendered dialog
  tab.
- `integrations/page.tsx` is an `async` Server Component: one DB read
  (`integrations` table, `provider = 'google_calendar'`) to get
  `calendarIntegration?.status`, passed as a `connected` boolean prop to
  `<GoogleCalendarCard>`. `<TelegramLinkForm>` and
  `<ToolPermissionsPanel>` are already self-contained `"use client"`
  components needing no props.
- No token/usage tracking exists anywhere in the codebase. `src/lib/llm.ts`
  wraps a single shared Groq API key (`getChatModel()` via `@ai-sdk/groq`).
  `src/workflows/steps/model-call.ts::callModel` is the one place that
  calls `generateText`.
- Redis is already wired (`src/lib/redis.ts::getRedis()`, `Redis.fromEnv()`),
  used today by `src/lib/idempotency.ts` for short-lived keys.

## Decisions made during brainstorming

- **All 10 sections render inline.** The left rail becomes one uniform
  list of plain buttons switching `active` state — no more
  `LINK_SECTIONS`/`href`/`router.push`/dialog-closing-on-click.
- **Calendar and Integrations get thin client-fetch wrappers**, matching
  the pattern `GeneralSection` already uses for `/api/model`: a new API
  route returns the same data the page used to fetch server-side, and a
  new section component fetches it in a `useEffect` and renders the
  same existing presentational components.
- **The 7 standalone pages are deleted** (`documents/page.tsx`,
  `reminders/page.tsx`, `automations/page.tsx`, `calendar/page.tsx`,
  `memory/page.tsx`, `integrations/page.tsx`, `activity/page.tsx`).
  Nothing in the app links to them anymore once they're inline. The
  panel/card components they wrapped are **not** deleted — they get
  imported into the new settings sections instead.
- **Usage tab shows Groq's real rate-limit data, not an invented number.**
  Verified against Groq's docs (see below): Groq's `x-ratelimit-*`
  response headers give **requests per day** and **tokens per minute** —
  there is no single "tokens per day" figure exposed by the API. Rather
  than force that into a "daily token limit" framing that doesn't match
  reality, the Usage tab shows both real figures, correctly labeled:
  requests remaining today (with reset time) and tokens remaining this
  minute (with reset time).
- **Snapshot captured from the most recent chat request, not a live
  poll.** `callModel` already calls `generateText` on every model
  turn; after each call it writes the response's rate-limit headers to
  Redis. The Usage tab reads that snapshot. No new DB table, no
  additional network calls when the tab is opened, and no cost — Groq
  returns these headers on every response for free.
- **Reset value converted to an absolute timestamp at capture time.**
  Groq's `x-ratelimit-reset-requests`/`-tokens` headers are duration
  strings (e.g. `"2m59.56s"`) measured from when that response was
  generated, not from when the Usage tab is later opened. Storing the
  raw duration and displaying it verbatim would be wrong by the time
  the user looks — it's converted to `Date.now() + durationMs` at
  capture time and stored as an ISO timestamp, so "resets in Xm" is
  computed freshly on every read.

## Groq rate-limit headers (verified against Groq's docs)

| Header | Meaning |
|---|---|
| `x-ratelimit-limit-requests` | Requests per day (RPD) |
| `x-ratelimit-remaining-requests` | Requests remaining today |
| `x-ratelimit-reset-requests` | Duration string until the daily request quota resets |
| `x-ratelimit-limit-tokens` | Tokens per minute (TPM) |
| `x-ratelimit-remaining-tokens` | Tokens remaining this minute |
| `x-ratelimit-reset-tokens` | Duration string until the per-minute token quota resets |

All six are plain strings on the HTTP response; the two `limit`/`remaining`
pairs parse as integers, the two `reset` values parse as durations
(`"2m59.56s"`, `"7.66s"`).

## New pieces

- **`src/lib/usage-snapshot.ts`** — `parseGroqDuration(s: string): number`
  (duration string → milliseconds; must handle optional hour/minute/second
  components since the daily request-reset duration can span up to 24h,
  e.g. `"23h59m1s"`, not just the short `"2m59.56s"`/`"7.66s"` forms seen
  for the per-minute token reset), `writeUsageSnapshot(headers: Record<string,
  string | undefined>): Promise<void>` (extracts the 6 headers, converts
  both reset values to absolute ISO timestamps, writes one JSON blob to
  a fixed Redis key `usage:groq:latest`, silently no-ops if the expected
  headers aren't present rather than throwing), `readUsageSnapshot():
  Promise<UsageSnapshot | null>`.
- **`GET /api/usage`** — calls `readUsageSnapshot()`, returns the
  snapshot JSON or `{ available: false }` if none exists yet (e.g. no
  chat sent since the last deploy).
- **`GET /api/calendar/upcoming`** — same 7-day `calendarView` call
  `calendar/page.tsx` makes today, catches `CalendarNotConnectedError`
  and returns `{ connected: false }`, otherwise `{ connected: true,
  events: [...] }`.
- **`GET /api/integrations/status`** — the same DB read
  `integrations/page.tsx` makes today, returns `{ calendarConnected:
  boolean }`.
- **Settings dialog sections** (all in `settings-dialog.tsx` alongside
  the existing `AccountSection`/`GeneralSection`): `DocumentsSection`
  (renders `<DocumentsPanel/>`), `RemindersSection`
  (`<RemindersPanel/>`), `AutomationsSection` (`<AutomationsPanel/>`),
  `CalendarSection` (fetches `/api/calendar/upcoming`, renders
  `<CalendarEvents/>` or the not-connected empty state inline, no more
  `<Link>` to `/integrations` — becomes a `setActive("integrations")`
  call since Integrations is now also inline), `MemorySection`
  (`<MemoryPanel/>`), `IntegrationsSection` (fetches
  `/api/integrations/status`, renders the existing 3 `<Card>`s with
  `<TelegramLinkForm/>`, `<GoogleCalendarCard connected={...}/>`,
  `<ToolPermissionsPanel/>`), `ActivitySection` (`<ActivityPanel/>`).

## Changes to existing files

- **`src/workflows/steps/model-call.ts`** — after `const response =
  await result.response;`, call `await writeUsageSnapshot(response.headers
  ?? {})` before returning. Fire this inside the step (steps have full
  Node/network access already); await it so a Redis hiccup surfaces in
  the step's own retry behavior rather than silently vanishing.
- **`src/components/settings/settings-dialog.tsx`** — replace
  `INLINE_SECTIONS`/`LINK_SECTIONS`/`openLink` with one `SECTIONS` array
  (10 entries, all rendered the same way as buttons), replace the
  `LINK_SECTIONS.map` render block in `<nav>` with the same button
  pattern used for the current `INLINE_SECTIONS`, add the 7 new section
  components, replace `UsageSection`'s "Coming soon" body with the real
  fetch + display described above.

## Data flow

```
callModel (every chat turn)
  |
  v
generateText -> response.headers (Groq's x-ratelimit-* headers)
  |
  v
writeUsageSnapshot() -> Redis key "usage:groq:latest"
                          (limit/remaining for requests+tokens,
                           reset times as absolute ISO timestamps)

Settings dialog -> Usage tab opened
  |
  v
GET /api/usage -> readUsageSnapshot() -> Redis
  |
  v
render: "Requests today: remaining/limit, resets in Xh Ym"
        "Tokens this minute: remaining/limit, resets in Xs"
```

```
Settings dialog -> Calendar tab opened
  |
  v
GET /api/calendar/upcoming -> calendarView() tool call (7-day window)
  |
  v
{ connected: false } -> not-connected empty state (button switches to
                         active="integrations" instead of navigating)
{ connected: true, events } -> <CalendarEvents events={events} />
```

## Error handling

- `GET /api/usage` with no snapshot yet (fresh deploy, no chat sent) —
  Usage tab shows "No usage data yet — send a message first."
- `writeUsageSnapshot` — if Groq's response is missing the expected
  headers (provider change, API change) it silently no-ops rather than
  throwing; a chat turn's success never depends on the snapshot write
  succeeding.
- `GET /api/calendar/upcoming`/`GET /api/integrations/status` failing —
  each section shows "Unavailable", matching the existing pattern in
  `GeneralSection` for `/api/model`. Not auth-exempted beyond the
  existing default (both are read-only, scoped to the signed-in user
  via `getCurrentUser()`).

## Testing / verification approach

Same practice established this session: `tsc --noEmit`, `eslint`, `next
build`, `curl` for each new route's auth gate and response shape. No
test suite exists in this repo; none introduced here. Manual
click-through (open each of the 10 sections, confirm none navigate away
or close the dialog, confirm Calendar/Integrations/Usage show real data
after at least one chat message has been sent) needs to be confirmed by
the user in their own browser, same as the last two sub-projects.

## Explicitly out of scope for this spec

- Any change to what each panel/card component actually does — only
  their entry point moves.
- A self-tracked daily-token counter (considered and explicitly
  rejected in favor of Groq's real headers).
- Historical usage graphs/trends — this is a live snapshot of the most
  recent call only.
- Handling Groq API changes to header names/format beyond the
  defensive no-op described above.
