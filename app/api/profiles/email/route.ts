import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireStaffOrAdmin } from "@/lib/rbac";
import { sendBulkEmail } from "@/lib/email";
import { emailPeopleSchema } from "@/lib/validation/email";
import { searchProfiles } from "@/lib/subsplash";
import type { MemberStatus } from "@/types/profile";

// ADR-0014: staff/admin only, same as GET /api/profiles — the People page
// itself is already unreachable for volunteers (middleware + ADR-0011), so
// this mirrors that existing boundary rather than opening a new one.
export async function POST(request: NextRequest) {
  const forbidden = await requireStaffOrAdmin();
  if (forbidden) return forbidden;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = emailPeopleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  const { subject, bodyHtml, attachments, search, status, campus, gradeFrom, gradeTo } = parsed.data;

  // Requires at least one real filter, same gate the CSV export button uses
  // client-side — recomputed here server-side so a bare/empty filter set
  // can never blast the entire directory in one request.
  const hasActiveFilter =
    !!search ||
    (status && status.length > 0) ||
    (campus && campus.length > 0) ||
    gradeFrom !== undefined ||
    gradeTo !== undefined;
  if (!hasActiveFilter) {
    return NextResponse.json({ error: "Apply a filter before emailing people." }, { status: 400 });
  }

  const { profiles } = await searchProfiles({
    search,
    status: status as MemberStatus[] | undefined,
    campus,
    gradeFrom,
    gradeTo,
    pageSize: 5000,
  });

  const emails = new Set<string>();
  for (const profile of profiles) {
    if (profile.email) emails.add(profile.email);
  }

  if (emails.size === 0) {
    return NextResponse.json(
      { error: "No email addresses found for the current filter." },
      { status: 400 }
    );
  }

  const fromName = session.user.name ?? session.user.email;
  try {
    const { batches } = await sendBulkEmail({
      bcc: Array.from(emails),
      fromName,
      replyTo: session.user.email,
      subject,
      html: bodyHtml,
      attachments,
    });
    return NextResponse.json({ profileCount: profiles.length, recipientCount: emails.size, batches });
  } catch (err) {
    console.error("Failed to send people email", err);
    const message = err instanceof Error ? err.message : "Failed to send email.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
