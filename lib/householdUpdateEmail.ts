// Emails for the household self-update flow: a heads-up to admins when a
// household submits, and an outcome message to the household after review.

import { CHURCH_NAME, TAGLINE } from "./trainingEmail";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function shell(body: string): string {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2d3a;line-height:1.5">
  <div style="background:#14304a;color:#f6f0e2;padding:18px 24px;border-radius:10px 10px 0 0">
    <div style="font-size:20px;font-weight:700;color:#f6f0e2">${esc(CHURCH_NAME)}</div>
    <div style="font-size:13px;opacity:.85;font-style:italic;color:#f6f0e2">${esc(TAGLINE)}</div>
  </div>
  <div style="border:1px solid #e5dcc8;border-top:0;padding:24px;border-radius:0 0 10px 10px">${body}</div>
</div>`.trim();
}

export function buildHouseholdSubmittedAdminEmail(p: {
  householdName: string;
  submittedBy: string;
  changeCount: number;
  hasNote: boolean;
  reviewUrl: string;
}): { subject: string; html: string } {
  const subject = `Household update to review: ${p.householdName}`;
  const html = shell(`
    <p style="margin-top:0"><strong>${esc(p.submittedBy)}</strong> submitted ${p.changeCount} change${p.changeCount === 1 ? "" : "s"} for the ${esc(p.householdName)}${p.hasNote ? " and left a note" : ""}.</p>
    <p>Nothing has been changed in Subsplash yet.</p>
    <p style="margin:24px 0"><a href="${esc(p.reviewUrl)}" style="background:#14304a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">Review changes</a></p>`);
  return { subject, html };
}

// Instant apply (ADR-0031): the changes are already in Subsplash. If some are
// waiting (a new member, or a value that moved since the parent looked), the
// admin is pointed at the request.
export function buildHouseholdAutoAppliedAdminEmail(p: {
  householdName: string;
  submittedBy: string;
  appliedCount: number;
  waitingCount: number;
  reviewUrl: string;
}): { subject: string; html: string } {
  const subject = p.waitingCount > 0
    ? `Household update applied, ${p.waitingCount} to review: ${p.householdName}`
    : `Household update applied: ${p.householdName}`;
  const plural = (n: number) => `${n} change${n === 1 ? "" : "s"}`;
  const html = shell(`
    <p style="margin-top:0"><strong>${esc(p.submittedBy)}</strong> updated the ${esc(p.householdName)}. ${plural(p.appliedCount)} ${p.appliedCount === 1 ? "was" : "were"} saved to Subsplash automatically.</p>
    ${p.waitingCount > 0 ? `<p>${plural(p.waitingCount)} ${p.waitingCount === 1 ? "is" : "are"} waiting for your review (a new family member, or something that changed in Subsplash in the meantime).</p>` : ""}
    <p style="margin:24px 0"><a href="${esc(p.reviewUrl)}" style="background:#14304a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${p.waitingCount > 0 ? "Review the rest" : "See what changed"}</a></p>`);
  return { subject, html };
}

export function buildHouseholdAutoAppliedEmail(p: {
  householdName: string;
  waitingCount: number;
}): { subject: string; html: string } {
  const subject = `Your ${CHURCH_NAME} household update`;
  const html = shell(`
    <p style="margin-top:0">Thank you. Your changes have been saved to the church directory.</p>
    ${p.waitingCount > 0 ? `<p>Some of your update (such as a new family member) needs a quick review by the church office before it is added.</p>` : ""}
    <p style="font-size:12px;color:#6b7a88;margin-bottom:0">Household: ${esc(p.householdName)}</p>`);
  return { subject, html };
}

export function buildHouseholdReviewedEmail(p: {
  householdName: string;
  outcome: "applied" | "partially_applied" | "rejected";
  reason?: string | null;
}): { subject: string; html: string } {
  const subject = `Your ${CHURCH_NAME} household update`;
  const text =
    p.outcome === "applied"
      ? "Thank you. Your changes were reviewed and added to the church directory."
      : p.outcome === "partially_applied"
        ? "Thank you. We reviewed your changes and added some of them to the church directory. If something you expected is missing, please contact the church office."
        : "Thank you for sending your update. We weren't able to make these changes. Please contact the church office if you have questions.";
  const html = shell(`
    <p style="margin-top:0">${esc(text)}</p>
    ${p.outcome === "rejected" && p.reason ? `<p style="font-size:14px"><em>${esc(p.reason)}</em></p>` : ""}
    <p style="font-size:12px;color:#6b7a88;margin-bottom:0">Household: ${esc(p.householdName)}</p>`);
  return { subject, html };
}
