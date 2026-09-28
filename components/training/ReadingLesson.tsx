"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// A reading lesson's counterpart to YouTubeLesson: renders the lesson body
// and an explicit "Mark as read" button that gates the quiz the same way a
// video's minWatchPct does (see lib/training.ts's markContentRead).
export function ReadingLesson({
  content,
  complete,
  busy,
  onMarkRead,
}: {
  content: string | null;
  complete: boolean;
  busy: boolean;
  onMarkRead: () => void;
}) {
  return (
    <div className="space-y-4">
      {content ? (
        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: content }} />
      ) : (
        <p className="text-sm text-muted-foreground">No content yet.</p>
      )}
      {complete ? (
        <p className="flex items-center gap-2 text-sm font-medium text-green-700">
          <CheckCircle2 className="h-4 w-4" /> Marked as read.
        </p>
      ) : (
        <Button onClick={onMarkRead} disabled={busy}>
          Mark as read
        </Button>
      )}
    </div>
  );
}
