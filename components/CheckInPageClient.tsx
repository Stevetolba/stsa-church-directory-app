"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Clock,
  LogOut,
  Printer,
  ShieldAlert,
  UserPlus,
  X,
} from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { EmptyState } from "@/components/EmptyState";
import { useCheckInRoster } from "@/hooks/useCheckInRoster";
import { useAttendance } from "@/hooks/useAttendance";
import { avatarTintForId, initialsOf } from "@/lib/avatar";
import { generateMatchCode } from "@/lib/matchCode";
import type { ChildLabelData } from "@/components/labels/ChildLabel";
import type { ParentMatchTagData } from "@/components/labels/ParentMatchTag";
import { PrintLabelsSheet } from "@/components/labels/PrintLabelsSheet";
import { checkInWindow, timeLabelInTz, windowState } from "@/lib/eventTime";
import type { AppEvent } from "@/types/event";
import type { CheckInRecord } from "@/types/attendance";
import type { Profile } from "@/types/profile";
import type { Role } from "@/types/auth";

// Live check-in / check-out for one event occurrence (ADR-0015). Mirrors
// Subsplash's own kiosk app: search finds a household, then results are
// grouped by household so a whole family checks in in one pass, and children
// pre-select the session that matches their grade.
export function CheckInPageClient({
  event,
  role,
}: {
  event: AppEvent;
  role: Role;
}) {
  const canBackfill = role !== "volunteer";
  const [tab, setTab] = useState<"checkin" | "checkedin">("checkin");
  const [search, setSearch] = useState("");
  const [manualChildrenOnly, setManualChildrenOnly] = useState(false);
  const [backfillMode, setBackfillMode] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  // Tap-to-select, then one batch "Check in N" submit — mirrors Subsplash's
  // own kiosk app rather than an immediate per-row action. Cleared whenever
  // the search changes so a stale selection can't submit against a roster
  // the operator can no longer see.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  // Labels queued up after a batch check-in that included children, shown in
  // a print-preview sheet until dismissed.
  const [labelsToPrint, setLabelsToPrint] = useState<{
    children: ChildLabelData[];
    parentTags: ParentMatchTagData[];
  } | null>(null);

  const {
    isLoading,
    hasFilter,
    autoSessionType,
    showManualChildrenToggle,
    households,
    profileById,
    groupByProfileId,
    dropOffForHousehold,
    setDropOffFor,
    sessionForProfile,
    setSessionFor,
  } = useCheckInRoster({ event, role, search, manualChildrenOnly });

  const now = new Date();
  const state = windowState(event, now);
  const { opensAt } = checkInWindow(event);
  const windowOpen = state === "open";
  const canCheckIn = windowOpen || (backfillMode && canBackfill);

  const { records, summary, checkIn, checkOut, undoCheckIn } = useAttendance(event.id);

  const recordByProfile = useMemo(() => {
    const map = new Map<string, CheckInRecord>();
    for (const r of records) map.set(r.profileId, r);
    return map;
  }, [records]);

  function setBusyFor(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelected(profileId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setSelected(new Set());
  }

  // Household names, among currently selected children, whose drop-off
  // adult is still ambiguous (2+ adults, none picked via the "Dropped off
  // by" select) — a single-adult household auto-resolves via
  // dropOffForHousehold and never appears here. Checked before submit so a
  // check-in can never save without one; a name that's only reachable via
  // the client-side "joined household adults" guess was never actually
  // persisted, which is exactly the gap that prompted requiring this.
  function unresolvedDropOffHouseholds(): string[] {
    if (autoSessionType === "everyone") return [];
    const names = new Set<string>();
    for (const id of Array.from(selected)) {
      const profile = profileById.get(id);
      if (!profile || profile.household_role !== "child") continue;
      const group = groupByProfileId.get(id);
      if (group && !dropOffForHousehold(group)) names.add(group.name);
    }
    return Array.from(names);
  }

  // One combined submit for everyone currently selected, mirroring
  // Subsplash's own kiosk app rather than a per-row instant action. Profiles
  // that fail stay selected so the operator can see what still needs a retry;
  // succeeded ones drop out of the selection as they flip to "checked in".
  async function handleBatchCheckIn() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const missingDropOff = unresolvedDropOffHouseholds();
    if (missingDropOff.length > 0) {
      toast.error(`Select who dropped off ${missingDropOff.join(", ")} before checking in.`);
      return;
    }
    setBatchSubmitting(true);
    // Siblings checked in in the same batch share one pickup match code, so
    // a parent carries a single tag rather than one per child — generated
    // once per household as the first of its children is processed below.
    const matchCodeByHousehold = new Map<string, string>();
    const labelDataById = new Map<string, ChildLabelData>();
    const outcomes = await Promise.allSettled(
      ids.map(async (id) => {
        const profile = profileById.get(id);
        if (!profile) throw new Error("Profile not found");
        const group = groupByProfileId.get(id);
        // Drop-off / pickup tracking only applies to a child, and not for an
        // "everyone" session where kids stay with their parents.
        const tracksPickup = profile.household_role === "child" && !!group && autoSessionType !== "everyone";
        const dropOffProfileId = tracksPickup ? dropOffForHousehold(group) : undefined;
        let matchCode: string | undefined;
        if (tracksPickup) {
          matchCode = matchCodeByHousehold.get(group.householdId) ?? generateMatchCode();
          matchCodeByHousehold.set(group.householdId, matchCode);
          const dropOffProfile = dropOffProfileId ? profileById.get(dropOffProfileId) : undefined;
          const sessionId = sessionForProfile(profile);
          // Always resolved by this point — unresolvedDropOffHouseholds()
          // already blocked submission otherwise.
          const contactName = dropOffProfile ? `${dropOffProfile.first_name} ${dropOffProfile.last_name}`.trim() : undefined;
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
        await checkIn({
          profileId: id,
          sessionId: sessionForProfile(profile),
          dropOffProfileId,
          matchCode,
          backfill: backfillMode && canBackfill ? true : undefined,
        });
        return id;
      })
    );
    const succeededIds = outcomes
      .filter((o): o is PromiseFulfilledResult<string> => o.status === "fulfilled")
      .map((o) => o.value);
    const failedCount = outcomes.length - succeededIds.length;
    setSelected((prev) => {
      const next = new Set(prev);
      succeededIds.forEach((id) => next.delete(id));
      return next;
    });
    if (succeededIds.length > 0) toast.success(`Checked in ${succeededIds.length}`);
    if (failedCount > 0) toast.error(`${failedCount} check-in${failedCount > 1 ? "s" : ""} failed`);

    const printableChildren = succeededIds
      .map((id) => labelDataById.get(id))
      .filter((d): d is ChildLabelData => !!d);
    if (printableChildren.length > 0) {
      const tagsByCode = new Map<string, ParentMatchTagData>();
      for (const child of printableChildren) {
        const tag =
          tagsByCode.get(child.matchCode) ??
          { matchCode: child.matchCode, childNames: [], dropOffName: child.contactName };
        tag.childNames.push(`${child.firstName} ${child.lastName}`.trim());
        tagsByCode.set(child.matchCode, tag);
      }
      setLabelsToPrint({ children: printableChildren, parentTags: Array.from(tagsByCode.values()) });
    }
    setBatchSubmitting(false);
  }

  async function handleChangeSession(profileId: string, sessionId: string) {
    setSessionFor(profileId, sessionId);
    // If already checked in, move them to the new session immediately.
    if (recordByProfile.has(profileId)) {
      setBusyFor(profileId, true);
      try {
        await checkIn({ profileId, sessionId, backfill: backfillMode && canBackfill ? true : undefined });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not change session");
      } finally {
        setBusyFor(profileId, false);
      }
    }
  }

  async function handleUndo(profileId: string) {
    setBusyFor(profileId, true);
    try {
      await undoCheckIn(profileId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not undo");
    } finally {
      setBusyFor(profileId, false);
    }
  }

  async function handleCheckOut(profileId: string) {
    setBusyFor(profileId, true);
    try {
      await checkOut(profileId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-out failed");
    } finally {
      setBusyFor(profileId, false);
    }
  }

  // Reprints re-fetch allergy/care notes and the drop-off adult's phone
  // server-side rather than trusting profileById — that map only holds
  // whoever this operator has searched for since the page loaded, and may
  // not include the person being reprinted (see buildReprintLabelData).
  async function handleReprint(profileId: string) {
    setBusyFor(profileId, true);
    try {
      const params = new URLSearchParams({ eventId: event.id, profileId });
      const res = await fetch(`/api/attendance/reprint?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not reprint label");
      }
      const { childLabel, parentTag } = (await res.json()) as {
        childLabel: ChildLabelData | null;
        parentTag: ParentMatchTagData | null;
      };
      if (!childLabel && !parentTag) {
        toast.error("No label to reprint for this person.");
        return;
      }
      setLabelsToPrint({
        children: childLabel ? [childLabel] : [],
        parentTags: parentTag ? [parentTag] : [],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reprint label");
    } finally {
      setBusyFor(profileId, false);
    }
  }

  const missingDropOff = unresolvedDropOffHouseholds();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/events"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#5B7185] hover:text-brand-navy"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All events
      </Link>

      <div className="mb-5">
        <h1 className="font-heading text-2xl font-semibold text-brand-navy">{event.title}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-[13.5px] text-[#5B7185]">
          <Clock className="h-3.5 w-3.5" />
          {timeLabelInTz(new Date(event.start_at), event.timezone)}
          {event.end_at ? ` – ${timeLabelInTz(new Date(event.end_at), event.timezone)}` : ""}
        </p>
      </div>

      {/* Counts */}
      {summary && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Stat label="Present" value={summary.present} accent />
          <Stat label="Checked in" value={summary.total} />
          {summary.guests > 0 && <Stat label="Guests" value={summary.guests} />}
        </div>
      )}

      {/* Window banner */}
      {!windowOpen && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[#EAE2D0] bg-[#FBF8F1] px-4 py-3 text-[13.5px] text-[#5B7185]">
          <span>
            {state === "upcoming"
              ? `Check-in opens at ${timeLabelInTz(opensAt, event.timezone)}.`
              : "Check-in is closed for this event."}
          </span>
          {canBackfill && (
            <label className="flex cursor-pointer items-center gap-2 font-semibold text-brand-navy">
              <input
                type="checkbox"
                checked={backfillMode}
                onChange={(e) => setBackfillMode(e.target.checked)}
                className="h-4 w-4 rounded border-[#E5DCC8] text-brand-navy focus:ring-brand-sky"
              />
              Backfill attendance
            </label>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex items-center rounded-full border border-[#E5DCC8] bg-white p-0.5">
        <TabButton active={tab === "checkin"} onClick={() => setTab("checkin")}>
          Check in
        </TabButton>
        <TabButton active={tab === "checkedin"} onClick={() => setTab("checkedin")}>
          Checked in{summary ? ` (${summary.present})` : ""}
        </TabButton>
      </div>

      {tab === "checkin" ? (
        <>
          <div className="mb-4 flex flex-col gap-3">
            <SearchBar
              defaultValue={search}
              onDebouncedChange={handleSearchChange}
              placeholder="Search by name, email, or phone"
            />
            <div className="flex flex-wrap items-center gap-2">
              {showManualChildrenToggle && (
                <ToggleChip active={manualChildrenOnly} onClick={() => setManualChildrenOnly((v) => !v)}>
                  Children only
                </ToggleChip>
              )}
              <GuestButton
                event={event}
                disabled={!canCheckIn}
                onAdd={async (guestName, sessionId) => {
                  try {
                    await checkIn({
                      isGuest: true,
                      guestName,
                      sessionId,
                      backfill: backfillMode && canBackfill ? true : undefined,
                    });
                    toast.success(`${guestName} checked in`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not add guest");
                  }
                }}
              />
            </div>
          </div>

          {!hasFilter ? (
            <EmptyState
              icon={<UserPlus className="h-6 w-6" />}
              message="Search by name, email, or phone to find a household to check in."
            />
          ) : isLoading ? (
            <div className="py-[60px] text-center text-[14.5px] text-[#8A94A0]">Loading roster…</div>
          ) : households.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-6 w-6" />}
              message={`No one matches "${search}".`}
            />
          ) : (
            <div className="flex flex-col gap-5">
              {households.map((group) => (
                <div key={group.householdId}>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
                      {group.name}
                    </span>
                    {autoSessionType !== "everyone" &&
                      group.adults.length > 0 &&
                      group.members.some((p) => p.household_role === "child") && (
                      <label className="flex items-center gap-1.5 text-[12px] text-[#5B7185]">
                        Dropped off by
                        <select
                          value={dropOffForHousehold(group) ?? ""}
                          onChange={(e) => setDropOffFor(group.householdId, e.target.value)}
                          className="cursor-pointer rounded-lg border border-[#E5DCC8] bg-white px-2 py-1 text-[12px] text-brand-navy outline-none"
                        >
                          <option value="">Select…</option>
                          {group.adults.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.first_name} {a.last_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {group.members.map((profile) => (
                      <RosterRow
                        key={profile.id}
                        profile={profile}
                        event={event}
                        record={recordByProfile.get(profile.id)}
                        selectedSession={sessionForProfile(profile)}
                        busy={busy.has(profile.id)}
                        canCheckIn={canCheckIn}
                        checked={selected.has(profile.id)}
                        onToggleSelect={() => toggleSelected(profile.id)}
                        onUndo={() => handleUndo(profile.id)}
                        onChangeSession={(sid) => handleChangeSession(profile.id, sid)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selected.size > 0 && (
            <div className="sticky bottom-4 z-10 mt-4 flex flex-col items-end gap-1.5">
              {missingDropOff.length > 0 && (
                <span className="rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#B4462F] shadow-sm">
                  Select who dropped off {missingDropOff.join(", ")}
                </span>
              )}
              <button
                type="button"
                onClick={handleBatchCheckIn}
                disabled={batchSubmitting || missingDropOff.length > 0}
                className="rounded-full bg-brand-navy px-6 py-3 text-[14.5px] font-semibold text-brand-cream shadow-[0_4px_16px_rgba(26,58,92,0.3)] transition-colors hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {batchSubmitting ? "Checking in…" : `Check in ${selected.size}`}
              </button>
            </div>
          )}
        </>
      ) : (
        <CheckedInList
          records={records}
          event={event}
          busy={busy}
          profileById={profileById}
          onCheckOut={handleCheckOut}
          onUndo={handleUndo}
          onReprint={handleReprint}
        />
      )}

      {labelsToPrint && (
        <PrintLabelsSheet
          childLabels={labelsToPrint.children}
          parentTags={labelsToPrint.parentTags}
          onClose={() => setLabelsToPrint(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={`rounded-[12px] border px-4 py-2 ${
        accent ? "border-[#3F6B45]/30 bg-[#E6EEE1]" : "border-[#EAE2D0] bg-white"
      }`}
    >
      <div className={`text-[20px] font-semibold ${accent ? "text-[#3F6B45]" : "text-brand-navy"}`}>
        {value}
      </div>
      <div className="text-[11.5px] uppercase tracking-[0.04em] text-[#8A94A0]">{label}</div>
    </div>
  );
}

function TabButton({
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
      className={`flex-1 rounded-full px-3 py-2 text-[13.5px] font-semibold transition-colors ${
        active ? "bg-brand-navy text-brand-cream" : "text-[#5B7185]"
      }`}
    >
      {children}
    </button>
  );
}

function ToggleChip({
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
      className={`rounded-full border px-3.5 py-[7px] text-[13px] font-semibold transition-colors ${
        active
          ? "border-brand-navy bg-brand-navy text-brand-cream"
          : "border-[#E5DCC8] bg-white text-[#5B7185] hover:border-brand-navy/30"
      }`}
    >
      {children}
    </button>
  );
}

function gradeLabel(profile: Profile): string | null {
  if (profile.household_role === "child") {
    return profile.academic_grade ?? "Child";
  }
  return null;
}

function AllergyBadge({ profile }: { profile: Profile }) {
  if (!profile.allergy_notes && !profile.care_notes) return null;
  const text = profile.allergy_notes ?? profile.care_notes ?? "";
  return (
    <span
      title={text}
      className="inline-flex items-center gap-1 rounded-full bg-[#FBE9E7] px-2 py-0.5 text-[11px] font-semibold text-[#B4462F]"
    >
      <ShieldAlert className="h-3 w-3" />
      Allergy/care
    </span>
  );
}

function Avatar({ profile }: { profile: Profile }) {
  const tint = avatarTintForId(profile.id);
  if (profile.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={profile.photo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
      style={{ backgroundColor: tint.bg, color: tint.text }}
    >
      {initialsOf(profile.first_name, profile.last_name)}
    </div>
  );
}

function SessionSelect({
  event,
  value,
  onChange,
  disabled,
}: {
  event: AppEvent;
  value: string | undefined;
  onChange: (sessionId: string) => void;
  disabled?: boolean;
}) {
  // With 0 sessions there's the implicit "General" session, and with exactly
  // 1 there's nothing to choose — defaultSessionForProfile already
  // auto-assigns it, so showing a single-option dropdown would be redundant.
  if (event.sessions.length <= 1) return null;
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className="w-[120px] max-w-[42vw] cursor-pointer truncate rounded-lg border border-[#E5DCC8] bg-white px-2 py-1 text-[12.5px] text-brand-navy outline-none disabled:opacity-50 sm:w-[160px] sm:max-w-none"
    >
      <option value="">Session…</option>
      {event.sessions.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

function RosterRow({
  profile,
  event,
  record,
  selectedSession,
  busy,
  canCheckIn,
  checked,
  onToggleSelect,
  onUndo,
  onChangeSession,
}: {
  profile: Profile;
  event: AppEvent;
  record: CheckInRecord | undefined;
  selectedSession: string | undefined;
  busy: boolean;
  canCheckIn: boolean;
  checked: boolean;
  onToggleSelect: () => void;
  onUndo: () => void;
  onChangeSession: (sessionId: string) => void;
}) {
  const checkedIn = !!record;
  const grade = gradeLabel(profile);

  // Already checked in: unchanged from before — session select + Undo, not
  // selectable (there's nothing left to add them to a batch for).
  if (checkedIn) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[#3F6B45]/30 bg-[#F1F6EE] px-3.5 py-2.5 transition-colors">
        <Avatar profile={profile} />
        <div className="min-w-[110px] flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[14.5px] font-semibold text-brand-navy">
              {profile.first_name} {profile.last_name}
            </span>
            {grade && <span className="text-[12px] text-[#8A94A0]">{grade}</span>}
            {profile.household_role === "child" && <AllergyBadge profile={profile} />}
          </div>
          {record.sessionName && <div className="text-[12px] text-[#3F6B45]">In {record.sessionName}</div>}
          {record.droppedOffByName && (
            <div className="text-[12px] text-[#5B7185]">
              Dropped off by {record.droppedOffByName}
              {record.matchCode ? ` · Code ${record.matchCode}` : ""}
            </div>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SessionSelect event={event} value={record?.sessionId ?? undefined} onChange={onChangeSession} disabled={busy} />
          <button
            type="button"
            onClick={onUndo}
            disabled={busy}
            aria-label="Undo check-in"
            className="flex items-center gap-1.5 rounded-[10px] bg-[#3F6B45] px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#345839] disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            <X className="h-3.5 w-3.5 opacity-80" />
          </button>
        </div>
      </div>
    );
  }

  // Not yet checked in: tap-to-select card (batch-submitted via the "Check
  // in N" bar), mirroring Subsplash's own kiosk app rather than an immediate
  // per-row action. A plain div with button semantics, not a real <button> —
  // it contains a <select>, which HTML doesn't allow nested inside a button.
  function handleKeyDown(e: KeyboardEvent) {
    if (!canCheckIn) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggleSelect();
    }
  }

  return (
    <div
      role="button"
      tabIndex={canCheckIn ? 0 : -1}
      aria-pressed={checked}
      aria-disabled={!canCheckIn}
      onClick={canCheckIn ? onToggleSelect : undefined}
      onKeyDown={handleKeyDown}
      className={`flex flex-wrap items-center gap-3 rounded-[12px] border px-3.5 py-2.5 transition-colors ${
        canCheckIn ? "cursor-pointer" : "cursor-not-allowed opacity-50"
      } ${checked ? "border-brand-navy bg-brand-navy/5" : "border-[#EAE2D0] bg-white hover:border-brand-navy/30"}`}
    >
      <div className="relative shrink-0">
        <Avatar profile={profile} />
        {checked && (
          <span className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-brand-navy ring-2 ring-white">
            <Check className="h-3 w-3 text-brand-cream" />
          </span>
        )}
      </div>
      <div className="min-w-[110px] flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[14.5px] font-semibold text-brand-navy">
            {profile.first_name} {profile.last_name}
          </span>
          {grade && <span className="text-[12px] text-[#8A94A0]">{grade}</span>}
          {profile.household_role === "child" && <AllergyBadge profile={profile} />}
        </div>
      </div>
      <div className="ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
        <SessionSelect event={event} value={selectedSession} onChange={onChangeSession} disabled={busy} />
      </div>
    </div>
  );
}

function CheckedInList({
  records,
  event,
  busy,
  profileById,
  onCheckOut,
  onUndo,
  onReprint,
}: {
  records: CheckInRecord[];
  event: AppEvent;
  busy: Set<string>;
  profileById: Map<string, Profile>;
  onCheckOut: (profileId: string) => void;
  onUndo: (profileId: string) => void;
  onReprint: (profileId: string) => void;
}) {
  const present = records.filter((r) => !r.checkedOutAt);
  const departed = records.filter((r) => r.checkedOutAt);

  if (records.length === 0) {
    return <EmptyState icon={<Check className="h-6 w-6" />} message="No one is checked in yet." />;
  }

  const renderRow = (r: CheckInRecord) => {
    const profile = profileById.get(r.profileId);
    const departedRow = !!r.checkedOutAt;
    return (
      <div
        key={r.id}
        className={`flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5 ${
          departedRow ? "border-[#EAE2D0] bg-[#F7F4EC] opacity-70" : "border-[#EAE2D0] bg-white"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[14.5px] font-semibold text-brand-navy">{r.displayName}</span>
            {r.isGuest && (
              <span className="rounded-full bg-[#EEF2F6] px-2 py-0.5 text-[11px] font-semibold text-[#4C6178]">
                Guest
              </span>
            )}
            {profile?.household_role === "child" && <AllergyBadge profile={profile} />}
          </div>
          <div className="mt-0.5 text-[12px] text-[#8A94A0]">
            {r.sessionName ? `${r.sessionName} · ` : ""}
            In {timeLabelInTz(new Date(r.checkedInAt), event.timezone)}
            {r.checkedOutAt ? ` · Out ${timeLabelInTz(new Date(r.checkedOutAt), event.timezone)}` : ""}
          </div>
          {r.droppedOffByName && (
            <div className="mt-0.5 text-[12px] text-[#5B7185]">
              Dropped off by {r.droppedOffByName}
              {r.matchCode ? ` · Code ${r.matchCode}` : ""}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Only a child ever gets a printed label (ChildLabelData's own
              scope) — present or departed, since a reprint doesn't depend on
              still being checked in. */}
          {r.isChild && (
            <button
              type="button"
              onClick={() => onReprint(r.profileId)}
              disabled={busy.has(r.profileId)}
              className="flex items-center gap-1.5 rounded-[10px] border border-[#E5DCC8] bg-white px-3 py-2 text-[13px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/30 disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" />
              Reprint
            </button>
          )}
          {!departedRow && (
            <button
              type="button"
              onClick={() => onCheckOut(r.profileId)}
              disabled={busy.has(r.profileId)}
              className="flex items-center gap-1.5 rounded-[10px] border border-[#E5DCC8] bg-white px-3 py-2 text-[13px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/30 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Check out
            </button>
          )}
          <button
            type="button"
            onClick={() => onUndo(r.profileId)}
            disabled={busy.has(r.profileId)}
            aria-label="Remove check-in"
            className="rounded-[10px] border border-[#E5DCC8] bg-white p-2 text-[#B4462F] transition-colors hover:border-[#B4462F]/40 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
          Present ({present.length})
        </div>
        <div className="flex flex-col gap-2">{present.map(renderRow)}</div>
      </div>
      {departed.length > 0 && (
        <div>
          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
            Checked out ({departed.length})
          </div>
          <div className="flex flex-col gap-2">{departed.map(renderRow)}</div>
        </div>
      )}
    </div>
  );
}

function GuestButton({
  event,
  disabled,
  onAdd,
}: {
  event: AppEvent;
  disabled?: boolean;
  onAdd: (guestName: string, sessionId?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sessionId, setSessionId] = useState("");
  // With exactly one session there's no dropdown to pick it from (below), so
  // it's auto-assigned the same way defaultSessionForProfile does for the
  // roster rows.
  const singleSessionId = event.sessions.length === 1 ? event.sessions[0].id : undefined;

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="ml-auto flex items-center gap-1.5 rounded-full border border-dashed border-[#C6B98F] bg-white px-3.5 py-[7px] text-[13px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Add guest
      </button>
    );
  }

  return (
    <div className="ml-auto flex w-full flex-wrap items-center gap-2 rounded-[10px] border border-[#E5DCC8] bg-white px-2 py-1.5 sm:w-auto">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Guest name"
        className="w-24 border-none bg-transparent text-[13px] text-brand-navy outline-none placeholder:text-[#97A9B8] sm:w-32"
      />
      {event.sessions.length > 1 && (
        <select
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          className="w-[110px] max-w-[38vw] cursor-pointer truncate rounded-lg border border-[#E5DCC8] bg-white px-2 py-1 text-[12.5px] text-brand-navy outline-none sm:w-[160px] sm:max-w-none"
        >
          <option value="">Session…</option>
          {event.sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={async () => {
          if (!name.trim()) return;
          await onAdd(name.trim(), sessionId || singleSessionId);
          setName("");
          setSessionId("");
          setOpen(false);
        }}
        className="rounded-[8px] bg-brand-navy px-3 py-1.5 text-[12.5px] font-semibold text-brand-cream"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Cancel"
        className="p-1 text-[#8A94A0]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
