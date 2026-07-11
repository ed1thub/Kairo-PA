import { google } from "googleapis";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { integrations } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/encryption";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

export function getGoogleAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [CALENDAR_SCOPE],
    state,
  });
}

export class CalendarNotConnectedError extends Error {
  constructor() {
    super("Google Calendar is not connected for this user");
    this.name = "CalendarNotConnectedError";
  }
}

/**
 * Returns an authenticated Calendar API client for a user, refreshing and
 * persisting the access token automatically when Google rotates it.
 */
export async function getCalendarClient(userId: string) {
  const db = getDb();
  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, "google_calendar")))
    .limit(1);

  if (!integration || integration.status !== "connected") throw new CalendarNotConnectedError();

  const client = getOAuthClient();
  client.setCredentials({
    access_token: decrypt(integration.accessToken),
    refresh_token: integration.refreshToken ? decrypt(integration.refreshToken) : undefined,
  });

  client.on("tokens", (tokens) => {
    void db
      .update(integrations)
      .set({
        ...(tokens.access_token ? { accessToken: encrypt(tokens.access_token) } : {}),
        ...(tokens.refresh_token ? { refreshToken: encrypt(tokens.refresh_token) } : {}),
        ...(tokens.expiry_date ? { expiresAt: new Date(tokens.expiry_date) } : {}),
      })
      .where(eq(integrations.id, integration.id));
  });

  return google.calendar({ version: "v3", auth: client });
}
