import { ragSearch } from "./rag";
import { reminderCreate, reminderList, reminderCancel } from "./reminders";
import { webSearch } from "./web-search";
import { calendarView, calendarSearch, calendarCreate, calendarUpdate, calendarCancel } from "./calendar";
import { memoryStore, memoryView, memoryDelete } from "./memory";
import {
  ragSearchInputSchema,
  reminderCreateInputSchema,
  reminderListInputSchema,
  reminderCancelInputSchema,
  webSearchInputSchema,
  calendarViewInputSchema,
  calendarSearchInputSchema,
  calendarCreateInputSchema,
  calendarUpdateInputSchema,
  calendarCancelInputSchema,
  memoryStoreInputSchema,
  memoryViewInputSchema,
  memoryDeleteInputSchema,
} from "./schemas";
import { runTool } from "@/lib/tool-runtime";
import type { Channel, RiskLevel } from "@/lib/audit";

// Tool names use underscores, not the dot-notation used in the plan doc for
// readability — LLM function-calling APIs (OpenAI-compatible, which Groq's
// is) restrict tool/function names to [a-zA-Z0-9_-], so "rag.search" isn't a
// valid tool name at the API level.
//
// Tool calling is implemented manually (not via DurableAgent) because
// @workflow/ai@4.2.0's non-Gateway model path passes the model-factory
// function as a step argument internally, which fails workflow's
// serialization rules — see docs/ASSUMPTIONS.md (architecture pivot). All
// input schemas live in ./schemas.ts, deliberately free of any "use step"/
// "use workflow" imports — see that file's header comment for why.
//   - descriptors (name, description, inputSchema) — plain, serializable,
//     safe to build inside the model-call step (src/workflows/steps/model-call.ts)
//   - execution (executeTool below) — runs at the WORKFLOW level (not
//     inside a step) so future confirmation-gated tools (Phase 5) can
//     suspend the workflow on a hook while awaiting user approval; steps
//     cannot use hooks/sleep.

export const TOOL_DESCRIPTORS = {
  rag_search: {
    description:
      "Semantic search over documents the user has uploaded. Always cite the returned filename when using a result.",
    inputSchema: ragSearchInputSchema,
  },
  reminder_create: {
    description: "Create a one-time or recurring reminder for the user.",
    inputSchema: reminderCreateInputSchema,
  },
  reminder_list: {
    description: "List the user's reminders, optionally filtered by status.",
    inputSchema: reminderListInputSchema,
  },
  reminder_cancel: {
    description: "Cancel a reminder by id.",
    inputSchema: reminderCancelInputSchema,
  },
  web_search: {
    description:
      "Search the current web for up-to-date information. Always cite source URLs and state when information may be time-sensitive or unverified.",
    inputSchema: webSearchInputSchema,
  },
  calendar_view: {
    description: "List the user's Google Calendar events in a time range.",
    inputSchema: calendarViewInputSchema,
  },
  calendar_search: {
    description: "Search the user's Google Calendar events by free-text query.",
    inputSchema: calendarSearchInputSchema,
  },
  calendar_create: {
    description: "Create a Google Calendar event. Adding attendees invites them and sends notifications.",
    inputSchema: calendarCreateInputSchema,
  },
  calendar_update: {
    description: "Update an existing Google Calendar event (reschedule, rename, etc).",
    inputSchema: calendarUpdateInputSchema,
  },
  calendar_cancel: {
    description: "Cancel/delete a Google Calendar event.",
    inputSchema: calendarCancelInputSchema,
  },
  memory_store: {
    description:
      "Remember a fact about the user for future conversations (preferences, contacts, projects, routines). Mark sensitivity as 'sensitive' for anything private.",
    inputSchema: memoryStoreInputSchema,
  },
  memory_view: {
    description: "Recall what's currently remembered about the user, optionally filtered by category.",
    inputSchema: memoryViewInputSchema,
  },
  memory_delete: {
    description: "Forget a specific stored memory by id.",
    inputSchema: memoryDeleteInputSchema,
  },
} as const;

export type ToolName = keyof typeof TOOL_DESCRIPTORS;

// Base risk per plan section 12. calendar_create is escalated to HIGH
// dynamically below when attendees are present (affects other people).
// calendar_update isn't dynamically escalated yet — it would need to fetch
// the existing event first to know if attendees are affected; deferred to
// Phase 5 alongside real confirmation enforcement.
const BASE_TOOL_RISK: Record<ToolName, RiskLevel> = {
  rag_search: "LOW",
  reminder_create: "MEDIUM",
  reminder_list: "LOW",
  reminder_cancel: "MEDIUM",
  web_search: "LOW",
  calendar_view: "LOW",
  calendar_search: "LOW",
  calendar_create: "MEDIUM",
  calendar_update: "MEDIUM",
  calendar_cancel: "HIGH",
  memory_store: "MEDIUM",
  memory_view: "LOW",
  memory_delete: "HIGH",
};

// Per-tool dynamic risk escalation, keyed by tool name so adding a new rule
// never requires touching the ones before it. calendar_create escalates when
// attendees are present (affects other people). memory_store escalates when
// sensitivity is "sensitive" — sensitive memories must never be auto-stored
// regardless of the user's confirmation preference; HIGH always requires
// confirmation, MEDIUM is user-overridable (see risk-policy.ts's
// requiresConfirmation). calendar_update isn't here yet — it would need to
// fetch the existing event first to know if attendees are affected;
// deferred to a future pass alongside real confirmation enforcement.
const DYNAMIC_RISK_RULES: Partial<Record<ToolName, (input: unknown) => RiskLevel | null>> = {
  calendar_create: (input) => {
    const attendees = (input as { attendees?: unknown[] } | null)?.attendees;
    return Array.isArray(attendees) && attendees.length > 0 ? "HIGH" : null;
  },
  memory_store: (input) => {
    const sensitivity = (input as { sensitivity?: string } | null)?.sensitivity;
    return sensitivity === "sensitive" ? "HIGH" : null;
  },
};

function getRiskLevel(name: ToolName, input: unknown): RiskLevel {
  return DYNAMIC_RISK_RULES[name]?.(input) ?? BASE_TOOL_RISK[name];
}

// Pure-JS FNV-1a hash — executeTool runs at the workflow level (not inside a
// "use step" function), so Node's crypto module isn't available here; this
// needs no imports and works fine in the sandboxed VM.
function hashInput(input: unknown): string {
  const json = JSON.stringify(input) ?? "";
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

const MUTATING_TOOLS = new Set<ToolName>([
  "reminder_create",
  "reminder_cancel",
  "calendar_create",
  "calendar_update",
  "calendar_cancel",
  "memory_store",
  "memory_delete",
]);

export interface ExecuteToolOptions {
  userId: string;
  workspaceId: string;
  channel: Channel;
  requestId: string;
  toolName: string;
  input: unknown;
  conversationId?: string;
  telegramChannelId?: string;
}

function buildConfirmationSummary(name: ToolName, input: unknown): string {
  const args = input as Record<string, unknown> | null;
  switch (name) {
    case "reminder_create":
      return `Create reminder "${args?.title}" due ${args?.dueAt}`;
    case "reminder_cancel":
      return `Cancel reminder ${args?.reminderId}`;
    case "calendar_create":
      return `Create calendar event "${args?.title}" from ${args?.start} to ${args?.end}${
        Array.isArray(args?.attendees) && args.attendees.length > 0
          ? ` with attendees: ${args.attendees.join(", ")}`
          : ""
      }`;
    case "calendar_update":
      return `Update calendar event ${args?.eventId}`;
    case "calendar_cancel":
      return `Cancel calendar event ${args?.eventId}`;
    case "memory_store":
      return `Remember: "${args?.content}"${args?.sensitivity === "sensitive" ? " (sensitive)" : ""}`;
    case "memory_delete":
      return `Forget memory ${args?.memoryId}`;
    default:
      return `Run ${name}`;
  }
}

export async function executeTool(options: ExecuteToolOptions): Promise<unknown> {
  const { userId, workspaceId, channel, requestId, toolName, input, conversationId, telegramChannelId } =
    options;
  const name = toolName as ToolName;
  if (!(name in TOOL_DESCRIPTORS)) throw new Error(`Unknown tool: ${toolName}`);

  const riskLevel = getRiskLevel(name, input);

  return runTool({
    userId,
    workspaceId,
    toolName: name,
    riskLevel,
    channel,
    requestId,
    conversationId,
    telegramChannelId,
    toolArgs: (input as Record<string, unknown>) ?? {},
    confirmationSummary: buildConfirmationSummary(name, input),
    // Includes a hash of the arguments so two distinct calls to the same
    // mutating tool within one turn (e.g. "forget my old address and my old
    // phone number" → two memory_delete calls sharing one requestId) get
    // different keys, while a genuine retry with identical args still
    // collides and is correctly treated as a duplicate.
    idempotencyKey: MUTATING_TOOLS.has(name) ? `${requestId}:${name}:${hashInput(input)}` : undefined,
    execute: async () => {
      switch (name) {
        case "rag_search":
          return ragSearch(userId, ragSearchInputSchema.parse(input));
        case "reminder_create":
          return reminderCreate(userId, workspaceId, reminderCreateInputSchema.parse(input));
        case "reminder_list":
          return reminderList(userId, reminderListInputSchema.parse(input));
        case "reminder_cancel":
          return reminderCancel(userId, reminderCancelInputSchema.parse(input));
        case "web_search":
          return webSearch(webSearchInputSchema.parse(input));
        case "calendar_view":
          return calendarView(userId, calendarViewInputSchema.parse(input));
        case "calendar_search":
          return calendarSearch(userId, calendarSearchInputSchema.parse(input));
        case "calendar_create":
          return calendarCreate(userId, calendarCreateInputSchema.parse(input));
        case "calendar_update":
          return calendarUpdate(userId, calendarUpdateInputSchema.parse(input));
        case "calendar_cancel":
          return calendarCancel(userId, calendarCancelInputSchema.parse(input));
        case "memory_store":
          return memoryStore(userId, workspaceId, memoryStoreInputSchema.parse(input));
        case "memory_view":
          return memoryView(userId, memoryViewInputSchema.parse(input));
        case "memory_delete":
          return memoryDelete(userId, memoryDeleteInputSchema.parse(input));
      }
    },
  });
}
