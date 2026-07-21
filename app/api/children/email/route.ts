import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireStaffOrAdmin } from "@/lib/rbac";
import { sendBulkEmail } from "@/lib/email";
import { emailParentsSchema } from "@/lib/validation/email";
import { attachParentContacts, searchChildren } from "@/lib/subsplash";
import type { MemberStatus } from "@/types/profile";

// ADR-0014: staff/admin only for now — unlike GET /api/children, this is a
// send capability, not a read, so it's held to the same bar as the other
// requireStaffOrAdmin-gated routes until there's reason to extend it to
// volunteers.
export async function POST(request: NextRequest) {
  const forbidden = await requireStaffOrAdmin("children-email");
  if (forbidden) return forbidden;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = emailParentsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  const { subject, bodyHtml, attachments, search, status, campus, gradeFrom, gradeTo, ageFrom, ageTo, memberType } =
    parsed.data;

  // Requires at least one real filter, same gate the CSV export button uses
  // client-side — recomputed here server-side so a bare/empty filter set
  // can never blast the entire directory in one request.
  const hasActiveFilter =
    !!search ||
    (status && status.length > 0) ||
    (campus && campus.length > 0) ||
    gradeFrom !== undefined ||
    gradeTo !== undefined ||
    ageFrom !== undefined ||
    ageTo !== undefined ||
    (memberType && memberType !== "Child");
  if (!hasActiveFilter) {
    return NextResponse.json({ error: "Apply a filter before emailing parents." }, { status: 400 });
  }

  const { profiles: children } = await searchChildren({
    search,
    status: status as MemberStatus[] | undefined,
    campus,
    gradeFrom,
    gradeTo,
    ageFrom,
    ageTo,
    memberType,
    pageSize: 5000,
  });

  const withParents = await attachParentContacts(children);
  const emails = new Set<string>();
  for (const child of withParents) {
    if (child.parent1?.email) emails.add(child.parent1.email);
    if (child.parent2?.email) emails.add(child.parent2.email);
  }

  if (emails.size === 0) {
    return NextResponse.json(
      { error: "No parent email addresses found for the current filter." },
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
    return NextResponse.json({ childCount: children.length, recipientCount: emails.size, batches });
  } catch (err) {
    // Surfaces the real Resend error (unverified domain, quota, invalid
    // address, etc.) to the sender instead of a bare 500 — without this,
    // Next's default error response has no JSON body for the client to read.
    console.error("Failed to send parent email", err);
    const message = err instanceof Error ? err.message : "Failed to send email.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
