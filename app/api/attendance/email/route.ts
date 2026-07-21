import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireStaffOrAdmin } from "@/lib/rbac";
import { sendBulkEmail } from "@/lib/email";
import { emailAbsenteesSchema } from "@/lib/validation/email";
import { findAbsentees, resolveAbsenteeEmails } from "@/lib/attendance";
import { listOccurrences } from "@/lib/events";
import { occurrenceDateInTz } from "@/lib/eventTime";
import type { MemberStatus } from "@/types/profile";

const DEFAULT_LAST_N = 4;

// ADR-0015 (Phase 5): follow-up email to a series' absentees — staff/admin
// only, near-clone of /api/children/email. The recipient list is never
// trusted from the client: seriesId/lastN/filters are resent and the
// absentee set (and its resolved parent/self emails) is recomputed here,
// the same way /api/attendance/absentees computes its includeParents
// preview, so what a sender previewed is exactly what goes out.
export async function POST(request: NextRequest) {
  const forbidden = await requireStaffOrAdmin("attendance-email");
  if (forbidden) return forbidden;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = emailAbsenteesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  const { subject, bodyHtml, attachments, seriesId, lastN, childrenOnly, search, campus, status, gradeFrom, gradeTo } =
    parsed.data;

  const today = occurrenceDateInTz(new Date().toISOString(), "UTC");
  const occurrences = await listOccurrences(seriesId, { to: today, limit: lastN ?? DEFAULT_LAST_N });
  const occurrenceDates = occurrences.map((o) => o.occurrence_date);
  const absentees = await findAbsentees({
    seriesId,
    occurrenceDates,
    childrenOnly,
    search,
    campus,
    status: status as MemberStatus[] | undefined,
    gradeFrom,
    gradeTo,
  });

  const emails = await resolveAbsenteeEmails(absentees);
  if (emails.size === 0) {
    return NextResponse.json(
      { error: "No email addresses found for the current absentee list." },
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
    return NextResponse.json({ absenteeCount: absentees.length, recipientCount: emails.size, batches });
  } catch (err) {
    console.error("Failed to send absentee follow-up email", err);
    const message = err instanceof Error ? err.message : "Failed to send email.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
