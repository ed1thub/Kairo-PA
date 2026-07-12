# Sidebar restructure + Settings shell (sub-project 2 of 4)

Status: approved, ready for implementation planning.

## Context

This is sub-project 2 of the broader navigation redesign described in
`docs/superpowers/specs/2026-07-12-multi-chat-management-design.md`. Sub-project
1 (multi-chat management) is done and deployed on `main`. This spec covers:

1. Replacing the sidebar footer's "Account" row with an account-icon dropdown
   menu (reference: a Claude-style dropdown showing avatar/name/email header,
   Settings, Log out).
2. A Settings dialog reached from that dropdown, with sections: Account,
   General, Usage, Documents, Reminders, Automations, Calendar, Memory,
   Integrations, Activity.
3. Removing the 7 relocated nav items (Documents, Reminders, Automations,
   Calendar, Memory, Integrations, Activity) from the sidebar's top-level
   list, since they'd otherwise exist in two places.

Sub-project 3 (token usage tracking, the real content of "Usage") is
explicitly out of scope here — Usage gets a placeholder in this pass.

## Current state (what this replaces)

- `src/components/app-sidebar.tsx`'s `SidebarFooter` renders Clerk's
  `<UserButton>`, a static "Account" label, and `<ThemeToggle>` inline.
- `NAV_ITEMS` in the same file lists all 7 relocated pages as direct sidebar
  links, each a real full-page route (`/documents`, `/reminders`,
  `/automations`, `/calendar`, `/memory`, `/integrations`, `/activity`) with
  its own `PageHeader` and functional content (uploads, forms, lists, OAuth
  flows). None of that page content changes in this pass.
- No settings page or dialog exists yet.
- The current LLM model is only visible via a `console.info` on every chat
  fetch response (`x-model` header, wired in `chat-panel.tsx` and the two
  chat API routes) — visible only in browser devtools during an active chat.
- `src/lib/llm.ts` exports `getModelName()`, already used server-side by the
  chat routes to set that header.

## Decisions made during brainstorming

- **Dropdown items: Settings + Log out only.** No "Upgrade plan" or
  "Personalization" (the reference screenshot's items) since Kairo-PA has no
  billing tiers and no separate personalization page. No "Help" item either.
- **Settings is a dialog, not a full page.** A large shadcn `Dialog` with an
  internal left rail (the 10 sections) and a right content pane, opened via
  local client state (`useState`), not a URL. Closing on refresh is
  acceptable for a settings panel.
- **Split behavior by section.** Account, General, and Usage render their
  content inline inside the dialog. Documents, Reminders, Automations,
  Calendar, Memory, Integrations, and Activity are launcher-only: clicking
  one closes the dialog and navigates to that page's existing full route.
  Their page content is untouched; only the entry point moves.
- **Account section embeds Clerk's `<UserProfile />`** (email, password,
  connected accounts, active sessions, delete account) rather than a custom
  read-only card. Zero custom account-management code.
- **General section: theme toggle + read-only current LLM model line.** The
  theme toggle moves here from the old sidebar footer (same
  `<ThemeToggle>` component, no behavior change). The model line is new:
  answers "which model is my assistant running on" without opening devtools.
- **Usage section: "Coming soon" placeholder.** Stays in its stated list
  position so the full 10-item structure is visible now; gets real content
  when the token-usage-tracking sub-project is built.
- **No new "Developer" section.** The dev-tool console logging behavior
  (`[Kairo] LLM model: ...` on every chat fetch) stays exactly as-is,
  automatic, unchanged. Its only settings-visible counterpart is the new
  read-only model line in General.

## New pieces

- **`GET /api/model`** — new route, returns `{ model: getModelName() }`.
  Reuses the existing `src/lib/llm.ts` export; no new logic. Needed because
  General must show the model without an active chat in flight (the current
  mechanism only sets the header on chat responses).
- **`src/components/settings/settings-dialog.tsx`** — the dialog: left rail
  (10 sections, same icon-plus-label pattern as the current sidebar
  `NAV_ITEMS` map), right pane rendering the active section. Receives
  `open`/`onOpenChange` from its parent.
- **`src/components/settings/account-menu.tsx`** — replaces the current
  footer markup. Renders avatar + name + email (via Clerk's `useUser()`)
  as a `DropdownMenuTrigger`; `DropdownMenuContent` has Settings (opens
  `SettingsDialog`) and Log out (`useClerk().signOut()`, redirects to
  `/sign-in` afterward, matching Clerk's default post-sign-out behavior).

## Changes to existing files

- **`src/components/app-sidebar.tsx`**:
  - Remove `NAV_ITEMS` and its render block entirely. `SidebarContent`
    becomes just `<ChatList />`.
  - Remove the `UserButton`/"Account"/`ThemeToggle` footer markup; render
    `<AccountMenu />` instead.
  - `MessageSquare` and the 7 relocated icons (`FileText`, `Bell`,
    `Workflow`, `Calendar`, `BrainCircuit`, `Plug`, `Activity`) become
    unused here (they move into `settings-dialog.tsx`'s section list)
    — removed from this file's imports.

## Data flow

```
AccountMenu (sidebar footer)
  |
  | click "Settings"
  v
SettingsDialog (open=true)
  |
  |-- Account / General / Usage --> rendered inline in the dialog's right pane
  |
  '-- Documents / Reminders / Automations / Calendar / Memory /
      Integrations / Activity
        |
        | click
        v
      dialog closes, router.push(existing full route) -- unchanged page
```

## Error handling

- `GET /api/model` failing — General shows "Unavailable" for that one line;
  rest of the dialog (theme toggle, other sections) unaffected. Not
  auth-gated beyond the existing default (it's read-only, non-sensitive: a
  model name string, same value for every user).
- Clerk's `<UserProfile />` manages its own internal error states (fully
  Clerk-owned component, no custom error handling needed on our side).
- `useClerk().signOut()` failing — Clerk's own SDK handles retry/error UI;
  no custom wrapper needed.

## Testing / verification approach

Same practice established this session: `tsc --noEmit`, `eslint`, `next
build`, and a `curl` check for `/api/model`'s response shape and status
code. No test suite exists in this repo; none introduced here. Manual
click-through (open the dropdown, open Settings, switch between inline
sections, click a launcher item and confirm navigation + dialog close,
sign out) needs to be confirmed by the user in their own browser.

## Explicitly out of scope for this spec

- Real Usage content (sub-project 4, token tracking with progress bars and
  the out-of-tokens popup).
- Any change to the 7 relocated pages' own content/functionality.
- A "Developer" settings section, a Personalization page, billing/plans.
- URL-addressable settings (e.g. `?settings=account` deep links).
