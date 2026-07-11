import { z } from "zod";
import { MEMORY_CATEGORIES, MEMORY_SENSITIVITIES } from "@/lib/memory-constants";

// All tool input schemas live in this one file, deliberately free of any
// "use step"/"use workflow" imports. reminders.ts (which DOES import a
// "use workflow" function — reminderWorkflow, to start it) was found to
// produce an EMPTY `properties: {}` JSON Schema for its own co-located zod
// schemas when read from a different step's bundle (src/workflows/steps/
// model-call.ts), causing Groq to reject every reminder_create/list/cancel
// tool call as having disallowed properties — while calendar/rag/web-search
// schemas (defined in files with no "use workflow" import) worked fine. Root
// cause looks like the workflow bundler's module-splitting for files that
// reference a "use workflow" function stubbing out the rest of that file's
// exports in contexts other than the workflow itself. Keeping every schema
// here, imported by both the tool implementation files (for their own
// .parse() calls) and the registry/model-call step, sidesteps it entirely.
// See docs/ASSUMPTIONS.md.

export const ragSearchInputSchema = z.object({
  query: z.string().describe("The search query to find relevant chunks of the user's documents"),
  topK: z.number().int().min(1).max(20).default(5),
});

export const reminderCreateInputSchema = z.object({
  title: z.string().min(1),
  dueAt: z.string().describe("ISO 8601 datetime for when the reminder is due"),
  recurrenceRule: z
    .string()
    .optional()
    .describe("RFC5545 RRULE string (e.g. 'FREQ=WEEKLY;BYDAY=MO') for recurring reminders"),
  deliveryChannel: z.enum(["web", "telegram", "both"]).default("both"),
});

export const reminderListInputSchema = z.object({
  status: z.enum(["planned", "in_progress", "completed", "failed", "cancelled"]).optional(),
});

export const reminderCancelInputSchema = z.object({
  reminderId: z.string(),
});

export const webSearchInputSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(10).default(5),
});

export const calendarViewInputSchema = z.object({
  timeMin: z.string().describe("ISO 8601 datetime, start of range"),
  timeMax: z.string().describe("ISO 8601 datetime, end of range"),
});

export const calendarSearchInputSchema = z.object({
  query: z.string(),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
});

export const calendarCreateInputSchema = z.object({
  title: z.string().min(1),
  start: z.string().describe("ISO 8601 datetime"),
  end: z.string().describe("ISO 8601 datetime"),
  timezone: z.string().default("UTC"),
  // Plain z.string(), not .email() — Zod's email regex uses a lookahead
  // that Groq's tool-schema JSON Schema validator rejects outright (breaks
  // every tool call in the request, not just this one). Validated at the
  // Google Calendar API layer instead.
  attendees: z.array(z.string()).default([]),
  location: z.string().optional(),
  description: z.string().optional(),
  recurrenceRule: z.string().optional().describe("RFC5545 RRULE string, e.g. 'FREQ=WEEKLY;BYDAY=MO'"),
});

export const calendarUpdateInputSchema = z.object({
  eventId: z.string(),
  title: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  timezone: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
});

export const calendarCancelInputSchema = z.object({
  eventId: z.string(),
  notifyAttendees: z.boolean().default(true),
});

// Postgres TEXT columns reject the NUL byte (U+0000) outright — inserting
// one throws a raw "invalid byte sequence for encoding UTF8" DB error
// instead of anything zod would normally catch (NUL is a valid JS/Unicode
// string character, so plain z.string() lets it through). Reject it here
// so a stray NUL in a tool call or PATCH body gets a clean 400 instead of
// an unhandled 500 from the database driver.
const NUL_BYTE = String.fromCharCode(0);
const memoryContentSchema = z
  .string()
  .min(1)
  .refine((val) => !val.includes(NUL_BYTE), { message: "Content cannot contain null bytes" });

export const memoryStoreInputSchema = z.object({
  content: memoryContentSchema.describe("The fact to remember about the user, in plain language"),
  category: z.enum(MEMORY_CATEGORIES).optional().describe("What kind of memory this is"),
  sensitivity: z
    .enum(MEMORY_SENSITIVITIES)
    .default("normal")
    .describe("Mark 'sensitive' for anything private (health, finances, relationships) — always requires confirmation"),
});

export const memoryViewInputSchema = z.object({
  category: z.enum(MEMORY_CATEGORIES).optional(),
});

export const memoryDeleteInputSchema = z.object({
  memoryId: z.string().uuid(),
});

// Used by the web PATCH route only — deliberately excludes `approved`.
// memory.ts's memoryStore() documents that clearing runTool()'s confirmation
// gate IS the approval; letting this route flip `approved` directly would
// reopen the bypass that design is meant to prevent.
export const memoryUpdateInputSchema = z
  .object({
    content: memoryContentSchema,
    category: z.enum(MEMORY_CATEGORIES),
    sensitivity: z.enum(MEMORY_SENSITIVITIES),
  })
  .partial();
