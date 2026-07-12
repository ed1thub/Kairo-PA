import { redirect } from "next/navigation";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { conversations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export default async function ChatIndexPage() {
  const { user } = await getCurrentUser();
  const db = getDb();
  const [latest] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.userId, user.id), eq(conversations.channel, "web")))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);

  redirect(`/chat/${latest?.id ?? crypto.randomUUID()}`);
}
