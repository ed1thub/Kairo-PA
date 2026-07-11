import type { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { memories } from "@/db/schema";
import type { memoryStoreInputSchema, memoryViewInputSchema, memoryDeleteInputSchema } from "./schemas";

/**
 * Inserts with approved=true — by the time this runs, runTool()'s
 * confirmation gate has already required (and received) explicit user
 * approval for anything above LOW risk, which for memory_store is always
 * (see getRiskLevel in registry.ts: sensitive -> HIGH, normal -> MEDIUM,
 * never auto-approved by default). Clearing that gate IS the approval —
 * there's no separate memory-specific approval step.
 *
 * This is currently the ONLY write path into `memories`. If a future,
 * non-conversation write path is added (e.g. extracting candidate facts
 * during document ingestion), it must NOT copy `approved: true` here —
 * that path has no runTool() gate, so forcing approval would bypass the
 * review step `memories.approved`'s `false` default exists to provide.
 */
export async function memoryStore(
  userId: string,
  workspaceId: string,
  input: z.infer<typeof memoryStoreInputSchema>,
) {
  "use step";
  const db = getDb();
  const [memory] = await db
    .insert(memories)
    .values({
      userId,
      workspaceId,
      content: input.content,
      category: input.category,
      sensitivity: input.sensitivity,
      source: "conversation",
      approved: true,
    })
    .returning();
  return { memoryId: memory.id, content: memory.content, category: memory.category };
}

// Agent-facing read: only approved memories, matching "agent reads only
// approved=true AND user_id=current user" from the plan.
export async function memoryView(userId: string, input: z.infer<typeof memoryViewInputSchema>) {
  "use step";
  const db = getDb();
  const conditions = [eq(memories.userId, userId), eq(memories.approved, true)];
  if (input.category) conditions.push(eq(memories.category, input.category));
  const rows = await db
    .select()
    .from(memories)
    .where(and(...conditions));
  return rows.map((m) => ({ id: m.id, content: m.content, category: m.category, sensitivity: m.sensitivity }));
}

export async function memoryDelete(userId: string, input: z.infer<typeof memoryDeleteInputSchema>) {
  "use step";
  const db = getDb();
  const [deleted] = await db
    .delete(memories)
    .where(and(eq(memories.id, input.memoryId), eq(memories.userId, userId)))
    .returning();
  if (!deleted) throw new Error("Memory not found");

  return { memoryId: deleted.id, deleted: true as const };
}
