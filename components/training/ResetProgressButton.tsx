"use client";

import { useState } from "react";
import { toast } from "sonner";
import { sendJson } from "@/hooks/useTraining";

// Admin-only: wipes one person's progress in a course so they can repeat it.
export function ResetProgressButton({
  courseId,
  profileId,
  name,
  onDone,
}: {
  courseId: string;
  profileId: string;
  name: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run() {
    if (
      !confirm(
        `Reset ${name}'s progress in this course?\\n\\nTheir watched videos, quiz scores and completion are erased and they start again from lesson 1. Their Subsplash status is left as-is until they make progress again.`
      )
    )
      return;
    setBusy(true);
    try {
      await sendJson(`/api/admin/training/courses/${courseId}/reset?profileId=${encodeURIComponent(profileId)}`, "POST");
      toast.success(`${name}'s progress was reset`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset progress");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="rounded-md border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
    >
      {busy ? "Resetting…" : "Reset progress"}
    </button>
  );
}
