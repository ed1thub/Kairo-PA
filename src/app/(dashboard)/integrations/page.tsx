import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { integrations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader title="Integrations" description="Connect channels and manage what Kairo is allowed to do." />
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Telegram</CardTitle>
            <CardDescription>Link your Telegram account to chat with Kairo there too.</CardDescription>
          </CardHeader>
          <CardContent>
            <TelegramLinkForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Google Calendar</CardTitle>
            <CardDescription>Let Kairo view, create, and manage events on your behalf.</CardDescription>
          </CardHeader>
          <CardContent>
            <GoogleCalendarCard connected={calendarIntegration?.status === "connected"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tool permissions</CardTitle>
            <CardDescription>Enable or disable individual tools and confirmation requirements.</CardDescription>
          </CardHeader>
          <CardContent>
            <ToolPermissionsPanel />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
