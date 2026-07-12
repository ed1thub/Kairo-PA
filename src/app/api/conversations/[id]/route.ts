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
