import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { calendarView } from "@/tools/calendar";
import { CalendarNotConnectedError } from "@/lib/google-calendar";

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
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center gap-3">
        <h1 className="text-lg font-medium">Calendar not connected</h1>
        <p className="text-sm text-neutral-500 max-w-md">
          Connect Google Calendar on the{" "}
          <Link href="/integrations" className="underline">
            Integrations
          </Link>{" "}
          page to view and manage your events here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-8 max-w-2xl mx-auto w-full">
      <h1 className="text-lg font-medium">Next 7 days</h1>
      {events && events.length === 0 && (
        <p className="text-sm text-neutral-500">No events in the next 7 days.</p>
      )}
      {events?.map((event) => (
        <div
          key={event.id}
          className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3"
        >
          <p className="text-sm font-medium">{event.title}</p>
          <p className="text-xs text-neutral-500">
            {event.start ? new Date(event.start).toLocaleString() : ""}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
