import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getRosterScope } from "@/lib/rosterScope";
import { VolunteersPageClient } from "@/components/VolunteersPageClient";

// Admins/staff and Team Leads can read the roster. Writes: admins any team,
// Team Leads only their own team(s) — both re-enforced server-side by the
// /api/volunteers routes (requireRosterManager); the scope passed down here
// only decides which controls to show. Everyone else is redirected.
export default async function VolunteersPage() {
  const session = await auth();
  const role = session?.user?.role;
  const allowed = role === "admin" || role === "staff" || (role === "volunteer" && !!session?.user?.canEmailChildren);
  if (!allowed || !session?.user) redirect("/children");

  const scope = await getRosterScope(session.user);
  return (
    <VolunteersPageClient
      canManage={scope.canManage}
      manageableTeams={scope.teams}
      isAdmin={role === "admin"}
    />
  );
}
