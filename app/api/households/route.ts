import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { listHouseholds } from "@/lib/subsplash";
import type { Campus } from "@/types/profile";

// Same session-gating rationale as /api/profiles — this is a read
// endpoint, but the data is staff-only PII (ADR-0005's "app is the only
// guard" isn't just about mutations).
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const campus = (searchParams.get("campus") as Campus | null) ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");

  const result = await listHouseholds({ search, campus, page });
  return NextResponse.json(result);
}
