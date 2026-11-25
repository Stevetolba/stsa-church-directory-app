import { NextResponse } from "next/server";
import { requireVolunteerRosterAccess } from "@/lib/rbac";
import { getVolunteerFieldOptions } from "@/lib/subsplash";

// Team / Role choices discovered from Subsplash — used by the roster filters
// and the admin pickers.
export async function GET() {
  const forbidden = await requireVolunteerRosterAccess();
  if (forbidden) return forbidden;
  return NextResponse.json(await getVolunteerFieldOptions());
}
