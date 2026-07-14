import { NextResponse, type NextRequest } from "next/server";
import { requireStaffOrAdmin } from "@/lib/rbac";
import { listHouseholds } from "@/lib/subsplash";
import type { Campus } from "@/types/profile";

// Same gating rationale as /api/profiles — read endpoint over staff-only PII
// (ADR-0005). Volunteers are scoped to children only (ADR-0011), so they're
// blocked here.
export async function GET(request: NextRequest) {
  const forbidden = await requireStaffOrAdmin();
  if (forbidden) return forbidden;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const campus = (searchParams.get("campus") as Campus | null) ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");

  const result = await listHouseholds({ search, campus, page });
  return NextResponse.json(result);
}
