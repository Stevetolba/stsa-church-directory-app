"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, HeartHandshake, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { SearchBar } from "@/components/SearchBar";
import { EmptyState } from "@/components/EmptyState";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { SuggestedFilters, type SuggestedFilter } from "@/components/SuggestedFilters";
import { useVolunteerOptions, useVolunteers } from "@/hooks/useVolunteers";
import { downloadCsv, toCsv, VOLUNTEER_EXPORT_COLUMNS, volunteerToExportRow } from "@/lib/csv";
import type { Campus, Profile } from "@/types/profile";
import type { VolunteerRow } from "@/types/volunteer";

const CAMPUS_OPTIONS: Campus[] = ["Arlington", "Leesburg"];

interface RosterPreset {
  campus: Campus[];
  roles?: string[];
}

const SUGGESTED_FILTERS: SuggestedFilter<RosterPreset>[] = [
  { label: "Arlington Volunteers", preset: { campus: ["Arlington"] } },
  { label: "Leesburg Volunteers", preset: { campus: ["Leesburg"] } },
  { label: "Arlington Team Leads", preset: { campus: ["Arlington"], roles: ["Team Lead"] } },
  { label: "Leesburg Team Leads", preset: { campus: ["Leesburg"], roles: ["Team Lead"] } },
];

const secondaryButton =
  "flex items-center gap-2 whitespace-nowrap rounded-[10px] border border-[#CBD2D9] bg-white px-4 py-2 text-[13.5px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/30 disabled:cursor-not-allowed disabled:opacity-40";

export function VolunteersPageClient({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Filter state lives in the URL (same pattern as the People page) so a
  // filtered roster is linkable and survives refresh.
  const search = searchParams.get("search") ?? "";
  const campus = searchParams.getAll("campus").filter((c): c is Campus => c === "Arlington" || c === "Leesburg");
  const teams = searchParams.getAll("team");
  const roles = searchParams.getAll("role");
  const hasActiveFilter = !!search || campus.length > 0 || teams.length > 0 || roles.length > 0;

  function setParams(next: { search?: string; campus?: string[]; team?: string[]; role?: string[] }) {
    const params = new URLSearchParams(searchParams.toString());
    const apply = (key: string, values: string[] | undefined) => {
      if (values === undefined) return;
      params.delete(key);
      values.forEach((v) => params.append(key, v));
    };
    if (next.search !== undefined) {
      if (next.search) params.set("search", next.search);
      else params.delete("search");
    }
    apply("campus", next.campus);
    apply("team", next.team);
    apply("role", next.role);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const { data, error, isLoading, mutate } = useVolunteers({ search, campus, teams, roles });
  const { options, refreshOptions } = useVolunteerOptions();
  const volunteers = data?.volunteers ?? [];

  const [editing, setEditing] = useState<VolunteerRow | null>(null);
  const [adding, setAdding] = useState(false);

  // Subsplash's profile list can lag a moment behind a save, so refetching
  // right after one can return the old roster. Instead, apply the saved
  // change to the on-screen list directly (honouring the active filters) and
  // skip the immediate revalidate — the next focus/refresh picks up the
  // server's view. `row` null means removed.
  const applyLocalChange = useCallback(
    async (id: string, row: VolunteerRow | null) => {
      const needle = search.trim().toLowerCase();
      const matches = (v: VolunteerRow) =>
        (!needle || `${v.first_name} ${v.last_name} ${v.email}`.toLowerCase().includes(needle)) &&
        (campus.length === 0 || v.campuses.some((c) => campus.includes(c))) &&
        (teams.length === 0 || v.teams.some((t) => teams.includes(t))) &&
        (roles.length === 0 || v.ministry_roles.some((r) => roles.includes(r)));
      await mutate(
        (current) => {
          const list = (current?.volunteers ?? []).filter((v) => v.id !== id);
          if (row && matches(row)) list.push(row);
          list.sort(
            (a, b) =>
              a.last_name.localeCompare(b.last_name, undefined, { sensitivity: "base" }) ||
              a.first_name.localeCompare(b.first_name, undefined, { sensitivity: "base" })
          );
          return { volunteers: list, total: list.length };
        },
        { revalidate: false }
      );
    },
    [mutate, search, campus, teams, roles]
  );

  async function handleRemove(v: VolunteerRow) {
    const name = `${v.first_name} ${v.last_name}`;
    if (!window.confirm(`Remove ${name} from the volunteer roster? This clears their Team and Role.`)) return;
    const res = await fetch(`/api/volunteers/${v.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error((body?.error as string | undefined) ?? "Could not remove volunteer.");
      return;
    }
    toast.success(`${name} removed from the roster`);
    await applyLocalChange(v.id, null);
    void refreshOptions();
  }

  function handleExport() {
    if (volunteers.length === 0) return;
    const csv = toCsv(volunteers.map(volunteerToExportRow), VOLUNTEER_EXPORT_COLUMNS);
    downloadCsv(`volunteers-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  function toggleCampus(c: Campus) {
    setParams({ campus: campus.includes(c) ? campus.filter((x) => x !== c) : [...campus, c] });
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-brand-navy">Volunteers</h1>
          <p className="mt-1 text-[14.5px] text-[#5B7185]">
            {data ? `${data.total} volunteer${data.total === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={volunteers.length === 0}
            className={secondaryButton}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 whitespace-nowrap rounded-[10px] bg-brand-navy px-4 py-2 text-[13.5px] font-semibold text-brand-cream"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Volunteer
            </button>
          )}
        </div>
      </div>

      <div className="mb-4">
        <SuggestedFilters
          filters={SUGGESTED_FILTERS}
          onSelect={(preset) =>
            setParams({ search: "", campus: preset.campus, team: [], role: preset.roles ?? [] })
          }
        />
      </div>

      <div className="mb-6 flex flex-col gap-3">
        <SearchBar
          defaultValue={search}
          onDebouncedChange={(value) => setParams({ search: value })}
          placeholder="Search by name or email"
        />
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[auto_1fr_1fr_auto]">
          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-[#5B7185]">Campus</div>
            <div className="flex h-[42px] items-center gap-5">
              {CAMPUS_OPTIONS.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 text-[13.5px] text-brand-navy">
                  <input
                    type="checkbox"
                    checked={campus.includes(c)}
                    onChange={() => toggleCampus(c)}
                    className="h-4 w-4 rounded border-[#CBD2D9] text-brand-navy focus:ring-brand-sky"
                  />
                  {c}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-[#5B7185]">Team</div>
            <MultiSelectDropdown
              label="Team"
              options={options.teams}
              value={teams}
              onChange={(next) => setParams({ team: next })}
              placeholder="All teams"
            />
          </div>
          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-[#5B7185]">Role</div>
            <MultiSelectDropdown
              label="Role"
              options={options.roles}
              value={roles}
              onChange={(next) => setParams({ role: next })}
              placeholder="All roles"
            />
          </div>
          <button
            type="button"
            disabled={!hasActiveFilter}
            onClick={() => setParams({ search: "", campus: [], team: [], role: [] })}
            className={`${secondaryButton} h-[42px]`}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      </div>

      {error ? (
        <EmptyState message="Couldn't load the volunteer roster. Please try again." />
      ) : isLoading && !data ? (
        <EmptyState message="Loading volunteers…" />
      ) : volunteers.length === 0 ? (
        <EmptyState
          icon={<HeartHandshake className="h-6 w-6" />}
          message={hasActiveFilter ? "No volunteers match these filters." : "No volunteers on the roster yet."}
        />
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-[#CBD2D9] bg-white shadow-[0_1px_3px_rgba(26,58,92,0.05)]">
          <table className="w-full min-w-[760px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#E4E8EC] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8A94A0]">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Campus</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {volunteers.map((v) => (
                <tr key={v.id} className="border-b border-[#F0F2F5] last:border-0 align-top">
                  <td className="px-4 py-3 font-semibold text-brand-navy">
                    {isAdmin ? (
                      <Link href={`/people/${v.id}`} className="hover:underline">
                        {v.first_name} {v.last_name}
                      </Link>
                    ) : (
                      <>
                        {v.first_name} {v.last_name}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#5B7185]">{v.campuses.join(", ") || "—"}</td>
                  <td className="px-4 py-3">
                    <Chips values={v.teams} />
                  </td>
                  <td className="px-4 py-3">
                    <Chips values={v.ministry_roles} />
                  </td>
                  <td className="px-4 py-3 text-[#5B7185]">{v.email || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-[#5B7185]">{v.phone_number || "—"}</td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditing(v)}
                          aria-label={`Edit ${v.first_name} ${v.last_name}`}
                          className="rounded-lg border border-[#CBD2D9] p-1.5 text-[#5B7185] hover:border-brand-navy/30"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(v)}
                          aria-label={`Remove ${v.first_name} ${v.last_name}`}
                          className="rounded-lg border border-[#CBD2D9] p-1.5 text-destructive hover:border-destructive/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && (adding || editing) && (
        <VolunteerEditorModal
          existing={editing}
          teamOptions={options.teams}
          roleOptions={options.roles}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={async (row) => {
            setAdding(false);
            setEditing(null);
            await applyLocalChange(row.id, row);
            void refreshOptions();
          }}
        />
      )}
    </div>
  );
}

function Chips({ values }: { values: string[] }) {
  if (values.length === 0) return <span className="text-[#8A94A0]">—</span>;
  const sorted = [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return (
    <div className="flex flex-wrap gap-1.5">
      {sorted.map((v) => (
        <span
          key={v}
          className="whitespace-nowrap rounded-full bg-[#EAF0F5] px-2.5 py-0.5 text-[12px] font-semibold text-brand-navy"
        >
          {v}
        </span>
      ))}
    </div>
  );
}

// Add (pick a person, then Team/Role) or edit (person fixed) — both end in
// PATCH /api/volunteers/[id]. Admin only; the route re-enforces that.
function VolunteerEditorModal({
  existing,
  teamOptions,
  roleOptions,
  onClose,
  onSaved,
}: {
  existing: VolunteerRow | null;
  teamOptions: string[];
  roleOptions: string[];
  onClose: () => void;
  onSaved: (row: VolunteerRow) => Promise<void>;
}) {
  // `base` carries the contact fields the roster row needs, so the saved row
  // can be shown immediately without waiting for a refetch.
  const [person, setPerson] = useState<{ id: string; name: string; base: Omit<VolunteerRow, "teams" | "ministry_roles"> } | null>(
    existing
      ? {
          id: existing.id,
          name: `${existing.first_name} ${existing.last_name}`,
          base: {
            id: existing.id,
            first_name: existing.first_name,
            last_name: existing.last_name,
            email: existing.email,
            phone_number: existing.phone_number,
            status: existing.status,
            campuses: existing.campuses,
          },
        }
      : null
  );
  const [teams, setTeams] = useState<string[]>(existing?.teams ?? []);
  const [roles, setRoles] = useState<string[]>(existing?.ministry_roles ?? []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // People search for the "add" flow — debounced, excludes anyone already on
  // the roster (they're edited from the table instead).
  useEffect(() => {
    if (existing || person || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/profiles?search=${encodeURIComponent(query.trim())}&pageSize=10`);
        if (res.ok) {
          const body = (await res.json()) as { profiles: Profile[] };
          setResults(body.profiles.filter((p) => !(p.teams?.length || p.ministry_roles?.length)));
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, existing, person]);

  const canSave = useMemo(() => !!person && (teams.length > 0 || roles.length > 0), [person, teams, roles]);

  async function handleSave() {
    if (!person) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/volunteers/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teams, ministry_roles: roles }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError((body?.error as string | undefined) ?? "Could not save. Please try again.");
        return;
      }
      toast.success(existing ? "Volunteer updated" : "Volunteer added");
      await onSaved({ ...person.base, teams, ministry_roles: roles });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={existing ? "Edit volunteer" : "Add volunteer"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[480px] rounded-[14px] bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-xl font-semibold text-brand-navy">
            {existing ? "Edit Volunteer" : "Add Volunteer"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#8A94A0]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-[#5B7185]">Person</div>
            {person ? (
              <div className="flex items-center justify-between rounded-[10px] border border-[#CBD2D9] px-3.5 py-2.5 text-[14px] text-brand-navy">
                <span className="font-semibold">{person.name}</span>
                {!existing && (
                  <button
                    type="button"
                    onClick={() => setPerson(null)}
                    className="text-[12px] font-semibold text-[#5B7185] hover:underline"
                  >
                    Change
                  </button>
                )}
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people by name or email"
                  aria-label="Search people"
                  className="w-full rounded-[10px] border border-[#CBD2D9] px-3.5 py-2.5 text-[14px] outline-none focus:border-brand-sky"
                />
                {query.trim().length >= 2 && (
                  <ul className="mt-1.5 max-h-48 overflow-y-auto rounded-[10px] border border-[#E4E8EC]">
                    {searching && <li className="px-3 py-2 text-[13px] text-[#8A94A0]">Searching…</li>}
                    {!searching && results.length === 0 && (
                      <li className="px-3 py-2 text-[13px] text-[#8A94A0]">
                        No people found who aren&apos;t already volunteers.
                      </li>
                    )}
                    {results.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPerson({
                              id: p.id,
                              name: `${p.first_name} ${p.last_name}`,
                              base: {
                                id: p.id,
                                first_name: p.first_name,
                                last_name: p.last_name,
                                email: p.email,
                                phone_number: p.phone_number,
                                status: p.status,
                                campuses: p.campuses ?? (p.campus ? [p.campus] : []),
                              },
                            });
                            setQuery("");
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-[13.5px] hover:bg-[#F3F6F9]"
                        >
                          <span className="font-semibold text-brand-navy">
                            {p.first_name} {p.last_name}
                          </span>
                          <span className="text-[12px] text-[#8A94A0]">{p.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-[#5B7185]">Team</div>
            <MultiSelectDropdown
              label="Team"
              options={teamOptions}
              value={teams}
              onChange={setTeams}
              placeholder="Select teams"
            />
          </div>
          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-[#5B7185]">Role</div>
            <MultiSelectDropdown
              label="Role"
              options={roleOptions}
              value={roles}
              onChange={setRoles}
              placeholder="Select roles"
            />
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-[13px] text-destructive">{error}</p>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="rounded-[10px] bg-brand-navy px-5 py-2.5 text-[14px] font-semibold text-brand-cream disabled:opacity-50"
          >
            {saving ? "Saving…" : existing ? "Save Changes" : "Add to Roster"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#CBD2D9] px-5 py-2.5 text-[14px] font-semibold text-[#5B7185]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
