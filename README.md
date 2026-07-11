# Kairo-PA

A personal AI assistant you own end to end: chat on Telegram or a private
web dashboard, backed by memory, scheduled reminders, Google Calendar,
web search, and retrieval-augmented search over your own uploaded
documents. Every mutating action is risk-scored and gated behind an
explicit confirmation, and every action is logged to an append-only audit
trail.

It combines two ideas: an always-on, multi-channel control plane (like
[OpenClaw](https://github.com/anthropics)-style personal assistants) and
a RAG-of-your-notes system, deployed entirely on free tiers.

**Cost to run: $0/month.** Every service below has a free tier that's
enough for single-user, personal use indefinitely — no credit card
charge, ever, as long as you stay within the limits in the
[Cost](#cost-0month) section.

## Features

- **Chat** on Telegram and a private web dashboard, both talking to the
  same underlying conversation — pick up where you left off on either
  channel.
- **Reminders**: one-time and recurring (RFC5545 RRULE), delivered on
  Telegram, web, or both.
- **Google Calendar**: view, search, create, update, and cancel events.
- **Web search** with cited sources.
- **RAG over your own documents**: upload PDF/DOCX/XLSX/PPTX/MD/TXT/CSV
  via Telegram or the web, ask questions, get cited answers.
- **Long-term memory**: the assistant remembers durable facts about you
  across conversations (preferences, contacts, projects, routines) —
  viewable, editable, deletable, and exportable from `/memory`.
- **Risk-based confirmation system**: every tool call is scored LOW /
  MEDIUM / HIGH / CRITICAL. LOW runs automatically; MEDIUM is
  confirm-by-default but user-configurable; HIGH (delete a document,
  cancel a calendar event, store a sensitive memory, invite attendees)
  always requires an explicit yes/no, on whichever channel you're on.
- **Full audit trail** (`/activity`): every tool call, permission check,
  and confirmation decision, in one place.

## What's out of scope (V1)

Multi-tenant admin UI, Slack/Teams/Discord/WhatsApp/email channels,
smart-home or desktop control, voice I/O, a plugin marketplace, and any
CRITICAL-risk tools (payments, security-setting changes). This is a
single-owner assistant by design.

## Architecture

```
Telegram ─┐                                    ┌─ Google Calendar API
          ├─▶ Next.js API routes (Clerk-authed) ┤
Web UI  ──┘         │                           └─ Tavily / Groq / Gemini
                     ▼
         Vercel Workflow DevKit — one durable, resumable
         workflow run per conversation (suspends between
         turns, and again whenever a tool needs confirmation)
                     │
      ┌──────────────┼──────────────────┐
      ▼              ▼                  ▼
 Neon Postgres   Upstash Redis     Vercel Blob
 (+ pgvector)    (short-term        (uploaded
 relational +    memory, rate       documents,
 vector search   limit, dedupe)     data exports)
```

Both channels funnel into the same workflow — no divergent logic between
Telegram and web. See [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) for
every non-obvious implementation decision, in the order they were made.

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router, TypeScript), deployed on Vercel |
| Auth | Clerk |
| Database | Neon Postgres + pgvector (relational + RAG vector search, one DB) |
| Cache / rate limit / idempotency | Upstash Redis |
| File storage | Vercel Blob |
| Durable agent runtime | Vercel Workflow DevKit |
| LLM | Groq (direct, not via AI Gateway — see ASSUMPTIONS.md) |
| Embeddings | Google Gemini (`gemini-embedding-001`, truncated to 768 dims) |
| Telegram | Chat SDK (`chat` + `@chat-adapter/telegram`) |
| Web search | Tavily |
| Calendar | Google Calendar API (OAuth) |

## Prerequisites

- Node.js 24+, [pnpm](https://pnpm.io) (via `corepack enable`)
- A [Vercel](https://vercel.com) account (free)
- A [GitHub](https://github.com) account, if you're forking this to
  deploy your own instance
- The [Vercel CLI](https://vercel.com/docs/cli): `pnpm add -g vercel`

## Setup

### 1. Clone and install

```bash
git clone <your-fork-url> kairo-pa
cd kairo-pa
pnpm install
```

### 2. Create and link a Vercel project

```bash
vercel login
vercel link
```

### 3. Provision Marketplace services

These auto-provision accounts and inject environment variables into your
linked Vercel project:

```bash
vercel integration add neon           # Postgres + pgvector
vercel integration add upstash        # Redis
vercel integration add clerk          # Auth
```

Vercel Blob doesn't need a separate integration — it's enabled per-project
from the Vercel dashboard's Storage tab (`Storage → Create → Blob`).

### 4. Get free API keys

- **Groq** (LLM): [console.groq.com](https://console.groq.com) → API Keys
- **Google Gemini** (embeddings): [aistudio.google.com](https://aistudio.google.com) → API Keys
- **Tavily** (web search): [tavily.com](https://tavily.com) → free API key (1,000 searches/month)

### 5. Set up Google Calendar OAuth

In [Google Cloud Console](https://console.cloud.google.com): create a
project, enable the **Google Calendar API**, then create an **OAuth 2.0
Client ID** (Web application). Add
`https://<your-app>.vercel.app/api/integrations/google-calendar/callback`
(and `http://localhost:3000/api/integrations/google-calendar/callback`
for local dev) as an authorized redirect URI.

### 6. Create a Telegram bot

Message [@BotFather](https://t.me/BotFather), run `/newbot`, and save the
token. `TELEGRAM_WEBHOOK_SECRET_TOKEN` is any random string you choose —
generate one with `openssl rand -hex 24`.

### 7. Fill in your environment

```bash
vercel env pull .env.local
```

Then open `.env.local` and fill in every remaining blank — cross-reference
[`.env.example`](.env.example), which has a comment on where to get each
value. Generate the two app-level secrets:

```bash
openssl rand -base64 32   # ENCRYPTION_KEY — encrypts OAuth tokens at rest
openssl rand -hex 32      # CRON_SECRET — authenticates Vercel Cron requests
```

### 8. Push the database schema

```bash
source <(grep -v '^#' .env.local | sed 's/^/export /') && npx drizzle-kit push
```

(`drizzle-kit` doesn't auto-load `.env.local` — this sources it manually.
See `docs/ASSUMPTIONS.md` if you'd rather use `dotenv-cli`.)

### 9. Run locally

```bash
pnpm dev
```

Visit `http://localhost:3000`, sign up via Clerk, and confirm
`/api/health` returns `{"db":"ok","redis":"ok"}`.

### 10. Deploy

```bash
vercel --prod
```

Set every `.env.local` value as a production environment variable too
(`vercel env add <NAME> production` per key, or paste them in via the
Vercel dashboard). Update `GOOGLE_OAUTH_REDIRECT_URI` and `APP_BASE_URL`
to your production URL, then redeploy.

### 11. Register the Telegram webhook

Point Telegram at your deployed app (one-time, after your first deploy):

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<your-app>.vercel.app/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET_TOKEN>"
```

### 12. Link your Telegram account

Message your bot `/start` to get a one-time link code, then enter it on
the deployed app's `/integrations` page while signed in.

### 13. Set up cron

Vercel Cron picks up the `crons` array in `vercel.ts` automatically on
deploy — no manual step. It authenticates using `CRON_SECRET` from your
project's environment variables.

## Cost ($0/month)

| Service | Free tier limit |
|---|---|
| Neon Postgres | 0.5 GB storage |
| Upstash Redis | 500,000 commands/month |
| Vercel Blob | 1 GB storage |
| Clerk | 10,000 monthly active users |
| Groq | Rate-limited free inference (varies by model) |
| Google Gemini | Free-tier embedding requests |
| Tavily | 1,000 searches/month |
| Google Calendar API | Free, generous quota |
| Vercel Hosting | Hobby plan, generous free compute |

Single-user personal use stays comfortably within every limit above.

## Known limitations

- No `message.send` tool (Gmail/Slack/WhatsApp are out of V1 scope) — the
  assistant can't message a third party on your behalf.
- Responses aren't token-streamed word-by-word (a deliberate tradeoff to
  keep the LLM path $0-cost — see the "architecture pivot" note in
  `docs/ASSUMPTIONS.md`). New messages still appear live.
- One continuous Telegram conversation per user — no "start a new chat"
  affordance on Telegram the way the web UI has.
- Groq's free-tier models occasionally fail a tool call outright
  (`AI_APICallError: Failed to call a function`); retrying the same
  request typically succeeds.

## License

MIT — see [`LICENSE`](LICENSE).
