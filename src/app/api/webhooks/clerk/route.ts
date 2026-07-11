import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, workspaces, toolPermissions } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";

// One row per tool so the /integrations permissions UI has something to
// toggle from day one. permission_scope is informational (doc 3.9) — the
// enforcement that matters is `enabled` + `requires_confirmation`, checked
// by src/lib/tool-runtime.ts.
const DEFAULT_TOOL_PERMISSIONS: Array<{
  toolName: string;
  permissionScope: "READ_ONLY" | "CREATE_ONLY" | "EDIT" | "DELETE";
}> = [
  { toolName: "rag_search", permissionScope: "READ_ONLY" },
  { toolName: "reminder_create", permissionScope: "CREATE_ONLY" },
  { toolName: "reminder_list", permissionScope: "READ_ONLY" },
  { toolName: "reminder_cancel", permissionScope: "DELETE" },
  { toolName: "web_search", permissionScope: "READ_ONLY" },
  { toolName: "calendar_view", permissionScope: "READ_ONLY" },
  { toolName: "calendar_search", permissionScope: "READ_ONLY" },
  { toolName: "calendar_create", permissionScope: "CREATE_ONLY" },
  { toolName: "calendar_update", permissionScope: "EDIT" },
  { toolName: "calendar_cancel", permissionScope: "DELETE" },
  { toolName: "memory_store", permissionScope: "CREATE_ONLY" },
  { toolName: "memory_view", permissionScope: "READ_ONLY" },
  { toolName: "memory_delete", permissionScope: "DELETE" },
];

export async function POST(request: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return new NextResponse("Webhook verification failed", { status: 400 });
  }

  const db = getDb();

  if (event.type === "user.created" || event.type === "user.updated") {
    const { id, email_addresses, first_name, last_name } = event.data;
    const primaryEmail = email_addresses?.[0]?.email_address;
    if (!primaryEmail) {
      return new NextResponse("User has no email address", { status: 400 });
    }

    const name = [first_name, last_name].filter(Boolean).join(" ") || null;

    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);

    if (!existing) {
      await db.insert(users).values({ id, email: primaryEmail, name });
      const [workspace] = await db
        .insert(workspaces)
        .values({ userId: id, name: "Personal" })
        .returning();
      await db.insert(toolPermissions).values(
        DEFAULT_TOOL_PERMISSIONS.map((t) => ({
          userId: id,
          toolName: t.toolName,
          permissionScope: t.permissionScope,
        })),
      );
      await writeAuditLog({
        userId: id,
        workspaceId: workspace.id,
        action: "auth.signup",
        status: "completed",
        channel: "web",
      });
    } else {
      await db
        .update(users)
        .set({ email: primaryEmail, name, updatedAt: new Date() })
        .where(eq(users.id, id));
    }
  }

  if (event.type === "user.deleted" && event.data.id) {
    // Cascading deletes on every user-owned table remove all their data.
    await db.delete(users).where(eq(users.id, event.data.id));
  }

  return NextResponse.json({ received: true });
}
