"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Plus, Tablet, Trash2, X } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

interface DeviceRecord {
  id: string;
  name: string;
  claimed: boolean;
  setupCode: string | null;
  setupExpires: string | null;
  createdBy: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load devices: ${res.status}`);
  return res.json();
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusFor(device: DeviceRecord): { label: string; className: string } {
  if (device.revokedAt) return { label: "Revoked", className: "bg-[#F6EDEA] text-[#B04A3A]" };
  if (device.claimed) return { label: "Active", className: "bg-[#EEF6EE] text-[#3F6B45]" };
  return { label: "Awaiting setup", className: "bg-[#FBF3E4] text-[#9A7327]" };
}

// Admin UI for kiosk device setup codes (ADR-0015, Phase 3). A device is
// authorized once, on-device, at /kiosk/setup — this page only issues and
// revokes the codes; it never sees or needs a device's actual token (only
// its hash is ever stored, see lib/deviceAuth.ts).
export function DeviceManager() {
  const { data, error, isLoading, mutate } = useSWR<{ devices: DeviceRecord[] }>("/api/devices", fetcher, {
    refreshInterval: 15000,
  });
  const devices = data?.devices ?? [];

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justCreated, setJustCreated] = useState<DeviceRecord | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Could not create device");
        return;
      }
      setJustCreated(body.device);
      setAddOpen(false);
      setName("");
      mutate();
    } catch {
      toast.error("Network error — try again");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(device: DeviceRecord) {
    try {
      const res = await fetch(`/api/devices/${device.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Could not revoke device");
        return;
      }
      toast.success(`"${device.name}" revoked`);
      mutate();
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-semibold text-brand-navy">Kiosk devices</h1>
          <p className="mt-1 text-[13.5px] text-[#5B7185]">
            Authorize a tablet or phone for self-service check-in without signing in on it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-brand-navy px-4 py-2.5 text-[13.5px] font-semibold text-brand-cream transition-colors hover:bg-brand-navy/90"
        >
          <Plus className="h-4 w-4" />
          Add device
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-[15px] text-[#8A94A0]">Loading…</div>
      ) : error ? (
        <EmptyState message="Couldn't load devices." />
      ) : devices.length === 0 ? (
        <EmptyState icon={<Tablet className="h-6 w-6" />} message="No devices yet. Add one to get a setup code." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {devices.map((device) => {
            const status = statusFor(device);
            return (
              <div
                key={device.id}
                className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#EAE2D0] bg-white px-4 py-3.5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF2F6] text-[#5B7185]">
                  <Tablet className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-brand-navy">{device.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-[#8A94A0]">
                    {device.lastSeenAt
                      ? `Last seen ${formatDateTime(device.lastSeenAt)}`
                      : device.claimed
                        ? "Never used"
                        : `Setup code: ${device.setupCode ?? "expired"}`}
                    {" · "}Added {formatDateTime(device.createdAt)} by {device.createdBy}
                  </div>
                </div>
                {!device.revokedAt && (
                  <button
                    type="button"
                    onClick={() => setRevokingId(device.id)}
                    className="flex shrink-0 items-center gap-1.5 rounded-[10px] border border-[#E5DCC8] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#B04A3A] transition-colors hover:border-[#B04A3A]/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Revoke
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[16px] bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-[16px] font-semibold text-brand-navy">Add a device</h2>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-[#8A94A0] hover:bg-[#FAF7F1]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-3">
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lobby iPad"
                className="w-full rounded-[10px] border border-[#E5DCC8] px-3.5 py-2.5 text-[14.5px] text-brand-navy focus:border-brand-navy/40 focus:outline-none"
              />
              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="rounded-[10px] bg-brand-navy px-4 py-2.5 text-[14px] font-semibold text-brand-cream disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Creating…" : "Generate setup code"}
              </button>
            </form>
          </div>
        </div>
      )}

      {justCreated && <SetupCodeSheet device={justCreated} onClose={() => setJustCreated(null)} />}

      {revokingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[16px] bg-white p-5 shadow-xl">
            <h2 className="font-heading text-[16px] font-semibold text-brand-navy">Revoke this device?</h2>
            <p className="mt-1 text-[13.5px] text-[#5B7185]">
              It will immediately stop being able to check anyone in or out.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevokingId(null)}
                className="rounded-[10px] border border-[#E5DCC8] bg-white px-4 py-2 text-[13.5px] font-semibold text-[#5B7185]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const device = devices.find((d) => d.id === revokingId);
                  if (device) handleRevoke(device);
                }}
                className="rounded-[10px] bg-[#B04A3A] px-4 py-2 text-[13.5px] font-semibold text-white"
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SetupCodeSheet({ device, onClose }: { device: DeviceRecord; onClose: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(device.setupExpires));

  useEffect(() => {
    const interval = setInterval(() => setSecondsLeft(secondsUntil(device.setupExpires)), 1000);
    return () => clearInterval(interval);
  }, [device.setupExpires]);

  const expired = secondsLeft <= 0;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[16px] bg-white p-6 text-center shadow-xl">
        <h2 className="font-heading text-[16px] font-semibold text-brand-navy">{device.name}</h2>
        <p className="mt-1 text-[13px] text-[#5B7185]">
          Go to <span className="font-semibold">/kiosk/setup</span> on the device and enter this code.
        </p>
        <div className="mx-auto mt-4 w-fit rounded-[14px] bg-[#FAF7F1] px-6 py-4 text-[36px] font-bold tracking-[0.3em] text-brand-navy">
          {device.setupCode}
        </div>
        <p className={`mt-3 text-[12.5px] ${expired ? "font-semibold text-[#B04A3A]" : "text-[#8A94A0]"}`}>
          {expired ? "Code expired — generate a new one." : `Expires in ${minutes}:${String(seconds).padStart(2, "0")}`}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-[10px] bg-brand-navy px-4 py-2.5 text-[14px] font-semibold text-brand-cream"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function secondsUntil(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
}
