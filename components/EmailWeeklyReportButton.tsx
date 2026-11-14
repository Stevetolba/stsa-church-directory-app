"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Sends the weekly Sunday School report (same as the Team Lead email) to one
// address on demand.
export function EmailWeeklyReportButton({ seriesId }: { seriesId: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      const res = await fetch("/api/attendance/report/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId, to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not send the report.");
      toast.success(`Report sent to ${to}`);
      setOpen(false);
      setTo("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the report.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#CBD2D9] bg-white px-3.5 py-2 text-[13.5px] font-semibold text-brand-navy hover:border-brand-navy/30"
      >
        <Mail className="h-4 w-4" />
        Email this report
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Email the weekly report</DialogTitle>
          <DialogDescription>
            Sends last Sunday&apos;s attendance report, with this month&apos;s attendance and children&apos;s birthdays, to
            the address below.
          </DialogDescription>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@example.com"
            className="mt-3 w-full rounded-[10px] border border-[#CBD2D9] px-3 py-2 text-[14.5px]"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-[13.5px] font-semibold text-[#5B7185]">
              Cancel
            </button>
            <button
              type="button"
              disabled={sending || !to.includes("@")}
              onClick={send}
              className="rounded-full bg-brand-navy px-4 py-2 text-[13.5px] font-semibold text-brand-cream disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
