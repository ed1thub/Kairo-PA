import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, workspaces } from "@/db/schema";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthenticatedError";
  }
}

/**
 * Resolves the current Clerk session to this app's `users` row and their
 * default "Personal" workspace. Throws if unauthenticated or if the Clerk
 * webhook hasn't synced the user yet (should be near-instant after signup).
 */
export async function getCurrentUser() {
  const { userId } = await auth();
  if (!userId) throw new UnauthenticatedError();

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new UnauthenticatedError();

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.userId, userId))
    .limit(1);
  if (!workspace) throw new UnauthenticatedError();

  return { user, workspace };
}
