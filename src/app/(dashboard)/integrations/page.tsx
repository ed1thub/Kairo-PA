import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { integrations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { TelegramLinkForm } from "@/components/integrations/telegram-link-form";
import { GoogleCalendarCard } from "@/components/integrations/google-calendar-card";
import { ToolPermissionsPanel } from "@/components/integrations/tool-permissions-panel";

export default async function IntegrationsPage() {
  const { user } = await getCurrentUser();
  const db = getDb();
  const [calendarIntegration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, user.id), eq(integrations.provider, "google_calendar")))
    .limit(1);

  return (
    <div className="flex flex-1 flex-col gap-8 p-8 max-w-2xl mx-auto w-full">
      <section>
        <h1 className="text-lg font-medium mb-4">Telegram</h1>
        <TelegramLinkForm />
      </section>
      <section>
        <h2 className="text-lg font-medium mb-2">Google Calendar</h2>
        <GoogleCalendarCard connected={calendarIntegration?.status === "connected"} />
      </section>
      <section>
        <h2 className="text-lg font-medium mb-2">Tool Permissions</h2>
        <ToolPermissionsPanel />
      </section>
    </div>
  );
}
