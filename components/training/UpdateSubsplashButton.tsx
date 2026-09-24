"use client";

import { useState } from "react";
import { toast } from "sonner";
import { sendJson } from "@/hooks/useTraining";

interface ResyncResult {
  attempted: number;
  failed: number;
  errors: string[];
}

// Admin-only: re-sends one person's course status to their Subsplash profile
// (the "Subsplash pending" state). Shows the real Subsplash error on failure
// so the admin knows what to fix (e.g. a missing choice on the status field).
export function UpdateSubsplashButton({
  courseId,
  profileId,
  onDone,
}: {
  courseId: string;
  profileId: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = (await sendJson(
        `/api/admin/training/courses/${courseId}/resync?profileId=${encodeURIComponent(profileId)}`,
        "POST"
      )) as ResyncResult;
      if (r.failed > 0) toast.error(r.errors[0] ?? "Could not update Subsplash");
      else toast.success("Subsplash profile updated");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update Subsplash");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
    >
      {busy ? "Updating…" : "Update Subsplash"}
    </button>
  );
}
