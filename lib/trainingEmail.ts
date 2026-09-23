// Invitation email for a training course. Pure (no sending) so the wording
// can be unit-tested; lib/training.ts's inviteToTraining sends it.

export const CHURCH_NAME = "STSA Church";
const TAGLINE = "Bring an ancient faith to your modern world.";
const WEBSITE = { label: "www.stsaministries.org", href: "https://www.stsaministries.org" };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildInviteEmail(params: {
  courseTitles: string[];
  trainingUrl: string;
  invitedByName: string;
}): { subject: string; html: string } {
  const { courseTitles, trainingUrl, invitedByName } = params;
  const plural = courseTitles.length > 1;
  const list = courseTitles.map((t) => `<li style="margin:4px 0;font-weight:600">${escapeHtml(t)}</li>`).join("");

  const subject = `${CHURCH_NAME} training: you're invited to ${courseTitles.join(", ")}`;
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2d3a;line-height:1.5">
  <div style="background:#14304a;color:#f6f0e2;padding:20px 24px;border-radius:10px 10px 0 0">
    <div style="font-size:20px;font-weight:700">${escapeHtml(CHURCH_NAME)}</div>
    <div style="font-size:13px;opacity:.85;font-style:italic">${escapeHtml(TAGLINE)}</div>
  </div>
  <div style="border:1px solid #e5dcc8;border-top:0;padding:24px;border-radius:0 0 10px 10px">
    <p style="margin-top:0">You've been invited by ${escapeHtml(invitedByName)} to take ${plural ? "these courses" : "a course"} with ${escapeHtml(CHURCH_NAME)}:</p>
    <ul style="padding-left:20px">${list}</ul>
    <p style="margin:24px 0">
      <a href="${escapeHtml(trainingUrl)}" style="background:#14304a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">Start your training</a>
    </p>
    <p style="font-size:14px">Sign in with Google using the email address this message was sent to. The course videos and quizzes are available any time — you can pick up where you left off.</p>
    <hr style="border:0;border-top:1px solid #eee;margin:24px 0" />
    <p style="font-size:12px;color:#6b7a88;margin:0">
      This is an ${escapeHtml(CHURCH_NAME)} training course.
      <a href="${WEBSITE.href}" style="color:#6b7a88">${WEBSITE.label}</a>
    </p>
  </div>
</div>`.trim();
  return { subject, html };
}
