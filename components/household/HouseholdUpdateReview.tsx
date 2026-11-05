"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewGroup } from "@/lib/householdUpdateReview";

type Duplicates = Record<string, { id: string; name: string; detail: string }[]>;

const STATUS_LABEL: Record<string, string> = {
  pending: "Needs review",
  applied: "Applied",
  partially_applied: "Partly applied",
  rejected: "Rejected",
};

export function HouseholdUpdateReview(props: {
  requestId: string;
  status: string;
  groups: ReviewGroup[];
  duplicates: Duplicates;
}) {
  const router = useRouter();
  const isPending = props.status === "pending";
  const allRows = useMemo(() => props.groups.flatMap((g) => g.rows), [props.groups]);
  // Everything starts ticked, except changes already rejected on an earlier pass.
  const [accepted, setAccepted] = useState<Set<string>>(
    () => new Set(allRows.filter((r) => r.applied || r.decision !== "rejected").map((r) => r.id))
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const hasFailures = allRows.some((r) => r.decision === "accepted" && !r.applied && r.error);

  function toggle(id: string, group: ReviewGroup) {
    const next = new Set(accepted);
    // A new member is accepted or rejected as one unit.
    const ids = group.type === "new_member" ? group.rows.map((r) => r.id) : [id];
    const on = !next.has(id);
    for (const i of ids) {
      if (on) next.add(i);
      else next.delete(i);
    }
    setAccepted(next);
  }

  async function call(path: string, body?: unknown) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/admin/household-updates/${props.requestId}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Something went wrong.");
      return;
    }
    setMessage(data.status === "pending" ? "Some changes couldn't be written to Subsplash. See the errors below and retry." : "Done.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <p className="text-sm">
        Status: <strong>{STATUS_LABEL[props.status] ?? props.status}</strong>
      </p>

      {props.groups.map((g) => (
        <section key={g.key} className="overflow-x-auto rounded-xl border border-border bg-white">
          <header className="border-b border-border bg-brand-cream/50 px-4 py-2 font-semibold text-brand-navy">
            {g.type === "new_member" ? `New family member: ${g.label}` : g.label}
          </header>
          {g.type === "new_member" && (props.duplicates[g.subjectId]?.length ?? 0) > 0 && (
            <div className="border-b border-border bg-amber-50 px-4 py-2 text-sm text-amber-900">
              Possible existing profile{props.duplicates[g.subjectId].length === 1 ? "" : "s"}:{" "}
              {props.duplicates[g.subjectId].map((d) => `${d.name}${d.detail ? ` (${d.detail})` : ""}`).join("; ")}. Untick this
              person if they already exist.
            </div>
          )}
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Field</th>
                <th className="px-4 py-2">At submission</th>
                <th className="px-4 py-2">Subsplash now</th>
                <th className="px-4 py-2">Proposed</th>
                <th className="px-4 py-2">{isPending ? "Accept" : "Result"}</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-4 py-2 font-medium">{r.fieldLabel}</td>
                  <td className="whitespace-pre-wrap px-4 py-2 text-muted-foreground">{r.atSubmission}</td>
                  <td className="whitespace-pre-wrap px-4 py-2">
                    {r.now}
                    {r.drifted && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900" title="Subsplash changed after the family proposed this">
                        changed since
                      </span>
                    )}
                  </td>
                  <td className="whitespace-pre-wrap px-4 py-2 font-medium text-brand-navy">{r.proposed}</td>
                  <td className="px-4 py-2">
                    {r.applied ? (
                      <span className="text-green-700">Applied</span>
                    ) : isPending ? (
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={accepted.has(r.id)}
                          disabled={busy}
                          onChange={() => toggle(r.id, g)}
                          aria-label={`Accept ${r.fieldLabel} for ${g.label}`}
                        />
                        {r.error && <span className="text-destructive">Failed: {r.error}</span>}
                      </label>
                    ) : (
                      <span className="text-muted-foreground">{r.decision === "rejected" ? "Not applied" : "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {message && <p className="rounded-lg bg-brand-cream px-4 py-3 text-sm text-brand-navy" role="status">{message}</p>}

      {isPending && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => call("review", { acceptedIds: Array.from(accepted) })}
              className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-brand-cream disabled:opacity-50"
            >
              Apply {accepted.size} accepted change{accepted.size === 1 ? "" : "s"} to Subsplash
            </button>
            {hasFailures && (
              <button
                type="button"
                disabled={busy}
                onClick={() => call("retry")}
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-brand-navy disabled:opacity-50"
              >
                Retry failed
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="min-w-[16rem] flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
              placeholder="Reason for rejecting (optional, shown to the family)"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => call("reject", { reason })}
              className="rounded-lg border border-destructive/40 bg-white px-4 py-2 text-sm font-semibold text-destructive disabled:opacity-50"
            >
              Reject everything
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
