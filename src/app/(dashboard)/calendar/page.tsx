import Link from "next/link";
import { CalendarX2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { calendarView } from "@/tools/calendar";
import { CalendarNotConnectedError } from "@/lib/google-calendar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CalendarEvents } from "@/components/calendar/calendar-events";

export default async function CalendarPage() {
  const { user } = await getCurrentUser();

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let events: Awaited<ReturnType<typeof calendarView>> | null = null;
  let notConnected = false;

  try {
    events = await calendarView(user.id, { timeMin: now.toISOString(), timeMax: in7Days.toISOString() });
  } catch (error) {
    if (error instanceof CalendarNotConnectedError) {
      notConnected = true;
    } else {
      throw error;
    }
  }

  if (notConnected) {
    return (
      <div className="flex flex-1 flex-col min-h-0">
        <PageHeader title="Calendar" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <CalendarX2 className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Calendar not connected</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Connect Google Calendar to view and manage your events here.
            </p>
          </div>
          <Button asChild size="sm" className="mt-1">
            <Link href="/integrations">Go to Integrations</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader title="Calendar" description="Next 7 days from your connected Google Calendar." />
      <div className="flex flex-1 flex-col gap-2 p-4 sm:p-6">
        <CalendarEvents events={events ?? []} />
      </div>
    </div>
  );
}
