# Implementation Assumptions

Per the project's development rule "any assumption made during implementation
must be documented," this file tracks non-obvious decisions and the reasoning
behind them, updated as each phase is built.

## Post-Phase-7 — First deploy

**Vercel Hobby (free) plan only allows daily cron schedules** — the
original `*/5 * * * *` and `*/15 * * * *` expressions in `vercel.ts`
failed the entire deploy outright (`"Hobby accounts are limited to daily
cron jobs"`), not just a warning. Given the project's $0 constraint,
fixed by moving all three crons to once-daily, staggered 15 minutes apart
(`check-reminders` 03:00 UTC, `expire-confirmations` 03:15, `run-
automations` 03:30) rather than suggesting a Pro-plan upgrade. Real
tradeoff, not just a cosmetic change: reminder delivery and confirmation
suspension are unaffected (both are driven by each workflow's own
`sleep()`/hook, independent of cron — these three routes are safety
nets/batch sweeps only), but a pending confirmation now stays visibly
"pending" for up to 24h past its 15-minute expiry before the sweep
catches it, and any automation scheduled finer than daily (e.g. an
hourly digest) won't fire at that granularity — it'll only be checked
once a day. Worth revisiting if the user ever upgrades to Pro.

**First production deploy**: `https://kairo-pa.vercel.app` (Vercel
auto-aliased this from the project name). `APP_BASE_URL` and
`GOOGLE_OAUTH_REDIRECT_URI` were added to Vercel's env vars *after* the
first deploy, which does not retroactively apply to a running
deployment — a second `vercel --prod` was required before those values
took effect. `/api/health` confirmed `{"db":"ok","redis":"ok"}` on the
live URL. Telegram webhook registered against the production URL via
`setWebhook` + confirmed via `getWebhookInfo` (zero pending updates,
correct URL). Google Calendar OAuth still needs the production redirect
URI (`https://kairo-pa.vercel.app/api/integrations/google-calendar/
callback`) added as an authorized redirect URI in the Google Cloud
Console OAuth client — that's a manual step in Google's console, not
something settable via API/CLI from here.

## Post-Phase-7 — Exhaustive scenario testing + security audit

No test framework is configured in this project (no vitest/jest, no
`*.test.ts` files) — verification throughout this build has consistently
used the temporary-diagnostic-route pattern instead (create → exercise
real code paths → assert on DB state → delete route + revert `proxy.ts`
exclusion). Continued that pattern here: 30 direct DB/schema-level
scenario checks (all passed) plus two real end-to-end tests through the
actual LLM tool-calling loop, then a security sweep across the whole API
surface.

**Bug found by testing, not by inspection**: `memoryStoreInputSchema` and
`memoryUpdateInputSchema` had no defense against a NUL byte (U+0000) in
`content`. Postgres TEXT columns reject NUL bytes outright
(`invalid byte sequence for encoding "UTF8": 0x00`), and NUL is a
perfectly valid JS/Unicode string character that `z.string().min(1)`
happily accepts — so a stray NUL byte anywhere in tool-call content or a
PATCH body would crash with a raw, unhandled DB driver error. Fixed with
a `.refine()` on both schemas rejecting any string containing a NUL byte,
so it now surfaces as a clean 400/validation error at the tool-call level
instead. Live-verified via `safeParse()` against a NUL-containing string
end to end.

**Race condition found and fixed**: `resolvePendingAction()`
(`src/workflows/steps/confirmation.ts`) did an unconditional `UPDATE ...
WHERE id = ?`, called only after each caller's own separate `SELECT`
confirmed `status = 'pending'` — so two concurrent approve/reject
requests for the same `pending_actions` row (a double-click, a client
retry) could both pass their stale read and both call
`confirmationHook.resume()`, double-processing one confirmation. Fixed by
making the UPDATE itself conditional on `status = 'pending'` and
returning whether THIS call was the one that won; all three call sites
(`/api/confirmations/[id]/approve`, `/api/confirmations/[id]/reject`,
and the Telegram `confirm_approve`/`confirm_reject` action handler in
`src/bot/handlers.ts`) now check that return value and skip resuming the
hook if they lost the race. Live-verified with two concurrent
`resolvePendingAction()` calls on the same row — exactly one won.

**Considered and explicitly NOT fixed**: whether a Telegram user could
resolve another user's `pending_actions` row by guessing/leaking its
UUID and crafting an `onAction` event. Traced through: Telegram's
`callback_data` is bot-controlled and echoed back verbatim only by the
client that received that exact button in that exact chat — a user
cannot fabricate an arbitrary `callback_data` value through normal
Telegram UI, and the webhook itself is already secret-token-authenticated
(Phase 2). Concluded this isn't practically exploitable and left
`src/bot/handlers.ts`'s `onAction` handler as-is rather than adding an
identity check against an uncertain part of the Chat SDK's type surface
for a gap that isn't actually reachable.

**Security sweep results** (all clean, no fixes needed): every API route
under `src/app/api/**` scopes its DB queries by `getCurrentUser()`'s
`user.id` (verified by grepping every route file) or `verifyCronRequest`/
`verifyWebhook` for the three non-user-facing route classes (cron,
Telegram webhook, Clerk webhook) — no IDOR gaps found beyond the
already-known, already-accepted "mutating statement doesn't itself
re-check ownership" pattern (safe given UUID PKs with no
userId-reassignment path, same reasoning as the earlier code-review
fix). SQL injection: a literal `'; DROP TABLE memories; --` stored as
`memory_store` content round-trips as inert data via drizzle's
parameterized queries — confirmed live, table still exists after. XSS:
zero uses of `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere in
`src/`, so React's default escaping protects every place memory content
is rendered. Secrets: fresh grep sweep of every git-trackable file for
common API key shapes plus `.env.local`'s git status — clean, matches
the Phase 7 scan.

**Tooling caveat for future sessions in this environment**: writing a
literal NUL-byte escape sequence, or a JS template literal containing
`` ` ``/`${...}`, directly into a file-write tool call's content can get
silently mangled somewhere in the write pipeline (observed: a NUL escape
became an actual raw `0x00` byte on disk; a `` `before${nulByte}after` ``
template literal had its interpolated portion stripped entirely,
apparently shell-expanded as if `${nulByte}` were a bash variable
reference). Root-caused via `python3 -c "... data.find(b'\x00') ..."`
byte-level inspection after `grep`/`file` reported the file as binary.
Workaround used here: write such content via a standalone Python script
(`open(path, "wb").write(...)`) with the special bytes constructed via
`String.fromCharCode(0)`-equivalent logic or string concatenation instead
of literal escapes/template interpolation, invoked as `python3
script.py` — never inline in a `bash -c` string. Worth remembering if a
future task needs to generate test fixtures containing control
characters or template-literal-heavy source.

## Post-Phase-7 — Code review fixes on the memory feature

A multi-agent code review of the Phase 6 memory feature (`/code-review`,
8 finder angles + verification pass) surfaced 8 findings, all fixed and
live-verified in the same session:

- **`PATCH /api/memory/[id]` had zero validation** — it copied any of
  `content`/`category`/`sensitivity`/`approved` straight from the request
  body into a DB update, with no zod schema. `content: null` could crash
  with an unhandled NOT NULL violation; arbitrary `sensitivity` strings
  bypassed the normal/sensitive enum the rest of the system relies on;
  and — most seriously — `approved: true` let a caller flip a memory
  straight into the agent-visible set without ever going through
  `runTool()`'s confirmation gate, which is the exact bypass
  `memoryStore()`'s own header comment says shouldn't exist. Fixed by
  adding `memoryUpdateInputSchema` to `src/tools/schemas.ts` —
  deliberately excluding `approved` entirely, so the field is silently
  stripped by `.safeParse()` rather than accepted.
- **Idempotency keys for mutating tools didn't include the tool
  arguments** (`${requestId}:${toolName}` only) — two distinct calls to
  the same mutating tool in one turn (e.g. "forget my old address and my
  old phone number") collided on the same key, so the second legitimate
  action was wrongly rejected as a duplicate. Fixed with a pure-JS FNV-1a
  hash of the JSON-stringified input folded into the key
  (`src/tools/registry.ts::hashInput`) — pure JS with no imports because
  `executeTool()` runs at the workflow level, not inside a `"use step"`
  function, so Node's `crypto` module isn't available there.
- **`memoryDeleteInputSchema.memoryId` had no `.uuid()`** — a malformed
  id reached Postgres as a bound parameter against a `uuid` column and
  crashed with a raw driver error instead of the intended friendly
  "not found" path. Fixed by adding `.uuid()`.
- **Select-then-delete/update double round trips, and the mutating
  statement itself not re-checking ownership** — both
  `src/tools/memory.ts::memoryDelete` and the `PATCH`/`DELETE` handlers
  in `src/app/api/memory/[id]/route.ts` did a `SELECT` to check
  ownership, then a separate `UPDATE`/`DELETE` filtered only by `id`.
  Not currently exploitable (UUID PKs, nothing ever reassigns a row's
  `userId`), but collapsed into single `UPDATE/DELETE ... WHERE id = ?
  AND userId = ? RETURNING`, treating an empty result as "not found" —
  one round trip instead of two, and the mutating statement now enforces
  ownership itself rather than relying entirely on a prior read.
- **`getRiskLevel()`'s accumulating `if (name === ...)` branches**
  refactored into a `DYNAMIC_RISK_RULES` map keyed by tool name, so
  adding a new tool's risk-escalation rule no longer means editing a
  shared function that every other tool's rule also lives in.
- **`memory-panel.tsx` refetched the entire memory list after every
  single-row edit/delete** instead of updating local state from the
  mutation's own response — fixed to use `setRows` directly.
- **The category/sensitivity enum values were duplicated three times**
  (twice in `schemas.ts`, once in `memory-panel.tsx`) — factored into
  `src/lib/memory-constants.ts`, a dependency-free file so the client
  component doesn't pull `zod` into the browser bundle by importing
  from `schemas.ts`.
- **`memoryStore()`'s `approved: true`** is a deliberate, correct choice
  for its one current caller (confirmed by grep: it's the only write
  path into `memories`) but silently forecloses the review step the
  `approved` column's `false` default and `documents`/`document_chunks`
  tables' presence suggest a future write path (e.g. document-ingestion
  fact extraction) was meant to use. Left as-is functionally — no second
  write path exists yet to fix — but strengthened the header comment
  into an explicit warning against copying the pattern for such a path.

**Verified live** (not just clean `tsc`/`eslint`/`next build`): a
temporary diagnostic route directly exercised `memoryUpdateInputSchema`
and `memoryDeleteInputSchema`'s `.safeParse()` against the exact bad
inputs described above, and ran the fixed `UPDATE`/`DELETE ... WHERE id
= ? AND userId = ?` queries with a second user's id to confirm they
affect zero rows against another user's memory. All checks passed.
Diagnostic route deleted and `proxy.ts`'s temporary exclusion reverted
afterward, same as every other phase's live-testing pattern in this file.

## Phase 7 — Open-source readiness

- **LICENSE copyright holder**: filled in as the project owner's inferred
  name (no name was ever given explicitly in this build; derived from the
  account email's local part) rather than left as a generic placeholder —
  reasonable for a personal single-owner repo being open-sourced by its
  actual author, but worth a quick glance before the first public push in
  case that inference was wrong.
- **Secret scan performed**: `git status` confirms `.env.local` has never
  been a trackable file (correctly matched by `.gitignore`'s `.env*` /
  `!.env.example` pair — see the Phase 0 note on this file); grepped every
  untracked-and-would-be-added file for common API key shapes (`gsk_`,
  `sk-`, `AIza`, `xox[baprs]-`, PEM private key headers) and generic
  `*_KEY/SECRET/TOKEN = "..."`-style hardcoded assignments in `src/` — zero
  matches. No history to scan yet since this repo has no commits.
- **README rewritten from the `create-next-app` boilerplate** into a full
  setup guide (architecture summary, prerequisites, numbered signup/deploy
  steps for every Marketplace/free-tier service, a cost table, and a
  "known limitations" section pulled from the phase notes above) — the
  `.env.example` file itself was already complete and well-commented from
  Phase 0 onward and needed no changes.

## Phase 6 — Memory tools + management UI

**`memories.approved` is set `true` at insert time by `memory_store`, not
via a separate approval step**: the plan's original design implied a
distinct "agent proposes, user approves" flow, but Phase 5's confirmation
gate already *is* that approval — `memory_store` is MEDIUM risk by
default (confirm required unless the user explicitly turned it off) and
HIGH risk whenever `sensitivity: "sensitive"` (always confirmed, no
override, enforced via `getRiskLevel()` in `src/tools/registry.ts`
escalating to `"HIGH"` before `runTool()`'s gate runs). By the time
`memoryStore()` in `src/tools/memory.ts` actually inserts a row, user
approval has already happened one layer up — inserting as
`approved: false` and waiting for a second, separate approval would be
redundant. `memory_view` (the agent's read path) still filters on
`approved = true AND user_id = current user`, so the column keeps its
intended meaning; it just never sits at `false` for anything the agent
itself wrote.

**`/api/memory/export` streams JSON directly instead of round-tripping
through Vercel Blob**: the plan's section 8 said "bundles to Blob, returns
download link," but Blob's `access: 'private'` URLs (used everywhere else
in this codebase for user-owned files — see `src/workflows/steps/
ingest.ts`'s `get()` call) aren't fetchable by the browser without the
app's own server-side token; a client can't just `fetch(blob.url)` the way
`access: 'public'` blobs work. Making the export public would mean an
indefinitely-guessable-by-URL copy of the user's data sitting in public
Blob storage. Simpler and more correct: the route computes the export
payload and returns it directly as the response body with a
`Content-Disposition: attachment` header — no Blob write, no orphaned
export files to ever clean up, same JSON result. The `@vercel/blob`
`get()`-based private-read pattern is still correct for documents (which
are read *server-side* by the ingestion workflow, never handed a URL to
the browser) — this is specifically about not exposing a private blob URL
to a client.

**Groq (`llama-3.3-70b-versatile`) intermittently fails tool calls with
`AI_APICallError: Failed to call a function. Please adjust your prompt.`**
— hit live once during this phase's testing (first `memory_store` attempt
with a longer, more complex sentence), succeeded immediately on retry with
a similar prompt. This is a `FatalError` at the workflow level (the model
produced a function call Groq's own API couldn't parse as valid JSON
against the schema), not caused by anything specific to the memory tool
schemas — `tsc`/schema shape were unchanged between the failing and
succeeding calls. Documented here as a known characteristic of Groq's
free-tier Llama tool-calling reliability, not a bug to fix: the workflow
run fails cleanly (no partial state, no silently-lost user message — the
row is still in `messages`), and the user can simply retry. Worth
revisiting later if it happens often enough in real use to warrant an
automatic single retry at the `callModel` step level.

**Live-verified via the same temporary-diagnostic-route pattern as Phase
5** (`/api/dev-smoke-test`, created and fully removed within this
session, `proxy.ts` exclusion added and reverted alongside it): a normal
memory ("favorite color is blue") correctly suspended at MEDIUM and, once
approved via a real `confirmationHook.resume()` call, produced a
`memories` row with `approved: true`; a sensitive memory ("I have asthma")
correctly escalated to HIGH risk and required the same real approval
before being stored. `/api/memory`, `/api/memory/[id]`, and
`/api/memory/export` (all Clerk-authed) were not live-browser-tested —
same sandbox limitation as every other authed web route in this build (no
working Chromium here, see the Phase 1 note); verified structurally
instead via clean `tsc --noEmit`/`eslint` and by matching the exact
request/response shape of the already-verified `reminders`/`documents`
routes they were modeled on.

## Phase 5 — Confirmation/risk/audit system, live-verified end to end

**All three confirmation-gate outcomes verified live** via a temporary
diagnostic route (`/api/dev-smoke-test`, created and deleted within this
session, `proxy.ts`'s matcher temporarily excluded it and was reverted
afterward) that actually called `confirmationHook.resume()` — not just
updated the `pending_actions` row directly, which would only prove the DB
write path, not that the suspended `runTool()` `await hook` in the real
workflow run actually wakes up and resumes execution:

- **Approve**: `reminder_create` (MEDIUM risk) suspended the workflow,
  `pending_actions` row created with `status='pending'`; resuming the hook
  with `{ approved: true }` woke the run, `reminders` row was created with
  a real `workflow_run_id` (proving `reminderWorkflow` itself started), and
  `pending_actions.status` flipped to `approved`.
- **Reject**: resuming with `{ approved: false }` threw `ActionRejectedError`
  inside `runTool()` as designed, `audit_logs` recorded `tool.execute` /
  `cancelled` / `confirmation_status: rejected`, and no `reminders` row was
  created.
- **Expire**: backdated a `pending_actions.expires_at` into the past, hit
  `/api/cron/expire-confirmations` with the `CRON_SECRET` bearer token,
  confirmed it (1) marked the row `expired`, (2) called
  `confirmationHook.resume(token, { approved: false })` itself so the
  suspended workflow doesn't hang forever, and (3) the conversation's
  assistant turn correctly reported the action was cancelled.

**Found and fixed during this testing, not before**: the model would
retry a rejected `reminder_create` call with identical arguments on the
very next round — three rejections in a row before `MAX_TOOL_ROUNDS = 5`
finally forced a final text response. Not a confirmation-system bug (every
attempt still correctly required and got a fresh confirmation, nothing
ever executed without approval) but bad UX — a user who says "no" once
would be asked again immediately. Fixed by adding an explicit instruction
to `BASE_SYSTEM_PROMPT` in `src/lib/llm.ts`: if a tool result indicates
the user rejected/declined confirmation, treat it as final for the turn
and don't retry with the same/similar arguments. Re-tested after the fix:
a single rejection now produces a clean "cancelled" reply on the very next
round instead of retrying.

**`CRON_SECRET` was present in `.env.example` but missing from the actual
local `.env.local`** — `verifyCronRequest()` (`src/lib/cron-auth.ts`)
fails closed (returns `false`, i.e. 401) when the env var is unset, so
this was caught immediately as a 401 rather than silently passing. Every
fork must set a real value for both local testing and the deployed Vercel
Cron target (Vercel automatically sends `CRON_SECRET` as a bearer token to
cron-triggered routes when the env var is configured on the project).

**Testing note**: verifying a `createHook()`/`resumeHook()` suspend-resume
pair requires actually calling the resume API (`confirmationHook.resume()`
here, or `resumeHook()`/`resumeWebhook()` generally) — a raw SQL update of
whatever DB row models the pending state proves nothing about the
workflow run itself, since the two are only related by application logic,
not a DB constraint. Caught this gap mid-session before treating an
incomplete DB-only check as verification.

## Critical bug: tool schemas silently emptied when co-located with a "use workflow" import (Phase 4)

**Symptom:** every `reminder_create`/`reminder_list`/`reminder_cancel` tool
call failed with `AI_APICallError: Tool call validation failed ... errors:
[additionalProperties 'title', 'dueAt' not allowed]` — a real Groq API
rejection, reproduced identically across two different models
(`llama-3.3-70b-versatile` and `openai/gpt-oss-120b`), so not a model
quality issue. Calendar/rag/web-search tools (10 tools total sent per
call) worked fine throughout.

**Root cause, found by adding a logging `fetch` into `createGroq()` and
inspecting the actual outgoing request body:** the JSON Schema Groq
received for the three reminder tools was `{"type":"object","properties":
{},"additionalProperties":false}` — completely empty `properties`, despite
the zod schemas being correctly defined with `title`/`dueAt`/etc. A
standalone Node script calling `generateText()` with the exact same schema
worked perfectly, isolating the bug to something specific about running
*inside a workflow step's bundle*.

The schemas lived in `src/tools/reminders.ts`, which also imports
`reminderWorkflow` (marked `"use workflow"`) to call `start(reminderWorkflow,
...)`. `src/tools/calendar.ts` has the exact same shape (zod schemas +
`"use step"` functions in one file) but does *not* import anything
`"use workflow"`-marked, and its schemas serialized correctly. That was the
only structural difference between the failing and working tool files.
Working theory: the Workflow DevKit bundler's module-splitting for files
that reference a `"use workflow"` function stubs out or empties the rest of
that module's exports when the module is pulled into a *different* step's
bundle (here, `src/workflows/steps/model-call.ts`, importing
`TOOL_DESCRIPTORS` which re-exported the schema consts from
`reminders.ts`) — not confirmed against Workflow DevKit's source, but the
fix below eliminates the symptom completely and is a sound pattern
regardless of the exact mechanism.

**Fix:** every tool input schema now lives in one dedicated file,
`src/tools/schemas.ts`, which imports nothing `"use step"` or `"use
workflow"` — just `zod`. Tool implementation files (`reminders.ts`,
`calendar.ts`, `rag.ts`, `web-search.ts`) import the schema *types* only
(`import type { z } from "zod"`, `import type { xInputSchema } from
"./schemas"`) for their own `z.infer<>` parameter typing, never the
runtime schema value. `src/tools/registry.ts` (used by both the
`model-call` step and `executeTool`'s dispatch) imports the real runtime
schemas from `./schemas` directly, never through a tool-implementation
file. **Rule going forward: never export a zod schema const from a module
that also imports a `"use workflow"`-marked function** — put schemas in
schema-only files.

Also fixed in the same pass:
- `z.string().email()` (on `calendar_create`'s `attendees` field) →
  plain `z.string()`. Zod's email regex uses a lookahead
  (`(?!\.)(?!.*\.\.)...`) that Groq's JSON Schema validator rejects
  outright as "not valid regex" — and since ALL tool schemas are sent on
  every model call, one bad regex broke every tool, not just
  `calendar_create`. Validated at the Google Calendar API layer instead.
- `writeAuditLog()` (`src/lib/audit.ts`) and `claimIdempotencyKey()`
  (`src/lib/idempotency.ts`) needed `"use step"` added — `runTool()`
  (`src/lib/tool-runtime.ts`) runs at the *workflow* level (deliberately,
  so Phase 5 confirmation hooks can suspend there), and these two
  functions do direct Neon/Upstash calls. Without the directive, the
  bundler inlined the Redis/Neon client's module code directly into the
  workflow's sandboxed VM, which is missing Node/web globals (e.g.
  `EventTarget`) those clients need at *import* time — surfaced as
  `ReferenceError: EventTarget is not defined` before any of the above
  schema bug was even reached. Same fix applied to a new
  `isToolEnabled()` step inside `tool-runtime.ts` for the permission-check
  DB read.

**Verified live, end to end, after all of the above fixes**: via a
temporary diagnostic route (`/api/dev-smoke-test`, created and deleted
within this session, temporarily added to and removed from `proxy.ts`'s
public-route matcher alongside it) — sent "Set a reminder called 'smoke
test' for 30 seconds from now" through the real chat workflow, confirmed
in Postgres that (1) the tool call executed and `reminders` row was
created with correct `title`/`due_at`, (2) `audit_logs` shows a clean
`in_progress` → `completed` pair, (3) ~40 seconds later the reminder's
`status` had flipped to `completed` on its own — proving the
`sleep()`-based `reminderWorkflow` actually fired at the right time and
delivered. This is the first fully-verified live tool call in the build.

**Also encountered while debugging (not a code bug, a testing artifact):**
editing source files while a workflow run from a previous test was still
settling produces `REPLAY_DIVERGENCE` → `CorruptedEventLogError` — Workflow
DevKit detects the running code changed mid-replay and (correctly) refuses
to continue that specific orphaned run. Not a real issue; just don't judge
a test result from a run that overlapped a file edit — let the dev server
fully settle (no more `[Workflow]` log lines) before reading results.

## Architecture pivot: manual tool loop instead of DurableAgent (Phase 3)

**This supersedes the original Phase 1 plan to use `@workflow/ai`'s
`DurableAgent`.** Discovered via a live smoke test (see below) — DurableAgent
was implemented, typechecked, and built cleanly, but failed at runtime on
the very first real request.

**What broke:** `DurableAgent`'s internal model call (`doStreamStep`) is
itself a `"use step"` function, and the `model` field is passed to it as a
step *argument*. Workflow DevKit requires all step arguments to be
serializable (plain objects/arrays/primitives — see
`node_modules/workflow/docs/errors/serialization-failed.mdx`). A live call
failed with `Serialization failed { problematicValue: [AsyncFunction: model] }`
the moment `model: async () => groq(...)` (the function form documented in
`DurableAgentOptions`) actually executed — the function value itself can
never cross that boundary, named or anonymous, regardless of what it
closes over.

The *string* form of `model` (e.g. `"anthropic/claude-opus"`) avoids this
because `doStreamStep` resolves strings via `gateway(modelInit)` — Vercel's
AI Gateway — internally, inside the step, so no function crosses the
boundary. But: `curl -s https://ai-gateway.vercel.sh/v1/models` shows Groq
is **not a provider in Gateway's catalog at all** (checked live, zero
results for `owned_by: groq`), and **zero models in the entire 309-model
catalog have $0 pricing** — every model, including `meta/llama-3.3-70b`,
carries real per-token pricing. So the string form was never a viable $0
path either, independent of the Groq-specific gap.

**Net effect: `DurableAgent`'s architecture requires either Gateway (paid)
or a model-factory function (which doesn't actually work in this package
version) — there was no working way to keep it and guarantee $0 cost.**

**Fix:** tool calling is implemented manually instead, split so the parts
that need Node.js/network access are steps and the parts that need to
suspend the workflow (future confirmation gating) stay at the workflow
level:

- `src/workflows/steps/model-call.ts::callModel()` — a step. Constructs
  `groq(...)` *fresh, inside the step* every call (never passed in), calls
  AI SDK's `generateText()` directly with tool descriptors (no `execute`
  attached — this step only plans, it doesn't run tools), returns plain
  serializable data (`responseMessages`, `toolCalls`).
- `src/tools/registry.ts::executeTool()` — plain workflow-level function
  (not a step). Dispatches by tool name to the tool's own step (e.g.
  `ragSearch`). Runs at the workflow level specifically so Phase 5's
  confirmation-gated tools can call `createHook()`/`await hook` here later
  — steps cannot use hooks or `sleep()`.
- `src/workflows/steps/write-stream.ts::writeAssistantText()` — a step.
  Writes one assistant turn to the UI message stream as a single
  text-start/text-delta/text-end sequence.
- `src/workflows/conversation.ts::runAgentTurn()` — plain workflow-level
  function orchestrating the above in a loop (call model → if tool calls,
  execute each via `executeTool` and feed results back → repeat, capped at
  `MAX_TOOL_ROUNDS = 5`).

**Known regression from this pivot:** no token-level streaming. The
original DurableAgent version streamed text as the model generated it;
`generateText()` (non-streaming) buffers the full response before
`writeAssistantText` sends it as one chunk — the UI still updates live
(new messages appear), just not word-by-word within a message. Revisit if
`@workflow/ai` fixes function-model serialization in a future version, or
if manual token streaming is worth the added complexity later.

`ai@6` / `@ai-sdk/groq@3` / `@ai-sdk/google@3` pinning (below, under Phase
1/3) still applies — `generateText` and `embedMany`/`embed` are ordinary
`ai` package exports, unaffected by the DurableAgent removal.

**Live verification:** a temporary diagnostic route (`/api/dev-smoke-test`,
deleted after use — added and removed from `proxy.ts`'s public-route list
alongside it) created a throwaway user/workspace/conversation, started
`conversationWorkflow` with a real `GROQ_API_KEY`, and confirmed via direct
Postgres query that the model actually replied ("smoke test ok", to a
"reply with exactly the words..." prompt) and both turns persisted
correctly. This is the first real (non-structural) verification in the
whole build — see the old "Not yet verified end-to-end" note this replaces.

Still not live-verified: `GOOGLE_GENERATIVE_AI_API_KEY` (embeddings —
`rag_search` will error until this is set) and `TELEGRAM_BOT_TOKEN` (no bot
created yet). Both are structurally correct (clean `tsc`/`eslint`/`next
build` throughout, including with these vars unset) but unexercised live.

## Phase 3 (remaining, non-superseded notes)

- **`GOOGLE_GENERATIVE_AI_API_KEY`, not `GEMINI_API_KEY`**: matches
  `@ai-sdk/google`'s actual default env var name.
- **`gemini-embedding-001` truncated to 768 dims via `outputDimensionality`,
  not a naturally-768-dim model**: the plan's original guess
  (`text-embedding-004`) is superseded in the currently-installed
  `@ai-sdk/google@3.0.91`'s model ID union — `gemini-embedding-001` natively
  outputs 3072 dims but supports MRL truncation. `taskType` is set to
  `RETRIEVAL_DOCUMENT` when embedding chunks and `RETRIEVAL_QUERY` when
  embedding a search query, per Google's asymmetric-retrieval guidance —
  still unverified against a real API response (no
  `GOOGLE_GENERATIVE_AI_API_KEY` configured yet).
- **`@ai-sdk/google@^3`, matching the same `ai@6`/`@ai-sdk/provider@^3.0.0`
  pinning as `@ai-sdk/groq`** — same reasoning as the pinning note below.
- **Tool names use underscores (`rag_search`), not the dot-notation
  (`rag.search`) used throughout the plan doc**: OpenAI-compatible
  function-calling APIs (which Groq's is) restrict tool/function names to
  `[a-zA-Z0-9_-]`; a literal dot would likely be rejected by the API. The
  plan's dot-notation is treated as a human-readable label only — every
  future tool (`calendar_view`, `reminder_create`, etc.) should follow the
  same underscore convention when actually registered.
- **`executeTool(userId, ...)` takes `userId` explicitly, not via
  closure**: since tool execution now happens in a plain workflow-level
  dispatch function (not a per-conversation factory closure), `userId` is
  threaded through as an explicit argument from `conversationWorkflow` down
  to each tool's step (e.g. `ragSearch(userId, input)`), so tools can never
  be called against another user's data — nothing about scoping depends on
  model-provided input.
- **pgvector cosine similarity via a raw `sql` template with `<=>` and an
  explicit `::vector` cast**, not a drizzle-orm helper — drizzle-orm
  doesn't ship a `cosineDistance()`-style helper for its `vector` column
  type as of the installed version; this is the standard hand-written
  pattern for drizzle + pgvector.
- **Chunking is character-count-based (~4 chars/token), not a real
  tokenizer**: avoids pulling in a tokenizer dependency for V1. Good enough
  for chunk-boundary purposes; `document_chunks.token_count` is therefore
  an estimate, not exact.
- **Ingestion re-embeds are a full delete + full re-run on `/reprocess`**,
  matching the plan's explicit "simple full re-run, not partial resume"
  choice.

## Phase 2

- **`TELEGRAM_WEBHOOK_SECRET_TOKEN`, not `TELEGRAM_WEBHOOK_SECRET`**:
  matches `@chat-adapter/telegram`'s actual env var name (checked against
  its shipped `.d.ts`), which the adapter checks against Telegram's
  `x-telegram-bot-api-secret-token` header itself — no manual verification
  needed in our code.
- **`getBot()` lazy singleton, not a top-level `export const bot = new
  Chat(...)`**: `createTelegramAdapter()` validates `TELEGRAM_BOT_TOKEN`
  eagerly at construction time. A top-level instantiation blew up `next
  build`'s page-data collection for *any* fork that hasn't configured
  Telegram yet (confirmed: build fails without the fix, succeeds with it,
  even with zero Telegram env vars set). Mirrors the `getDb()` lazy
  pattern from Phase 0/the Neon skill guidance. Handler registration
  (`registerHandlers()`) happens once, inside `getBot()`'s first-call
  branch — not in a separately-imported module — so it can't be
  accidentally registered twice.
- **Stable Telegram identifier is `Channel.id`** (e.g. `"telegram:123456"`,
  obtained from `event.channel` in the `/start` slash-command handler and
  from the third `channel` argument of `onDirectMessage(thread, message,
  channel)`), not `Thread.id`. Chosen because both handlers can reach a
  `Channel` directly and consistently, whereas only the message handler
  naturally has a `Thread`; using two different id shapes across the two
  handlers risked a mismatch. Delivery from workflow steps uses
  `bot.channel(id).post()` (not `bot.thread(id)`), since `Channel` also
  implements `Postable`.
- **One persistent `conversations` row per (user, telegram) pair**: the
  Telegram handler reuses the most recent `channel='telegram'` conversation
  for a linked user rather than starting a new one per message — matches
  the "one workflow run per conversation, indefinitely suspended between
  turns" design from Phase 1. A user's entire Telegram history lives in one
  ever-growing workflow run; there's no "new chat" concept on Telegram the
  way there could be on web (V1 doesn't build a "start new Telegram
  conversation" affordance — flagged here as a known limitation, not
  solved).
- **Assistant replies reach Telegram via a workflow step
  (`deliverAssistantReplyToTelegram`), not by relaying an HTTP stream**:
  unlike the web UI (which holds an open HTTP response to stream into), a
  Telegram webhook request/response cycle isn't a useful channel for a
  multi-second LLM generation. The workflow instead posts the finished
  turn's text directly via the Bot API from within a step once the agent
  turn resolves, decoupled entirely from the webhook request that
  triggered the turn.
- **Telegram webhook route bypasses Clerk** (`/api/telegram/webhook` is
  listed in `proxy.ts`'s public-route matcher): correct, not a gap — the
  Chat SDK Telegram adapter authenticates the request itself via the
  `x-telegram-bot-api-secret-token` header /`TELEGRAM_WEBHOOK_SECRET_TOKEN`.
  Per-user authorization happens one layer up, via the `telegram_links`
  table (unlinked chats get a "please link your account" reply and no
  workflow is started/resumed for them) — doc 14 rule 4 ("validate
  ownership before reading or modifying any resource") is satisfied there,
  not at the transport layer.
- **Not yet done in this phase, deferred to when a real bot token is
  available**: registering the webhook with Telegram (`setWebhook`) and an
  end-to-end live message test. Verified instead via clean
  `tsc`/`eslint`/`next build` and a structural read-through against Chat
  SDK's bundled docs for every API used (`onSlashCommand`, `onDirectMessage`,
  `Channel.post`, `bot.channel()`).

## Phase 1

- **`ai@6` / `@ai-sdk/groq@3`, not the newest majors**: `@workflow/ai@4.2.0`
  (latest non-beta) depends on `@ai-sdk/provider@^3.0.0` (`LanguageModelV3`),
  but `pnpm add ai @ai-sdk/groq` without pinning resolved the newest `ai@7`
  / `@ai-sdk/groq@4` (provider `V4`) — an incompatible pairing. Pinned to
  `ai@^6` / `@ai-sdk/groq@^3` (and `@ai-sdk/react@3.0.226`, the version
  npm's `ai-v6` dist-tag points at) to match `@ai-sdk/provider@^3.0.0`
  throughout. This pinning is still required even after the DurableAgent →
  manual-tool-loop pivot above, since `generateText`/`embed`/`embedMany`
  and the `groq`/`google` provider packages all still come from this same
  `ai@6`-compatible dependency tree — re-check before ever bumping majors.
- **`src/proxy.ts`, not `src/middleware.ts`**: Next.js 16.2 still runs
  `middleware.ts` but logs a deprecation warning pushing towards the
  `proxy.ts` filename (same `clerkMiddleware` export, purely a rename).
- **Centralized `proxy.ts` auth via `createRouteMatcher`, despite Clerk's
  own deprecation warning** recommending resource-based (per-route) auth
  checks instead: kept for V1 because it's simpler and still fully
  functional, and every data-accessing API route already calls
  `getCurrentUser()` independently (real defense in depth, not reliance on
  the middleware alone) — but a future cleanup pass should migrate page
  routes to explicit per-route `auth.protect()`/`getCurrentUser()` calls
  too, per Clerk's migration guide, rather than trusting path-matching
  alone.
- **Multi-turn workflow via a deterministic hook, not the AI SDK's
  single-turn-per-request pattern**: one `conversationWorkflow` run lives
  for the lifetime of a conversation; both web and Telegram inject turns
  via `conversationMessageHook.resume("conversation:{id}")`. This was
  required by the plan (same workflow instance must serve both channels),
  and it means the client (`WorkflowChatTransport`) must receive a
  `x-workflow-run-id` header and a stream response on *every* POST,
  including follow-up turns — implemented by resuming the hook and then
  immediately returning `run.getReadable({ startIndex })` computed from
  the tail index captured just before the resume call.
- **`prepareReconnectToStreamRequest` must not return a URL with an
  existing query string**: `WorkflowChatTransport` always appends
  `?startIndex=N` with a bare `?` (not `&`), so a custom reconnect `api`
  URL containing `?conversationId=...` would produce a malformed
  double-`?` URL. Fixed by keying the reconnect route on a path param
  (`/api/chat/stream/[conversationId]`) instead of a query param.
- **Browser-based verification blocked in this sandbox**: no working
  Chromium could be launched here (`playwright install chromium
  --with-deps` needs `sudo`, which isn't available; the bare Chromium
  binary is missing shared libs like `libnspr4.so` without those system
  packages). Verified instead via clean `tsc --noEmit`/`eslint`/`next
  build`, plus (once a real `GROQ_API_KEY` was provided) a live
  server-side smoke test proving the actual chat flow works end-to-end —
  see the architecture-pivot section above. The signed-in browser UI
  itself is still not visually confirmed; a human should do that once
  convenient.

## Phase 0

- **Package manager**: pnpm (via corepack), not npm/yarn. Matches the
  toolchain assumed by the Vercel/AI SDK/Workflow DevKit documentation
  referenced throughout the plan.
- **Embedding dimension**: `document_chunks.embedding` is pinned to
  `vector(768)` (see Phase 3 note on the actual model used —
  `gemini-embedding-001` truncated via `outputDimensionality`, not
  `text-embedding-004` as originally guessed). If the embedding
  model/dimension ever changes, this column (and the `vector_cosine_ops`
  HNSW index built on it) must be migrated together — existing rows are
  not dimension-agnostic.
- **Vector index**: `document_chunks` uses an HNSW index with
  `vector_cosine_ops`, filtered in queries (not in the index definition) by
  `user_id`. Postgres/pgvector doesn't support a partial HNSW index scoped
  per-user, so isolation is enforced at query time (`WHERE user_id = ...`)
  — this must never be omitted from `rag_search`.
- **`vercel.ts` crons**: written with final route paths
  (`/api/cron/check-reminders`, `/api/cron/run-automations`,
  `/api/cron/expire-confirmations`) even though those routes don't exist
  yet (built in Phases 4–5). Vercel does not fail a deploy over a cron
  target that 404s; this just avoids having to revisit `vercel.ts` later.
- **Upstash Redis env var names**: Vercel's Marketplace integration for
  Upstash Redis (`vercel integration add upstash/upstash-kv`) provisions
  `KV_REST_API_URL` / `KV_REST_API_TOKEN` (legacy `@vercel/kv`-compatible
  naming), not `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` as
  `@upstash/redis`'s `Redis.fromEnv()` expects. All Redis client
  construction in this codebase uses `new Redis({ url: KV_REST_API_URL,
  token: KV_REST_API_TOKEN })` explicitly instead of `fromEnv()`.
- **`src/instrumentation.ts` disables Node's Happy Eyeballs**
  (`net.setDefaultAutoSelectFamily(false)`): this WSL2 dev machine has a
  broken default IPv6 route (interface has an IPv6 address but no working
  route — `curl`/raw `net.connect` succeed by falling back to IPv4
  instantly, but Node's `fetch`/`net.connect(hostname)` happy-eyeballs
  races IPv4 and IPv6 in parallel and the whole race times out because of
  it). This broke every `@neondatabase/serverless` / `@upstash/redis`
  call. Fix is applied globally via Next.js's `instrumentation.ts` hook so
  it self-heals for any other WSL2 (or similarly misconfigured) fork of
  this repo, and is a harmless no-op on systems without the bug.
- **npm package name vs. repo name**: the local folder/package.json name is
  `kairo-pa` (lowercase — npm forbids capitals in package names), while the
  GitHub repo itself is expected to be named `Kairo-PA` per the user's
  choice. These are independent and both are fine.
