import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { VolunteersPageClient } from "@/components/VolunteersPageClient";

// Admins/staff and Team Leads can read the roster; only admins can change it.
// Both are re-enforced server-side by the /api/volunteers routes
// (requireVolunteerRosterAccess / requireAdmin) — this redirect just keeps
// everyone else from landing on an empty page.
export default async function VolunteersPage() {
  const session = await auth();
  const role = session?.user?.role;
  const allowed = role === "admin" || role === "staff" || (role === "volunteer" && !!session?.user?.canEmailChildren);
  if (!allowed) redirect("/children");

  return <VolunteersPageClient isAdmin={role === "admin"} />;
}
