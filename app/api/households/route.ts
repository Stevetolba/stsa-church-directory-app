import { NextResponse, type NextRequest } from "next/server";
import { requireStaffOrAdmin } from "@/lib/rbac";
import { FULL_ROSTER_PAGE_SIZE, listHouseholds, type HouseholdChildrenMode } from "@/lib/subsplash";
import type { Campus, MemberStatus } from "@/types/profile";

const VALID_CHILDREN_MODE: HouseholdChildrenMode[] = ["with", "without"];

// Same gating rationale as /api/profiles — read endpoint over staff-only PII
// (ADR-0005). Volunteers are scoped to children only (ADR-0011), so they're
// blocked here.
export async function GET(request: NextRequest) {
  const forbidden = await requireStaffOrAdmin("households");
  if (forbidden) return forbidden;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const campus = searchParams.getAll("campus") as Campus[];
  const status = searchParams.getAll("status") as MemberStatus[];
  const gradeFromRaw = searchParams.get("gradeFrom");
  const gradeToRaw = searchParams.get("gradeTo");
  const gradeFrom = gradeFromRaw ? Number(gradeFromRaw) : undefined;
  const gradeTo = gradeToRaw ? Number(gradeToRaw) : undefined;
  const childrenModeRaw = searchParams.get("childrenMode");
  const childrenMode = VALID_CHILDREN_MODE.includes(childrenModeRaw as HouseholdChildrenMode)
    ? (childrenModeRaw as HouseholdChildrenMode)
    : undefined;
  const page = Number(searchParams.get("page") ?? "1");
  // Same "fetch every match at once" pattern People's export already uses —
  // capped so a client can't force an unbounded in-memory scan.
  const pageSizeRaw = searchParams.get("pageSize");
  const pageSize = pageSizeRaw ? Math.min(Number(pageSizeRaw), FULL_ROSTER_PAGE_SIZE) : undefined;

  const result = await listHouseholds({
    search,
    campus,
    status,
    gradeFrom,
    gradeTo,
    childrenMode,
    page,
    pageSize,
  });
  return NextResponse.json(result);
}
