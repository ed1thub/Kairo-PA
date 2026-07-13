import { NextResponse } from "next/server";
import { readUsageSnapshot } from "@/lib/usage-snapshot";

export async function GET() {
  const snapshot = await readUsageSnapshot();
  if (!snapshot) {
    return NextResponse.json({ available: false });
  }
  return NextResponse.json({ available: true, ...snapshot });
}
