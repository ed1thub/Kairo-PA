import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { memories, conversations, documents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

// Bundles memories + conversation/document metadata into a downloadable
// JSON file — doc 4.6's "export your data" requirement. Served directly
// (not via Vercel Blob) since Blob's `access: 'private'` URLs aren't
// fetchable by the browser without the app's own server-side token — see
// how src/workflows/steps/ingest.ts reads private document blobs, always
// server-side via get(), never a client-facing URL. Conversation/document
// *content* isn't inlined (messages/chunks can be large); this is a
// manifest with ids/titles/timestamps, not a full backup.
export async function GET() {
  const { user, workspace } = await getCurrentUser();
  const db = getDb();

  const [memoryRows, conversationRows, documentRows] = await Promise.all([
    db.select().from(memories).where(eq(memories.userId, user.id)),
    db
      .select({
        id: conversations.id,
        channel: conversations.channel,
        title: conversations.title,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(eq(conversations.userId, user.id)),
    db
      .select({
        id: documents.id,
        filename: documents.filename,
        status: documents.status,
        uploadedAt: documents.uploadedAt,
      })
      .from(documents)
      .where(eq(documents.userId, user.id)),
  ]);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    userId: user.id,
    memories: memoryRows,
    conversations: conversationRows,
    documents: documentRows,
  };

  await writeAuditLog({
    userId: user.id,
    workspaceId: workspace.id,
    action: "memory.export",
    status: "completed",
    resourceType: "export",
    channel: "web",
  });

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="kairo-export-${Date.now()}.json"`,
    },
  });
}
