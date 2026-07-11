import { getBot } from "@/bot/chat-instance";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  return getBot().webhooks.telegram(request);
}
