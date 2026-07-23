import { auth } from "@/lib/auth";
import { getFromAddress } from "@/lib/email";
import { ChildrenPageClient } from "@/components/ChildrenPageClient";

export default async function ChildrenPage() {
  const session = await auth();
  // Layout already redirects unauthenticated requests before this renders,
  // so session.user is present — the fallbacks are defense in depth.
  const user = {
    name: session?.user?.name ?? session?.user?.email ?? "Staff",
    email: session?.user?.email ?? "",
  };
  // ADR-0014: Email Parents is staff/admin only, plus (ADR-0017) a volunteer
  // whose Subsplash DirectoryRole is "Team Lead" — server-enforced in
  // POST /api/children/email (requireCanEmailChildren); this just keeps
  // anyone else from seeing an entry point to a request that'll 403 anyway.
  const canEmailParents = session?.user?.role !== "volunteer" || !!session?.user?.canEmailChildren;

  return (
    <ChildrenPageClient
      user={user}
      fromAddress={getFromAddress()}
      canEmailParents={canEmailParents}
    />
  );
}
