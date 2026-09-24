"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { sendJson } from "@/hooks/useTraining";
import type { Course, InviteResult } from "@/lib/training";

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

// ADR-0023: admin-only. Invites people to training courses; anyone with no
// directory access is given DirectoryRole=Learner so they can sign in.
// `getProfileIds` is resolved lazily on submit so the People page can pass
// "everyone matching the current filter" without fetching them up front.
export function InviteToTrainingDialog({
  open,
  onOpenChange,
  getProfileIds,
  countLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getProfileIds: () => Promise<string[]>;
  countLabel: string;
}) {
  const { data } = useSWR<{ courses: Course[] }>(open ? "/api/admin/training/courses" : null, fetcher);
  const [selected, setSelected] = useState<string[]>([]);
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const courses = data?.courses ?? [];

  useEffect(() => {
    if (!open) {
      setSummary(null);
      setSelected([]);
    }
  }, [open]);

  async function submit() {
    setBusy(true);
    try {
      const profileIds = await getProfileIds();
      if (profileIds.length === 0) throw new Error("No people to invite");
      const r = (await sendJson("/api/admin/training/invitations", "POST", {
        profileIds,
        courseIds: selected,
        sendEmail,
      })) as { results: InviteResult[]; emailed: number; emailError?: string };
      const invited = r.results.filter((x) => x.status === "invited").length;
      const skipped = r.results.filter((x) => x.status === "skipped");
      const learners = r.results.filter((x) => x.roleSet).length;
      const noEmail = r.results.filter((x) => x.status === "invited" && x.reason).length;
      setSummary(
        [
          `Invited ${invited} ${invited === 1 ? "person" : "people"}${learners ? ` (${learners} given learner access)` : ""}.`,
          sendEmail ? (r.emailError ? `Email failed: ${r.emailError}` : `${r.emailed} invitation emails sent.`) : "",
          noEmail ? `${noEmail} ${noEmail === 1 ? "has" : "have"} no email, so nothing was sent to them.` : "",
          skipped.length ? `Skipped ${skipped.length}: ${Array.from(new Set(skipped.map((s) => s.reason))).join("; ")}` : "",
        ]
          .filter(Boolean)
          .join(" ")
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send invitations");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Invite to training</DialogTitle>
        <DialogDescription>{countLabel}</DialogDescription>
        {summary ? (
          <div className="space-y-4">
            <p className="text-sm">{summary}</p>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              {courses.length === 0 && <p className="text-sm text-muted-foreground">Create a course first (Manage Training).</p>}
              {courses.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={() => setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                  />
                  {c.title}
                  {!c.published && <span className="text-xs text-muted-foreground">(draft)</span>}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              Email them a link to start
            </label>
            <p className="text-xs text-muted-foreground">
              People without directory access get sign-in access to Training only (DirectoryRole “Learner” in Subsplash).
            </p>
            <Button onClick={submit} disabled={busy || selected.length === 0}>
              {busy ? "Inviting…" : "Send invitations"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
