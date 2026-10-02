import { NextResponse, type NextRequest } from "next/server";
import { cronSecretMatches } from "@/lib/cronAuth";
import { runScheduledReminders } from "@/lib/trainingReminders";

// ADR-0026. Vercel Cron target (vercel.json `crons`) for the daily training
// reminder emails. Each course's frequency decides who is actually due.
export async function GET(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? new URL(request.url).origin;
  const result = await runScheduledReminders(appUrl);
  if (result.errors.length > 0) console.error("Training reminders: some sends failed", result.errors);
  return NextResponse.json(result);
}
