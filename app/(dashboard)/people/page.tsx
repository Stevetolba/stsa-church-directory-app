import { auth } from "@/lib/auth";
import { getFromAddress } from "@/lib/email";
import { PeoplePageClient } from "@/components/PeoplePageClient";

// Volunteers can't reach this page at all (middleware's VOLUNTEER_BLOCKED_PATHS,
// ADR-0011), so it's inherently staff/admin-only already — no extra
// canEmailPeople gate needed here the way the Children page needs one.
// POST /api/profiles/email still enforces requireStaffOrAdmin itself
// (ADR-0005: UI reachability is not a guard).
export default async function PeoplePage() {
  const session = await auth();
  const user = {
    name: session?.user?.name ?? session?.user?.email ?? "Staff",
    email: session?.user?.email ?? "",
  };

  return <PeoplePageClient user={user} fromAddress={getFromAddress()} />;
}
