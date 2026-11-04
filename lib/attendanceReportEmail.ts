// Weekly Sunday School attendance email (ADR-0028). Pure HTML builder.

import { CHURCH_NAME, TAGLINE, WEBSITE, escapeHtml } from "./trainingEmail";
import type { CampusReport } from "./weeklyAttendanceReport";

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function buildWeeklyAttendanceEmail(params: {
  campus: string;
  report: CampusReport;
  reportUrl: string;
  logoUrl: string;
}): { subject: string; html: string } {
  const { campus, report, reportUrl, logoUrl } = params;
  const dates = report.occurrenceDates;
  const total = dates.length;
  const all = report.sections[report.sections.length - 1];
  const subject = `Sunday School [${campus}] attendance — ${all.cameLastSunday} came ${longDate(report.sunday)}`;

  const summary = report.sections
    .map(
      (s) =>
        `<td style="padding:6px 10px;text-align:center;border:1px solid #e5dcc8"><div style="font-size:18px;font-weight:700;color:#14304a">${s.cameLastSunday}</div><div style="font-size:11px;color:#6b7a88">${escapeHtml(s.label)}</div></td>`
    )
    .join("");

  const th = "padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#8a94a0;border-bottom:1px solid #eae2d0;background:#faf7f1";
  const sections = report.sections
    .map((s, i) => {
      const isAll = i === report.sections.length - 1;
      const head = `<tr><th style="${th}">Name</th><th style="${th}">Grade</th><th style="${th}">This month</th>${dates
        .map(
          (d) =>
            `<th style="${th};text-align:center${d === report.sunday ? ";background:#e8f0f7;color:#14304a" : ""}">${escapeHtml(d.slice(5))}</th>`
        )
        .join("")}</tr>`;
      const rows = s.people
        .map(
          (p) =>
            `<tr><td style="padding:6px 8px;border-bottom:1px solid #f0ebdf;font-weight:${p.cameLastSunday ? 700 : 400}">${escapeHtml(p.displayName)}</td><td style="padding:6px 8px;border-bottom:1px solid #f0ebdf;color:#5b7185">${escapeHtml(p.grade ?? "—")}</td><td style="padding:6px 8px;border-bottom:1px solid #f0ebdf;color:#5b7185;white-space:nowrap">${p.attendedDates.length}/${total}</td>${dates
              .map(
                (d) =>
                  `<td style="padding:6px 8px;border-bottom:1px solid #f0ebdf;text-align:center;color:#3f6b45${d === report.sunday ? ";background:#e8f0f7" : ""}">${p.attendedDates.includes(d) ? "●" : ""}</td>`
              )
              .join("")}</tr>`
        )
        .join("");
      const body =
        s.people.length === 0
          ? `<p style="font-size:13px;color:#6b7a88;margin:4px 0 0">No attendance this month.</p>`
          : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #eae2d0">${head}${rows}</table>`;
      return `<h3 style="margin:${isAll ? 28 : 22}px 0 6px;font-size:15px;color:#14304a">${escapeHtml(s.label)} <span style="font-weight:400;font-size:13px;color:#6b7a88">— ${s.cameLastSunday} came ${escapeHtml(longDate(report.sunday))}</span></h3>${body}`;
    })
    .join("");

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#1f2d3a;line-height:1.5">
  <div style="background:#14304a;color:#f6f0e2;padding:18px 24px;border-radius:10px 10px 0 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="padding-right:14px;vertical-align:middle">
        <img src="${escapeHtml(logoUrl)}" width="48" height="48" alt="${escapeHtml(CHURCH_NAME)} logo" style="display:block;border-radius:50%;background:#ffffff" />
      </td>
      <td style="vertical-align:middle">
        <div style="font-size:20px;font-weight:700;color:#f6f0e2">${escapeHtml(CHURCH_NAME)}</div>
        <div style="font-size:13px;opacity:.85;font-style:italic;color:#f6f0e2">${escapeHtml(TAGLINE)}</div>
      </td>
    </tr></table>
  </div>
  <div style="border:1px solid #e5dcc8;border-top:0;padding:24px;border-radius:0 0 10px 10px">
    <h2 style="margin:0 0 4px;font-size:18px;color:#14304a">Sunday School [${escapeHtml(campus)}] — week of ${escapeHtml(longDate(report.sunday))}</h2>
    <p style="margin:0 0 14px;font-size:13px;color:#6b7a88">Who came last Sunday, and how many of this month's ${total} Sunday${total === 1 ? "" : "s"} so far each child has attended. Children who came last Sunday are listed first.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${summary}</tr></table>
    ${sections}
    <p style="margin:24px 0">
      <a href="${escapeHtml(reportUrl)}" style="background:#14304a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">Open the full report</a>
    </p>
    <hr style="border:0;border-top:1px solid #eee;margin:24px 0" />
    <p style="font-size:12px;color:#6b7a88;margin:0">
      You're receiving this because you're a Team Lead at ${escapeHtml(campus)}. Replies go to the church office.
      <a href="${WEBSITE.href}" style="color:#6b7a88">${WEBSITE.label}</a>
    </p>
  </div>
</div>`.trim();
  return { subject, html };
}
