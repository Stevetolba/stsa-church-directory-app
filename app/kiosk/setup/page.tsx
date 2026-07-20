"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";

// Device onboarding (ADR-0015, Phase 3): an admin generates a one-time setup
// code from the Devices settings page; entering it here exchanges the code
// for a device token via /api/kiosk/claim, which sets an httpOnly cookie on
// this device and never needs it to sign in again. No sign-in required to
// reach this page (middleware.ts exempts /kiosk/*) — that's the whole point.
export default function KioskSetupPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/kiosk/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not set up this device");
        setSubmitting(false);
        return;
      }
      setDeviceName(data.deviceName);
      setTimeout(() => router.replace("/kiosk"), 1200);
    } catch {
      toast.error("Network error — try again");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-brand-navy px-6 text-center">
      <span className="relative h-20 w-20 overflow-hidden rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
        <Image src="/stsa-logo.png" alt="STSA Church" fill sizes="80px" className="object-cover" />
      </span>

      {deviceName ? (
        <>
          <h1 className="font-heading text-[24px] font-semibold text-brand-cream">Device set up</h1>
          <p className="max-w-sm text-[15px] text-brand-cream/80">&ldquo;{deviceName}&rdquo; is ready. Opening kiosk mode…</p>
        </>
      ) : (
        <>
          <h1 className="font-heading text-[24px] font-semibold text-brand-cream">Set up this device</h1>
          <p className="max-w-sm text-[15px] text-brand-cream/80">
            Enter the setup code an admin generated for this device.
          </p>
          <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col items-center gap-3">
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="w-full rounded-[14px] border-2 border-white/20 bg-white/10 px-4 py-4 text-center text-[28px] font-bold tracking-[0.3em] text-brand-cream placeholder:text-brand-cream/30 focus:border-white/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting || !code.trim()}
              className="w-full rounded-full bg-brand-cream px-6 py-3.5 text-[16px] font-semibold text-brand-navy transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Checking…" : "Continue"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
