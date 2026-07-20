"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { timeLabelInTz } from "@/lib/eventTime";
import type { AppEvent } from "@/types/event";

// Shown when a device lands on /kiosk with more than one check-in-enabled
// event today (e.g. simultaneous Sunday School classes at different times) —
// a device has no /events list to pick from beforehand, so it picks here
// instead. ADR-0015 Phase 3.
export function KioskEventPicker({ events }: { events: AppEvent[] }) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-brand-navy px-6 text-center">
      <span className="relative h-16 w-16 overflow-hidden rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
        <Image src="/stsa-logo.png" alt="STSA Church" fill sizes="64px" className="object-cover" />
      </span>
      <h1 className="font-heading text-[22px] font-semibold text-brand-cream">Choose today&apos;s event</h1>
      <div className="flex w-full max-w-sm flex-col gap-3">
        {events.map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() => router.push(`/kiosk?eventId=${encodeURIComponent(event.id)}`)}
            className="rounded-[14px] border-2 border-white/20 bg-white/10 px-5 py-4 text-left text-brand-cream transition-colors hover:border-white/50"
          >
            <div className="text-[16px] font-semibold">{event.title}</div>
            <div className="text-[13px] text-brand-cream/70">
              {timeLabelInTz(new Date(event.start_at), event.timezone)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
