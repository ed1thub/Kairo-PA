import { NextResponse } from "next/server";
import { getModelName } from "@/lib/llm";

export async function GET() {
  return NextResponse.json({ model: getModelName() });
}
