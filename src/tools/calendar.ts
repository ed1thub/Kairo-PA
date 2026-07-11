import type { z } from "zod";
import type { calendar_v3 } from "googleapis";
import { getCalendarClient } from "@/lib/google-calendar";
import type {
  calendarViewInputSchema,
  calendarSearchInputSchema,
  calendarCreateInputSchema,
  calendarUpdateInputSchema,
  calendarCancelInputSchema,
} from "./schemas";

function summarizeEvent(event: calendar_v3.Schema$Event) {
  return {
    id: event.id,
    title: event.summary,
    start: event.start?.dateTime ?? event.start?.date,
    end: event.end?.dateTime ?? event.end?.date,
    location: event.location,
    attendees: event.attendees?.map((a) => a.email).filter((e): e is string => Boolean(e)),
    htmlLink: event.htmlLink,
  };
}

export async function calendarView(userId: string, input: z.infer<typeof calendarViewInputSchema>) {
  "use step";
  const calendar = await getCalendarClient(userId);
  const { data } = await calendar.events.list({
    calendarId: "primary",
    timeMin: input.timeMin,
    timeMax: input.timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });
  return (data.items ?? []).map(summarizeEvent);
}

export async function calendarSearch(userId: string, input: z.infer<typeof calendarSearchInputSchema>) {
  "use step";
  const calendar = await getCalendarClient(userId);
  const { data } = await calendar.events.list({
    calendarId: "primary",
    q: input.query,
    timeMin: input.timeMin,
    timeMax: input.timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });
  return (data.items ?? []).map(summarizeEvent);
}

export async function calendarCreate(userId: string, input: z.infer<typeof calendarCreateInputSchema>) {
  "use step";
  const calendar = await getCalendarClient(userId);
  const { data } = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: input.attendees.length > 0 ? "all" : "none",
    requestBody: {
      summary: input.title,
      start: { dateTime: input.start, timeZone: input.timezone },
      end: { dateTime: input.end, timeZone: input.timezone },
      attendees: input.attendees.map((email) => ({ email })),
      location: input.location,
      description: input.description,
      recurrence: input.recurrenceRule ? [`RRULE:${input.recurrenceRule}`] : undefined,
    },
  });
  return summarizeEvent(data);
}

export async function calendarUpdate(userId: string, input: z.infer<typeof calendarUpdateInputSchema>) {
  "use step";
  const calendar = await getCalendarClient(userId);
  const { data: existing } = await calendar.events.get({ calendarId: "primary", eventId: input.eventId });
  const hasAttendees = (existing.attendees?.length ?? 0) > 0;

  const { data } = await calendar.events.patch({
    calendarId: "primary",
    eventId: input.eventId,
    sendUpdates: hasAttendees ? "all" : "none",
    requestBody: {
      summary: input.title,
      start: input.start ? { dateTime: input.start, timeZone: input.timezone } : undefined,
      end: input.end ? { dateTime: input.end, timeZone: input.timezone } : undefined,
      location: input.location,
      description: input.description,
    },
  });
  return summarizeEvent(data);
}

export async function calendarCancel(userId: string, input: z.infer<typeof calendarCancelInputSchema>) {
  "use step";
  const calendar = await getCalendarClient(userId);
  await calendar.events.delete({
    calendarId: "primary",
    eventId: input.eventId,
    sendUpdates: input.notifyAttendees ? "all" : "none",
  });
  return { eventId: input.eventId, cancelled: true };
}
