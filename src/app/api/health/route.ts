import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getRedis } from "@/lib/redis";

export async function GET() {
  const result: { db: "ok" | "error"; redis: "ok" | "error" } = {
    db: "error",
    redis: "error",
  };

  try {
    await getDb().execute(sql`select 1`);
    result.db = "ok";
  } catch {
    // leave as "error"
  }

  try {
    await getRedis().ping();
    result.redis = "ok";
  } catch {
    // leave as "error"
  }

  const allOk = result.db === "ok" && result.redis === "ok";
  return NextResponse.json(result, { status: allOk ? 200 : 503 });
}
