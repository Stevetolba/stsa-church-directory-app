"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendJson } from "@/hooks/useTraining";
import type { InviteResult } from "@/lib/training";
import type { Profile } from "@/types/profile";

// Admin-only: search the directory and invite people to one specific course
// (used from Manage Training — the People page has its own bulk version,
// InviteToTrainingDialog). Same invitations API: people with no directory
// access get DirectoryRole=Learner.
export function InvitePeopleDialog({
  open,
  onOpenChange,
  courseId,
  courseTitle,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
  onInvited: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  // Selections persist across searches, so keep the profile itself.
  const [picked, setPicked] = useState<Map<string, Profile>>(new Map());
  const [searching, setSearching] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setPicked(new Map());
      setSummary(null);
    }
  }, [open]);

  // Debounced directory search.
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/profiles?search=${encodeURIComponent(query.trim())}&pageSize=20&sortBy=last_name`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { profiles: Profile[] };
        setResults(data.profiles.filter((p) => p.household_role !== "child"));
      } catch {
        toast.error("Search failed");
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, open]);

  function toggle(p: Profile) {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, p);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    try {
      const r = (await sendJson("/api/admin/training/invitations", "POST", {
        profileIds: Array.from(picked.keys()),
        courseIds: [courseId],
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
      onInvited();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send invitations");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Invite people to {courseTitle}</DialogTitle>
        <DialogDescription>Search the directory by name, email or phone.</DialogDescription>
        {summary ? (
          <div className="space-y-4">
            <p className="text-sm">{summary}</p>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Start typing a name…" />
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {searching && <p className="text-sm text-muted-foreground">Searching…</p>}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-sm text-muted-foreground">No adults found.</p>
              )}
              {results.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p)} />
                  <span className="font-medium">
                    {p.first_name} {p.last_name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{p.email || "no email — can still be enrolled"}</span>
                </label>
              ))}
            </div>
            {picked.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Array.from(picked.values()).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p)}
                    className="rounded-full bg-brand-sky/20 px-2.5 py-1 text-xs"
                    title="Remove"
                  >
                    {p.first_name} {p.last_name} ✕
                  </button>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              Email them a link to start
            </label>
            <p className="text-xs text-muted-foreground">
              People without directory access get sign-in access to Training only (DirectoryRole “Learner” in Subsplash).
            </p>
            <Button onClick={submit} disabled={busy || picked.size === 0}>
              {busy ? "Inviting…" : picked.size === 0 ? "Invite" : `Invite ${picked.size} ${picked.size === 1 ? "person" : "people"}`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
