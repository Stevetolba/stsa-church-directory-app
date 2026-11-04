import { redirect } from "next/navigation";
import { recordAccessEvent } from "./accessLog";
import { getHouseholdSession, type HouseholdSession } from "./householdSession";

// For /household-update pages: the session, or a redirect to the code
// sign-in. Every page view is written to the audit log.
export async function requireHouseholdPage(resource: string): Promise<HouseholdSession> {
  const session = getHouseholdSession();
  if (!session) redirect("/household-update/login");
  await recordAccessEvent({
    email: session.email,
    name: session.name,
    role: "household",
    eventType: "household_update_view",
    resource,
  });
  return session;
}
