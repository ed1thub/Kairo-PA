import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { calendarView } from "@/tools/calendar";
import { CalendarNotConnectedError } from "@/lib/google-calendar";

export async function GET() {
  const { user } = await getCurrentUser();

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  try {
    const events = await calendarView(user.id, {
      timeMin: now.toISOString(),
      timeMax: in7Days.toISOString(),
    });
    return NextResponse.json({ connected: true, events });
  } catch (error) {
    if (error instanceof CalendarNotConnectedError) {
      return NextResponse.json({ connected: false });
    }
    throw error;
  }
}
