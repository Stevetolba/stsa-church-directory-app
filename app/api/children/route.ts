import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { searchChildren } from "@/lib/subsplash";
import type { Campus, MemberStatus } from "@/types/profile";

// ADR-0011: the children-scoped read endpoint. Unlike /api/profiles this is
// open to any authenticated role (volunteers included) — the scoping to
// household_role === "child" happens server-side in searchChildren, so a
// volunteer can never coax an adult profile out of it regardless of params.
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

  const result = await searchChildren({ search, status, campus, gradeFrom, gradeTo, page });
  return NextResponse.json(result);
}
