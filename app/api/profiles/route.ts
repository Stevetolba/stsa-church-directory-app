import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { searchProfiles } from "@/lib/subsplash";
import type { Campus, MemberStatus } from "@/types/profile";

// Middleware excludes /api/* from its redirect (a 307 isn't a sane fetch()
// response), so this route enforces its own session check. This is a read
// endpoint but the data is staff-only PII, so it's gated the same as
// writes would be — ADR-0005's "app is the only guard" isn't just about
// mutations.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const status = searchParams.getAll("status") as MemberStatus[];
  const campus = searchParams.getAll("campus") as Campus[];
  const gradeFromRaw = searchParams.get("gradeFrom");
  const gradeToRaw = searchParams.get("gradeTo");
  const gradeFrom = gradeFromRaw ? Number(gradeFromRaw) : undefined;
  const gradeTo = gradeToRaw ? Number(gradeToRaw) : undefined;
  const page = Number(searchParams.get("page") ?? "1");

  const result = await searchProfiles({ search, status, campus, gradeFrom, gradeTo, page });
  return NextResponse.json(result);
}
