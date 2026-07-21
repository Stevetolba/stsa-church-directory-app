import { NextResponse, type NextRequest } from "next/server";
import { requireStaffOrAdmin } from "@/lib/rbac";
import { searchProfiles, type SearchProfilesParams } from "@/lib/subsplash";
import type { Campus, MemberStatus } from "@/types/profile";

const VALID_SORT_BY: NonNullable<SearchProfilesParams["sortBy"]>[] = [
  "first_name",
  "last_name",
  "updated_at",
  "created_at",
];

// Middleware excludes /api/* from its redirect (a 307 isn't a sane fetch()
// response), so this route enforces its own check. This is a read endpoint
// but the data is staff-only PII, so it's gated the same as writes would be
// (ADR-0005). Volunteers are scoped to children only (ADR-0011), so they get
// 403 here and use /api/children instead.
export async function GET(request: NextRequest) {
  const forbidden = await requireStaffOrAdmin("profiles");
  if (forbidden) return forbidden;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const status = searchParams.getAll("status") as MemberStatus[];
  const campus = searchParams.getAll("campus") as Campus[];
  const gradeFromRaw = searchParams.get("gradeFrom");
  const gradeToRaw = searchParams.get("gradeTo");
  const gradeFrom = gradeFromRaw ? Number(gradeFromRaw) : undefined;
  const gradeTo = gradeToRaw ? Number(gradeToRaw) : undefined;
  const sortByRaw = searchParams.get("sortBy");
  const sortBy = VALID_SORT_BY.includes(sortByRaw as NonNullable<SearchProfilesParams["sortBy"]>)
    ? (sortByRaw as SearchProfilesParams["sortBy"])
    : undefined;
  const page = Number(searchParams.get("page") ?? "1");
  // Callers (e.g. CSV export) can ask for more than the default page — capped
  // so a client can't force an unbounded in-memory scan.
  const pageSizeRaw = searchParams.get("pageSize");
  const pageSize = pageSizeRaw ? Math.min(Number(pageSizeRaw), 5000) : undefined;
  const expandHouseholds = searchParams.get("expandHouseholds") === "true";

  const result = await searchProfiles({
    search,
    status,
    campus,
    gradeFrom,
    gradeTo,
    sortBy,
    page,
    pageSize,
    expandHouseholds,
  });
  return NextResponse.json(result);
}
