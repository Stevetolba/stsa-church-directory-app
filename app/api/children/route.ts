import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { searchChildren, type ChildrenMemberType, type SearchProfilesParams } from "@/lib/subsplash";
import type { Campus, MemberStatus } from "@/types/profile";

const VALID_MEMBER_TYPES: ChildrenMemberType[] = ["Child", "Adult", "All"];
const VALID_SORT_BY: NonNullable<SearchProfilesParams["sortBy"]>[] = ["first_name", "last_name"];

// ADR-0011: the children-scoped read endpoint. Unlike /api/profiles this is
// open to any authenticated role (volunteers included) — the scoping to
// child-bearing-household members happens server-side in searchChildren
// (defaulting to children only unless memberType asks to widen to family),
// so a volunteer can never coax an unrelated adult out of it regardless of
// params.
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
  const memberTypeRaw = searchParams.get("memberType");
  const memberType = VALID_MEMBER_TYPES.includes(memberTypeRaw as ChildrenMemberType)
    ? (memberTypeRaw as ChildrenMemberType)
    : undefined;
  const sortByRaw = searchParams.get("sortBy");
  const sortBy = VALID_SORT_BY.includes(sortByRaw as NonNullable<SearchProfilesParams["sortBy"]>)
    ? (sortByRaw as SearchProfilesParams["sortBy"])
    : undefined;
  const page = Number(searchParams.get("page") ?? "1");
  // Callers (e.g. CSV export) can ask for more than the default page — capped
  // so a client can't force an unbounded in-memory scan.
  const pageSizeRaw = searchParams.get("pageSize");
  const pageSize = pageSizeRaw ? Math.min(Number(pageSizeRaw), 5000) : undefined;

  const result = await searchChildren({
    search,
    status,
    campus,
    gradeFrom,
    gradeTo,
    memberType,
    sortBy,
    page,
    pageSize,
  });
  return NextResponse.json(result);
}
