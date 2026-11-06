"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitHouseholdUpdateAction } from "@/app/(household)/household-update/actions";
import { BusyLabel } from "./Spinner";
import { inputCls, labelCls, primaryBtn } from "./ui";

export function SubmitUpdate(props: { initialNote: string; alreadySubmitted: boolean; hasChanges: boolean; instant?: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState(props.initialNote);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await submitHouseholdUpdateAction(note);
    if (r.error) {
      setBusy(false);
      setError(r.error);
      return;
    }
    // Stay busy until the next page loads.
    router.push(
      r.mode === "instant" ? `/household-update?submitted=instant&waiting=${r.waiting ?? 0}` : "/household-update?submitted=1"
    );
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls} htmlFor="note">Anything else we should know? (optional)</label>
        <textarea id="note" rows={3} maxLength={1000} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      <button type="button" className={primaryBtn} disabled={busy || (!props.hasChanges && !note.trim())} aria-busy={busy} onClick={submit}>
        <BusyLabel
          busy={busy}
          idle={props.instant ? "Save my changes" : props.alreadySubmitted ? "Update my submission" : "Send to the church office"}
          working={props.instant ? "Saving to the directory…" : "Sending…"}
        />
      </button>
    </div>
  );
}
