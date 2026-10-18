import { NextResponse } from "next/server";
import { getStats } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getStats());
}
