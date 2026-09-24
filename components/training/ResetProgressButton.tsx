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
        `Reset ${name}'s progress in this course?\\n\\nTheir watched videos, quiz scores and completion are erased and they start again from lesson 1. Their Subsplash status is set to \"Not Started\".`
      )
    )
      return;
    setBusy(true);
    try {
      const r = (await sendJson(
        `/api/admin/training/courses/${courseId}/reset?profileId=${encodeURIComponent(profileId)}`,
        "POST"
      )) as { subsplashUpdated?: boolean; subsplashError?: string };
      if (r.subsplashError) {
        toast.warning(`${name}'s progress was reset, but Subsplash wasn't updated: ${r.subsplashError}`);
      } else {
        toast.success(`${name}'s progress was reset${r.subsplashUpdated ? " and Subsplash set to Not Started" : ""}`);
      }
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
