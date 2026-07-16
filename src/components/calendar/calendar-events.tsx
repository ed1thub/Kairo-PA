"use client";

import { MapPin } from "lucide-react";
import type { calendarView } from "@/tools/calendar";

export type CalendarEvent = Awaited<ReturnType<typeof calendarView>>[number];

// A client component so `toLocaleString()` runs in the visitor's browser,
// in their local timezone — rendering this server-side (as part of the
// Server Component page) would format every event time in the Vercel
// Lambda's timezone instead of the signed-in user's.
export function CalendarEvents({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events in the next 7 days.</p>;
  }

  return (
    <>
      {events.map((event) => (
        <div key={event.id} className="rounded-lg border px-4 py-3">
          <p className="text-sm font-medium">{event.title}</p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {event.start ? new Date(event.start).toLocaleString() : ""}
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {event.location}
              </span>
            )}
          </p>
        </div>
      ))}
    </>
  );
}
