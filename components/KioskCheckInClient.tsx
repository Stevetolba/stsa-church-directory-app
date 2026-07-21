"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import useSWR from "swr";
import { toast } from "sonner";
import { Calendar, Check, LogOut, Settings, ShieldAlert, Sparkles, X } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { EmptyState } from "@/components/EmptyState";
import { useKioskCheckInRoster } from "@/hooks/useKioskCheckInRoster";
import { useKioskAttendance } from "@/hooks/useKioskAttendance";
import { avatarTintForId, initialsOf } from "@/lib/avatar";
import { generateMatchCode } from "@/lib/matchCode";
import { loadKioskPrintSettings, saveKioskPrintSetting, type KioskPrintSettings } from "@/lib/kioskSettings";
import type { ChildLabelData } from "@/components/labels/ChildLabel";
import type { ParentMatchTagData } from "@/components/labels/ParentMatchTag";
import { PrintLabelsSheet } from "@/components/labels/PrintLabelsSheet";
import { checkInWindow, timeLabelInTz, windowState } from "@/lib/eventTime";
import type { AppEvent } from "@/types/event";
import type { CheckInRecord } from "@/types/attendance";
import type { Profile } from "@/types/profile";

const RESET_AFTER_MS = 6000;

// Self-service kiosk for one event occurrence (ADR-0015, Phase 2 & 3): idle
// screen -> search -> tap-to-select household members -> confirm -> success
// -> auto-reset. No backfill (staff/admin-only, and never offered on the
// kiosk surface even for a signed-in operator) and no undo (mis-taps are
// fixed from the regular check-in page, not here). Talks to /api/kiosk/*
// (useKioskCheckInRoster / useKioskAttendance) rather than the staff-only
// /api/attendance + /api/children|/profiles, so it works identically whether
// the operator is a signed-in user or an unattended device — the household
// grouping/session-defaulting logic is still shared with CheckInPageClient
// via useRosterGrouping. The batch-submit and success/reset flow is kept
// separate since the two surfaces behave differently afterward.
export function KioskCheckInClient({ event, isDevice = false }: { event: AppEvent; isDevice?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"checkin" | "checkout">("checkin");
  const [idle, setIdle] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [labelsToPrint, setLabelsToPrint] = useState<{
    children: ChildLabelData[];
    parentTags: ParentMatchTagData[];
  } | null>(null);
  const [pendingCheckOutId, setPendingCheckOutId] = useState<string | null>(null);
  const [exitConfirming, setExitConfirming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Defaults to the pre-hydration default (true) to match the server render,
  // then picks up this device's saved preference on mount.
  const [printSettings, setPrintSettings] = useState<KioskPrintSettings>({
    printParentLabels: true,
  });
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPrintSettings(loadKioskPrintSettings());
  }, []);

  function updatePrintSetting(key: keyof KioskPrintSettings, value: boolean) {
    setPrintSettings((prev) => ({ ...prev, [key]: value }));
    saveKioskPrintSetting(key, value);
  }

  const now = new Date();
  const state = windowState(event, now);
  const { opensAt } = checkInWindow(event);
  const canCheckIn = state === "open";

  // Only a device actor sees this — a signed-in operator already has full
  // access to /events (which "Exit kiosk" already sends them to) to pick a
  // different event's kiosk. Fetched regardless of isDevice (cheap, and
  // /api/kiosk/events works for either actor) but only rendered for one.
  const { data: todaysEventsData } = useSWR<{ events: AppEvent[] }>("/api/kiosk/events", (url: string) =>
    fetch(url).then((res) => (res.ok ? res.json() : { events: [] }))
  );
  const hasOtherEventsToday = (todaysEventsData?.events.length ?? 0) > 1;

  const {
    isLoading,
    hasFilter,
    households,
    profileById,
    groupByProfileId,
    dropOffForHousehold,
    sessionForProfile,
  } = useKioskCheckInRoster({ event, search });
  const { records, summary, checkIn, checkOut } = useKioskAttendance(event.id);

  const recordByProfile = useMemo(() => {
    const map = new Map<string, CheckInRecord>();
    for (const r of records) map.set(r.profileId, r);
    return map;
  }, [records]);

  const present = useMemo(() => records.filter((r) => !r.checkedOutAt), [records]);
  const presentFiltered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return present;
    return present.filter((r) => r.displayName.toLowerCase().includes(needle));
  }, [present, search]);

  // Screen Wake Lock — keeps the iPad awake while kiosk mode is active.
  // Wake locks auto-release when the tab is hidden, so re-acquire on
  // visibility change (e.g. after a brief app-switch on iPadOS).
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    async function acquire() {
      try {
        sentinel = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Unsupported or denied — kiosk still works, the screen just may sleep.
      }
    }
    acquire();
    function onVisible() {
      if (document.visibilityState === "visible") acquire();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      sentinel?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  function scheduleReset() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(resetToIdle, RESET_AFTER_MS);
  }

  function resetToIdle() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setIdle(true);
    setMode("checkin");
    setSearch("");
    setSelected(new Set());
    setSuccessCount(null);
    setPendingCheckOutId(null);
  }

  function wake() {
    setIdle(false);
  }

  function toggleSelected(profileId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  }

  async function handleBatchCheckIn() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setSubmitting(true);
    const matchCodeByHousehold = new Map<string, string>();
    const labelDataById = new Map<string, ChildLabelData>();
    const outcomes = await Promise.allSettled(
      ids.map(async (id) => {
        const profile = profileById.get(id);
        if (!profile) throw new Error("Profile not found");
        const group = groupByProfileId.get(id);
        const tracksPickup = profile.household_role === "child" && !!group;
        const dropOffProfileId = tracksPickup ? dropOffForHousehold(group) : undefined;
        let matchCode: string | undefined;
        if (tracksPickup) {
          matchCode = matchCodeByHousehold.get(group.householdId) ?? generateMatchCode();
          matchCodeByHousehold.set(group.householdId, matchCode);
          const dropOffProfile = dropOffProfileId ? profileById.get(dropOffProfileId) : undefined;
          const sessionId = sessionForProfile(profile);
          // A specific drop-off adult wins; with two+ adults and no explicit
          // pick, the label still names the household's adult(s) rather than
          // going blank — the printed slip is meant to be read at a glance,
          // not left without a parent name because no one tapped a dropdown.
          const contactName = dropOffProfile
            ? `${dropOffProfile.first_name} ${dropOffProfile.last_name}`.trim()
            : group.adults.map((a) => `${a.first_name} ${a.last_name}`.trim()).join(" & ") || undefined;
          labelDataById.set(id, {
            id,
            firstName: profile.first_name,
            lastName: profile.last_name,
            matchCode,
            eventTitle: event.title,
            sessionName: event.sessions.find((s) => s.id === sessionId)?.name,
            contactName,
            contactPhone: dropOffProfile?.phone_number,
            allergyNotes: profile.allergy_notes,
            careNotes: profile.care_notes,
          });
        }
        await checkIn({ profileId: id, sessionId: sessionForProfile(profile), dropOffProfileId, matchCode });
        return id;
      })
    );
    const succeededIds = outcomes
      .filter((o): o is PromiseFulfilledResult<string> => o.status === "fulfilled")
      .map((o) => o.value);
    const failedCount = outcomes.length - succeededIds.length;
    setSubmitting(false);

    if (failedCount > 0) {
      toast.error(`${failedCount} check-in${failedCount > 1 ? "s" : ""} failed — try again`);
      setSelected((prev) => {
        const next = new Set(prev);
        succeededIds.forEach((id) => next.delete(id));
        return next;
      });
      return;
    }

    setSelected(new Set());
    setSuccessCount(succeededIds.length);
    const printableChildren = succeededIds.map((id) => labelDataById.get(id)).filter((d): d is ChildLabelData => !!d);
    // "Print parent labels" only governs the separate pickup-code tag — the
    // child's own name label always prints, matching the base Sunday School
    // check-in behavior (there's no toggle for that in Subsplash's settings
    // either, only for the guest and parent tags).
    const parentTags: ParentMatchTagData[] = [];
    if (printSettings.printParentLabels) {
      const tagsByCode = new Map<string, ParentMatchTagData>();
      for (const child of printableChildren) {
        const tag =
          tagsByCode.get(child.matchCode) ??
          { matchCode: child.matchCode, childNames: [], dropOffName: child.contactName };
        tag.childNames.push(`${child.firstName} ${child.lastName}`.trim());
        tagsByCode.set(child.matchCode, tag);
      }
      parentTags.push(...Array.from(tagsByCode.values()));
    }
    if (printableChildren.length > 0) {
      setLabelsToPrint({ children: printableChildren, parentTags });
      // Reset timer starts once the label sheet is dismissed, not now — give
      // the operator time to actually print before the screen clears itself.
    } else {
      scheduleReset();
    }
  }

  async function handleConfirmCheckOut(profileId: string) {
    try {
      await checkOut(profileId);
      setPendingCheckOutId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-out failed");
    }
  }

  const startLabel = timeLabelInTz(new Date(event.start_at), event.timezone);
  const endLabel = event.end_at ? timeLabelInTz(new Date(event.end_at), event.timezone) : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF7F1]">
      <header className="flex items-center justify-between border-b border-[#EAE2D0] bg-white px-5 py-3.5 sm:px-8">
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold text-brand-navy">{event.title}</div>
          <div className="text-[12.5px] text-[#8A94A0]">
            {startLabel}
            {endLabel ? ` – ${endLabel}` : ""} · {summary?.present ?? 0} present
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isDevice && hasOtherEventsToday && (
            <button
              type="button"
              onClick={() => router.push("/kiosk")}
              className="flex items-center gap-1.5 rounded-[10px] border border-[#E5DCC8] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#8A94A0] transition-colors hover:border-brand-navy/30"
            >
              <Calendar className="h-3.5 w-3.5" />
              Switch event
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Kiosk settings"
            className="rounded-[10px] border border-[#E5DCC8] bg-white p-2.5 text-[#8A94A0] transition-colors hover:border-brand-navy/30"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setExitConfirming(true)}
            className="rounded-[10px] border border-[#E5DCC8] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#8A94A0] transition-colors hover:border-brand-navy/30"
          >
            Exit kiosk
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-5 py-8 sm:px-8">
        {successCount !== null ? (
          <SuccessScreen count={successCount} onDone={resetToIdle} />
        ) : idle ? (
          <IdleScreen canCheckIn={canCheckIn} opensAt={opensAt} timezone={event.timezone} onTap={wake} />
        ) : (
          <div className="flex w-full max-w-2xl flex-col gap-5">
            <div className="flex items-center rounded-full border border-[#E5DCC8] bg-white p-1">
              <ModeButton active={mode === "checkin"} onClick={() => setMode("checkin")}>
                Check in
              </ModeButton>
              <ModeButton active={mode === "checkout"} onClick={() => setMode("checkout")}>
                Check out ({present.length})
              </ModeButton>
            </div>

            <SearchBar
              defaultValue={search}
              onDebouncedChange={setSearch}
              placeholder={mode === "checkin" ? "Search by name, email, or phone" : "Search by name"}
              className="!min-w-0 !max-w-none py-4 text-[17px]"
            />

            {mode === "checkin" ? (
              !canCheckIn ? (
                <EmptyState
                  icon={<ShieldAlert className="h-6 w-6" />}
                  message={
                    state === "upcoming"
                      ? `Check-in opens at ${timeLabelInTz(opensAt, event.timezone)}.`
                      : "Check-in is closed for this event."
                  }
                />
              ) : !hasFilter ? (
                <EmptyState icon={<Sparkles className="h-6 w-6" />} message="Search to find a household to check in." />
              ) : isLoading ? (
                <div className="py-16 text-center text-[15px] text-[#8A94A0]">Loading…</div>
              ) : households.length === 0 ? (
                <EmptyState icon={<Sparkles className="h-6 w-6" />} message={`No one matches "${search}".`} />
              ) : (
                <div className="flex flex-col gap-5">
                  {households.map((group) => (
                    <div key={group.householdId}>
                      <div className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
                        {group.name}
                      </div>
                      <div className="flex flex-col gap-2.5">
                        {group.members.map((profile) => (
                          <KioskRow
                            key={profile.id}
                            profile={profile}
                            checkedIn={recordByProfile.has(profile.id)}
                            selected={selected.has(profile.id)}
                            onToggle={() => toggleSelected(profile.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : presentFiltered.length === 0 ? (
              <EmptyState icon={<LogOut className="h-6 w-6" />} message="No one is currently checked in." />
            ) : (
              <div className="flex flex-col gap-2.5">
                {presentFiltered.map((r) => (
                  <CheckOutRow
                    key={r.id}
                    record={r}
                    confirming={pendingCheckOutId === r.id}
                    onTap={() => setPendingCheckOutId(r.id)}
                    onCancel={() => setPendingCheckOutId(null)}
                    onConfirm={() => handleConfirmCheckOut(r.profileId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {mode === "checkin" && !idle && successCount === null && selected.size > 0 && (
        <div className="sticky bottom-5 z-10 flex justify-center px-5">
          <button
            type="button"
            onClick={handleBatchCheckIn}
            disabled={submitting}
            className="rounded-full bg-brand-navy px-8 py-4 text-[16px] font-semibold text-brand-cream shadow-[0_6px_20px_rgba(26,58,92,0.35)] transition-colors hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Checking in…" : `Check in ${selected.size}`}
          </button>
        </div>
      )}

      {labelsToPrint && (
        <PrintLabelsSheet
          childLabels={labelsToPrint.children}
          parentTags={labelsToPrint.parentTags}
          autoPrint
          onClose={() => {
            setLabelsToPrint(null);
            scheduleReset();
          }}
        />
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[16px] bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-[16px] font-semibold text-brand-navy">Kiosk settings</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-[#8A94A0] hover:bg-[#FAF7F1]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-col divide-y divide-[#EAE2D0]">
              <SettingToggle
                label="Print parent labels"
                description="Print an additional label with a pickup code for the adult who dropped a child off."
                checked={printSettings.printParentLabels}
                onChange={(v) => updatePrintSetting("printParentLabels", v)}
              />
            </div>
            <p className="mt-3 text-[12px] text-[#8A94A0]">Saved on this device.</p>
          </div>
        </div>
      )}

      {exitConfirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[16px] bg-white p-5 shadow-xl">
            <h2 className="font-heading text-[16px] font-semibold text-brand-navy">Exit kiosk mode?</h2>
            <p className="mt-1 text-[13.5px] text-[#5B7185]">
              {isDevice ? "You'll return to today's events." : "You'll return to the events list."}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExitConfirming(false)}
                className="rounded-[10px] border border-[#E5DCC8] bg-white px-4 py-2 text-[13.5px] font-semibold text-[#5B7185]"
              >
                Cancel
              </button>
              <button
                type="button"
                // A device has no dashboard/session to return to — /kiosk
                // re-resolves it and shows today's event picker (or the lone
                // event) again, which also doubles as "switch to a different
                // event today" without a separate affordance. A signed-in
                // operator goes back to the full events list as before.
                onClick={() => router.push(isDevice ? "/kiosk" : "/events")}
                className="rounded-[10px] bg-brand-navy px-4 py-2 text-[13.5px] font-semibold text-brand-cream"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-full px-4 py-2.5 text-[14.5px] font-semibold transition-colors ${
        active ? "bg-brand-navy text-brand-cream" : "text-[#5B7185]"
      }`}
    >
      {children}
    </button>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-brand-navy">{label}</div>
        <div className="mt-0.5 text-[12.5px] text-[#5B7185]">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-brand-navy" : "bg-[#E5DCC8]"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function IdleScreen({
  canCheckIn,
  opensAt,
  timezone,
  onTap,
}: {
  canCheckIn: boolean;
  opensAt: Date;
  timezone: string;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="flex flex-1 w-full flex-col items-center justify-center gap-4 rounded-[24px] border-2 border-dashed border-[#E5DCC8] bg-white/60 py-24 text-center transition-colors hover:border-brand-navy/30"
    >
      <span className="relative h-20 w-20 overflow-hidden rounded-full bg-white shadow-[0_2px_10px_rgba(26,58,92,0.15)]">
        <Image src="/stsa-logo.png" alt="STSA Church" fill sizes="80px" className="object-cover" />
      </span>
      <span className="font-heading text-[26px] font-semibold text-brand-navy">Tap to check in</span>
      {!canCheckIn && (
        <span className="text-[14px] text-[#8A94A0]">Check-in opens at {timeLabelInTz(opensAt, timezone)}</span>
      )}
    </button>
  );
}

function SuccessScreen({ count, onDone }: { count: number; onDone: () => void }) {
  return (
    <div className="flex flex-1 w-full flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#3F6B45] text-white">
        <Check className="h-10 w-10" />
      </span>
      <span className="font-heading text-[26px] font-semibold text-brand-navy">
        Checked in {count} {count === 1 ? "person" : "people"}!
      </span>
      <button type="button" onClick={onDone} className="text-[14px] font-semibold text-[#5B7185] underline underline-offset-2">
        Done
      </button>
    </div>
  );
}

function gradeLabel(profile: Profile): string | null {
  return profile.household_role === "child" ? (profile.academic_grade ?? "Child") : null;
}

function KioskRow({
  profile,
  checkedIn,
  selected,
  onToggle,
}: {
  profile: Profile;
  checkedIn: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const tint = avatarTintForId(profile.id);
  const grade = gradeLabel(profile);

  if (checkedIn) {
    return (
      <div className="flex items-center gap-3 rounded-[14px] border border-[#3F6B45]/30 bg-[#F1F6EE] px-4 py-3.5">
        <Avatar profile={profile} tint={tint} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold text-brand-navy">
            {profile.first_name} {profile.last_name}
          </div>
          <div className="text-[13px] text-[#3F6B45]">Already checked in</div>
        </div>
        <Check className="h-5 w-5 shrink-0 text-[#3F6B45]" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-3 rounded-[14px] border px-4 py-3.5 text-left transition-colors ${
        selected ? "border-brand-navy bg-brand-navy/5" : "border-[#EAE2D0] bg-white hover:border-brand-navy/30"
      }`}
    >
      <div className="relative shrink-0">
        <Avatar profile={profile} tint={tint} />
        {selected && (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-navy ring-2 ring-white">
            <Check className="h-3 w-3 text-brand-cream" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-semibold text-brand-navy">
          {profile.first_name} {profile.last_name}
        </div>
        {grade && <div className="text-[13px] text-[#8A94A0]">{grade}</div>}
      </div>
    </button>
  );
}

function Avatar({ profile, tint }: { profile: Profile; tint: { bg: string; text: string } }) {
  if (profile.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={profile.photo_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold"
      style={{ backgroundColor: tint.bg, color: tint.text }}
    >
      {initialsOf(profile.first_name, profile.last_name)}
    </div>
  );
}

function CheckOutRow({
  record,
  confirming,
  onTap,
  onCancel,
  onConfirm,
}: {
  record: CheckInRecord;
  confirming: boolean;
  onTap: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (confirming) {
    return (
      <div className="flex items-center gap-3 rounded-[14px] border border-brand-navy bg-brand-navy/5 px-4 py-3.5">
        <div className="min-w-0 flex-1 text-[16px] font-semibold text-brand-navy">Check out {record.displayName}?</div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="rounded-[10px] border border-[#E5DCC8] bg-white p-2.5 text-[#8A94A0]"
        >
          <X className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-[10px] bg-brand-navy px-4 py-2.5 text-[14px] font-semibold text-brand-cream"
        >
          Confirm
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onTap}
      className="flex items-center gap-3 rounded-[14px] border border-[#EAE2D0] bg-white px-4 py-3.5 text-left transition-colors hover:border-brand-navy/30"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-semibold text-brand-navy">{record.displayName}</div>
        {record.sessionName && <div className="text-[13px] text-[#8A94A0]">{record.sessionName}</div>}
      </div>
      <LogOut className="h-5 w-5 shrink-0 text-[#8A94A0]" />
    </button>
  );
}
