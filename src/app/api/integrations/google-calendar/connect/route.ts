import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth";
import { getGoogleAuthUrl } from "@/lib/google-calendar";
import { getRedis } from "@/lib/redis";

const STATE_TTL_SECONDS = 10 * 60;

export async function GET() {
  const { user } = await getCurrentUser();
  const state = nanoid();

  await getRedis().set(`oauth-state:google-calendar:${state}`, user.id, { ex: STATE_TTL_SECONDS });

  return NextResponse.redirect(getGoogleAuthUrl(state));
}
