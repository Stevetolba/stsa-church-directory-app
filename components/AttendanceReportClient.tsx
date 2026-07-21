"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, BarChart3, Download, Mail, UserX } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { EmailAbsenteesDialog } from "@/components/EmailAbsenteesDialog";
import { FilterPill } from "@/components/FilterPill";
import { AddFilterMenu } from "@/components/AddFilterMenu";
import { avatarTintForId, initialsOf } from "@/lib/avatar";
import { formatDate } from "@/lib/utils";
import { timeLabelInTz } from "@/lib/eventTime";
import { eventAutoSessionType } from "@/lib/sessionMapping";
import { campusGroupFor, type SeriesOccurrence } from "@/lib/events";
import { GRADE_LEVELS } from "@/lib/grades";
import {
  OCCURRENCE_REPORT_COLUMNS,
  checkInToExportRow,
  downloadCsv,
  seriesFrequencyColumns,
  seriesFrequencyToExportRow,
  toCsv,
} from "@/lib/csv";
import type { AppEvent } from "@/types/event";
import type { AttendanceSummary, CheckInRecord } from "@/types/attendance";
import type { SeriesFrequencyResult } from "@/lib/attendance";
import type { Campus, MemberStatus, Profile } from "@/types/profile";

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// --- Report filters (Campus/Status/Grade) shared by all three tabs ---
// Same FilterPill/AddFilterMenu "dynamic filter" pattern as the People/
// Children pages (PeoplePageClient), but kept as per-tab local state rather
// than URL params — each tab already manages its own local state (date,
// month/year range, lastN, etc.), not a shared URL-driven view.

const STATUS_OPTIONS: MemberStatus[] = [
  "Member",
  "Regular Attendee",
  "Visitor",
  "Newcomer",
  "Former Attender",
];

const CAMPUS_OPTIONS: Campus[] = ["Arlington", "Leesburg"];

type ReportFilterKey = "campus" | "status" | "grade";
const ALL_REPORT_FILTER_KEYS: ReportFilterKey[] = ["campus", "status", "grade"];
const REPORT_FILTER_LABELS: Record<ReportFilterKey, string> = {
  campus: "Campus",
  status: "Status",
  grade: "Grade",
};

interface ReportFilters {
  campus: Campus[];
  status: MemberStatus[];
  gradeFrom?: number;
  gradeTo?: number;
}

const EMPTY_REPORT_FILTERS: ReportFilters = { campus: [], status: [] };

function reportFiltersToParams(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams();
  filters.campus.forEach((c) => params.append("campus", c));
  filters.status.forEach((s) => params.append("status", s));
  if (filters.gradeFrom !== undefined) params.set("gradeFrom", String(filters.gradeFrom));
  if (filters.gradeTo !== undefined) params.set("gradeTo", String(filters.gradeTo));
  return params;
}

function summarizeCampus(campus: Campus[]): string {
  if (campus.length === 0) return "Campus";
  return `Campus: ${campus.join(", ")}`;
}

function summarizeStatus(status: MemberStatus[]): string {
  if (status.length === 0) return "Status";
  if (status.length > 2) return `Status: ${status.length} selected`;
  return `Status: ${status.join(", ")}`;
}

function summarizeGrade(gradeFrom?: number, gradeTo?: number): string {
  if (gradeFrom === undefined && gradeTo === undefined) return "Grade";
  const from = GRADE_LEVELS.find((g) => g.value === gradeFrom)?.label;
  const to = GRADE_LEVELS.find((g) => g.value === gradeTo)?.label;
  if (from && to) return `Grade: ${from} – ${to}`;
  if (from) return `Grade: ${from}+`;
  if (to) return `Grade: up to ${to}`;
  return "Grade";
}

// Renders the active filter pills + "+ Filter" menu for one tab. The
// filter *values* are lifted to the caller (each tab needs them in its SWR
// query key); this component only owns the "which pill is open / manually
// added but still empty" UI state, same split PeoplePageClient uses.
function ReportFilterBar({
  filters,
  onChange,
}: {
  filters: ReportFilters;
  onChange: (next: ReportFilters) => void;
}) {
  const [manuallyAdded, setManuallyAdded] = useState<Set<ReportFilterKey>>(new Set());
  const [openFilter, setOpenFilter] = useState<ReportFilterKey | null>(null);

  const activeFilters = new Set<ReportFilterKey>(manuallyAdded);
  if (filters.campus.length > 0) activeFilters.add("campus");
  if (filters.status.length > 0) activeFilters.add("status");
  if (filters.gradeFrom !== undefined || filters.gradeTo !== undefined) activeFilters.add("grade");

  function toggleListValue(key: "campus" | "status", value: string) {
    const current = filters[key] as string[];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ ...filters, [key]: next });
  }

  function handleAddFilter(key: ReportFilterKey) {
    setManuallyAdded((prev) => new Set(prev).add(key));
    setOpenFilter(key);
  }

  function handleRemoveFilter(key: ReportFilterKey) {
    setManuallyAdded((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (openFilter === key) setOpenFilter(null);
    if (key === "campus") onChange({ ...filters, campus: [] });
    else if (key === "status") onChange({ ...filters, status: [] });
    else onChange({ ...filters, gradeFrom: undefined, gradeTo: undefined });
  }

  return (
    <>
      {activeFilters.has("campus") && (
        <FilterPill
          label={summarizeCampus(filters.campus)}
          active={filters.campus.length > 0}
          open={openFilter === "campus"}
          onOpenChange={(open) => setOpenFilter(open ? "campus" : null)}
          onRemove={() => handleRemoveFilter("campus")}
        >
          <div className="flex flex-col gap-1.5">
            {CAMPUS_OPTIONS.map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2 text-[13.5px] text-brand-navy">
                <input
                  type="checkbox"
                  checked={filters.campus.includes(option)}
                  onChange={() => toggleListValue("campus", option)}
                  className="h-4 w-4 rounded border-[#E5DCC8] text-brand-navy focus:ring-brand-sky"
                />
                {option}
              </label>
            ))}
          </div>
        </FilterPill>
      )}

      {activeFilters.has("status") && (
        <FilterPill
          label={summarizeStatus(filters.status)}
          active={filters.status.length > 0}
          open={openFilter === "status"}
          onOpenChange={(open) => setOpenFilter(open ? "status" : null)}
          onRemove={() => handleRemoveFilter("status")}
        >
          <div className="flex flex-col gap-1.5">
            {STATUS_OPTIONS.map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2 text-[13.5px] text-brand-navy">
                <input
                  type="checkbox"
                  checked={filters.status.includes(option)}
                  onChange={() => toggleListValue("status", option)}
                  className="h-4 w-4 rounded border-[#E5DCC8] text-brand-navy focus:ring-brand-sky"
                />
                {option}
              </label>
            ))}
          </div>
        </FilterPill>
      )}

      {activeFilters.has("grade") && (
        <FilterPill
          label={summarizeGrade(filters.gradeFrom, filters.gradeTo)}
          active={filters.gradeFrom !== undefined || filters.gradeTo !== undefined}
          open={openFilter === "grade"}
          onOpenChange={(open) => setOpenFilter(open ? "grade" : null)}
          onRemove={() => handleRemoveFilter("grade")}
        >
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
                Min
              </label>
              <select
                value={filters.gradeFrom ?? ""}
                onChange={(e) =>
                  onChange({ ...filters, gradeFrom: e.target.value ? Number(e.target.value) : undefined })
                }
                className="w-full cursor-pointer rounded-lg border border-[#E5DCC8] bg-white px-2.5 py-1.5 text-[13.5px] text-brand-navy outline-none"
              >
                <option value="">None</option>
                {GRADE_LEVELS.map((grade) => (
                  <option key={grade.value} value={grade.value}>
                    {grade.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
                Max
              </label>
              <select
                value={filters.gradeTo ?? ""}
                onChange={(e) =>
                  onChange({ ...filters, gradeTo: e.target.value ? Number(e.target.value) : undefined })
                }
                className="w-full cursor-pointer rounded-lg border border-[#E5DCC8] bg-white px-2.5 py-1.5 text-[13.5px] text-brand-navy outline-none"
              >
                <option value="">None</option>
                {GRADE_LEVELS.map((grade) => (
                  <option key={grade.value} value={grade.value}>
                    {grade.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </FilterPill>
      )}

      <AddFilterMenu
        options={ALL_REPORT_FILTER_KEYS.filter((key) => !activeFilters.has(key)).map((key) => ({
          key,
          label: REPORT_FILTER_LABELS[key],
        }))}
        onSelect={(key) => handleAddFilter(key as ReportFilterKey)}
      />

      {activeFilters.size > 0 && (
        <button
          type="button"
          onClick={() => {
            setManuallyAdded(new Set());
            setOpenFilter(null);
            onChange(EMPTY_REPORT_FILTERS);
          }}
          className="whitespace-nowrap text-[13px] font-semibold text-[#5B7185] underline-offset-2 hover:underline"
        >
          Clear all
        </button>
      )}
    </>
  );
}

type Tab = "occurrence" | "series" | "absentees";

// ADR-0015 (Phase 4): staff/admin attendance reporting for a series — three
// tabs. Occurrence: one date's full attendee list (via
// /api/attendance/report?seriesId&occurrenceDate, which reads check-ins
// directly rather than requiring a resolvable Subsplash event, so a
// backfill-only date still works). Series: a frequency table over a month
// or year range. Absentees: roster minus attended over the last N
// occurrences — the only view that can surface someone who has *never*
// attended, since a GROUP BY over check-ins can't.
export function AttendanceReportClient({
  event,
  occurrences,
  user,
  fromAddress,
}: {
  event: AppEvent;
  occurrences: SeriesOccurrence[];
  user: { name: string; email: string };
  fromAddress: string;
}) {
  const [tab, setTab] = useState<Tab>("occurrence");

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/reports"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#5B7185] hover:text-brand-navy"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All reports
      </Link>

      <div className="mb-5">
        <h1 className="font-heading text-2xl font-semibold text-brand-navy">{event.title}</h1>
        <p className="mt-1 text-[13.5px] text-[#5B7185]">Attendance report</p>
      </div>

      <div className="mb-5 flex w-fit items-center rounded-full border border-[#E5DCC8] bg-white p-0.5">
        <TabButton active={tab === "occurrence"} onClick={() => setTab("occurrence")}>
          Occurrence
        </TabButton>
        <TabButton active={tab === "series"} onClick={() => setTab("series")}>
          Series
        </TabButton>
        <TabButton active={tab === "absentees"} onClick={() => setTab("absentees")}>
          Absentees
        </TabButton>
      </div>

      {tab === "occurrence" && <OccurrenceTab event={event} occurrences={occurrences} />}
      {tab === "series" && <SeriesTab event={event} />}
      {tab === "absentees" && <AbsenteesTab event={event} user={user} fromAddress={fromAddress} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
        active ? "bg-brand-navy text-brand-cream" : "text-[#5B7185]"
      }`}
    >
      {children}
    </button>
  );
}

function Loading() {
  return <div className="py-[60px] text-center text-[14.5px] text-[#8A94A0]">Loading…</div>;
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-[12px] border px-4 py-2 ${accent ? "border-[#3F6B45]/30 bg-[#E6EEE1]" : "border-[#EAE2D0] bg-white"}`}>
      <div className={`text-[20px] font-semibold ${accent ? "text-[#3F6B45]" : "text-brand-navy"}`}>{value}</div>
      <div className="text-[11.5px] uppercase tracking-[0.04em] text-[#8A94A0]">{label}</div>
    </div>
  );
}

function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-[10px] border border-[#E5DCC8] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download className="h-3.5 w-3.5" />
      Export CSV
    </button>
  );
}

function NameAvatar({ displayName }: { displayName: string }) {
  const [first, ...rest] = displayName.trim().split(/\s+/);
  const last = rest.join(" ");
  const tint = avatarTintForId(displayName);
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold"
      style={{ backgroundColor: tint.bg, color: tint.text }}
    >
      {initialsOf(first ?? "", last)}
    </div>
  );
}

// --- Occurrence tab ---

function OccurrenceTab({ event, occurrences }: { event: AppEvent; occurrences: SeriesOccurrence[] }) {
  const [occurrenceDate, setOccurrenceDate] = useState(
    occurrences.find((o) => o.occurrence_date === event.occurrence_date)?.occurrence_date ??
      occurrences[0]?.occurrence_date ??
      event.occurrence_date
  );
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);
  const filterQuery = reportFiltersToParams(filters).toString();

  const { data, isLoading } = useSWR<{ records: CheckInRecord[]; summary: AttendanceSummary }>(
    `/api/attendance/report?seriesId=${encodeURIComponent(event.series_id)}&occurrenceDate=${occurrenceDate}${
      filterQuery ? `&${filterQuery}` : ""
    }`,
    fetcher
  );
  const records = data?.records ?? [];
  const summary = data?.summary;
  const attendees = records.filter((r) => !r.isGuest);
  const guests = records.filter((r) => r.isGuest);

  function handleExport() {
    const rows = records.map((r) => checkInToExportRow(r, event.timezone));
    downloadCsv(`attendance-${occurrenceDate}.csv`, toCsv(rows, OCCURRENCE_REPORT_COLUMNS));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={occurrenceDate}
          onChange={(e) => setOccurrenceDate(e.target.value)}
          className="cursor-pointer rounded-[10px] border border-[#E5DCC8] bg-white px-3 py-2 text-[13.5px] text-brand-navy outline-none"
        >
          {occurrences.map((o) => (
            <option key={o.occurrence_date} value={o.occurrence_date}>
              {formatDate(o.occurrence_date)}
              {!o.hasEvent ? " (backfilled)" : ""}
            </option>
          ))}
        </select>
        <ReportFilterBar filters={filters} onChange={setFilters} />
        <ExportButton onClick={handleExport} disabled={records.length === 0} />
      </div>

      {summary && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Stat label="Present" value={summary.present} accent />
          <Stat label="Checked in" value={summary.total} />
          <Stat label="Children" value={summary.children} />
          <Stat label="Adults" value={summary.adults} />
          {summary.guests > 0 && <Stat label="Guests" value={summary.guests} />}
        </div>
      )}

      {isLoading ? (
        <Loading />
      ) : records.length === 0 ? (
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} message="No check-ins for this occurrence." />
      ) : (
        <div className="flex flex-col gap-5">
          <AttendeeTable title={`Attendees (${attendees.length})`} records={attendees} timezone={event.timezone} />
          {guests.length > 0 && (
            <AttendeeTable title={`Guests (${guests.length})`} records={guests} timezone={event.timezone} />
          )}
        </div>
      )}
    </div>
  );
}

function AttendeeTable({ title, records, timezone }: { title: string; records: CheckInRecord[]; timezone: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">{title}</div>
      <div className="flex flex-col gap-2">
        {records.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[#EAE2D0] bg-white px-3.5 py-2.5">
            <NameAvatar displayName={r.displayName} />
            <div className="min-w-[110px] flex-1">
              <div className="text-[14.5px] font-semibold text-brand-navy">{r.displayName}</div>
              <div className="text-[12px] text-[#8A94A0]">
                {r.sessionName ? `${r.sessionName} · ` : ""}
                In {timeLabelInTz(new Date(r.checkedInAt), timezone)} by {r.checkedInBy}
                {r.checkedOutAt ? ` · Out ${timeLabelInTz(new Date(r.checkedOutAt), timezone)} by ${r.checkedOutBy}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Series tab ---

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function yearRange(year: string): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

type ChildFilter = "all" | "children" | "adults";

function SeriesTab({ event }: { event: AppEvent }) {
  const now = new Date();
  const [rangeMode, setRangeMode] = useState<"month" | "year">("month");
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [childFilter, setChildFilter] = useState<ChildFilter>("all");
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);
  const filterQuery = reportFiltersToParams(filters).toString();

  const { from, to } = rangeMode === "month" ? monthRange(month) : yearRange(year);
  const { data, isLoading } = useSWR<SeriesFrequencyResult>(
    `/api/attendance/report?seriesId=${encodeURIComponent(event.series_id)}&from=${from}&to=${to}${
      filterQuery ? `&${filterQuery}` : ""
    }`,
    fetcher
  );
  const occurrenceDates = data?.occurrenceDates ?? [];
  const people = useMemo(() => {
    const list = data?.people ?? [];
    if (childFilter === "all") return list;
    return list.filter((p) => (childFilter === "children" ? p.isChild : !p.isChild));
  }, [data, childFilter]);

  function handleExport() {
    const columns = seriesFrequencyColumns(occurrenceDates);
    const rows = people.map((p) => seriesFrequencyToExportRow(p, occurrenceDates));
    downloadCsv(`series-attendance-${from}-to-${to}.csv`, toCsv(rows, columns));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-full border border-[#E5DCC8] bg-white p-0.5">
          <TabButton active={rangeMode === "month"} onClick={() => setRangeMode("month")}>
            Month
          </TabButton>
          <TabButton active={rangeMode === "year"} onClick={() => setRangeMode("year")}>
            Year
          </TabButton>
        </div>
        {rangeMode === "month" ? (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-[10px] border border-[#E5DCC8] bg-white px-3 py-2 text-[13.5px] text-brand-navy outline-none"
          />
        ) : (
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-24 rounded-[10px] border border-[#E5DCC8] bg-white px-3 py-2 text-[13.5px] text-brand-navy outline-none"
          />
        )}
        <select
          value={childFilter}
          onChange={(e) => setChildFilter(e.target.value as ChildFilter)}
          className="cursor-pointer rounded-[10px] border border-[#E5DCC8] bg-white px-3 py-2 text-[13.5px] text-brand-navy outline-none"
        >
          <option value="all">Everyone</option>
          <option value="children">Children only</option>
          <option value="adults">Adults only</option>
        </select>
        <ReportFilterBar filters={filters} onChange={setFilters} />
        <ExportButton onClick={handleExport} disabled={people.length === 0} />
      </div>

      {isLoading ? (
        <Loading />
      ) : occurrenceDates.length === 0 ? (
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} message="No occurrences in this range." />
      ) : people.length === 0 ? (
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} message="No attendance recorded in this range." />
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-[#EAE2D0]">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#EAE2D0] bg-[#FAF7F1] text-left text-[11.5px] uppercase tracking-[0.04em] text-[#8A94A0]">
                <th className="whitespace-nowrap px-3 py-2">Name</th>
                <th className="whitespace-nowrap px-3 py-2">Attended</th>
                <th className="whitespace-nowrap px-3 py-2">%</th>
                <th className="whitespace-nowrap px-3 py-2">Last attended</th>
                {occurrenceDates.map((d) => (
                  <th key={d} className="whitespace-nowrap px-2 py-2 text-center" title={formatDate(d)}>
                    {d.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const attended = new Set(p.attendedDates);
                const pct = Math.round((p.attendedDates.length / occurrenceDates.length) * 100);
                return (
                  <tr key={p.profileId} className="border-b border-[#EAE2D0] last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-brand-navy">{p.displayName}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[#5B7185]">
                      {p.attendedDates.length}/{occurrenceDates.length}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-[#5B7185]">{pct}%</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[#5B7185]">
                      {p.lastAttended ? formatDate(p.lastAttended) : "—"}
                    </td>
                    {occurrenceDates.map((d) => (
                      <td key={d} className="px-2 py-2 text-center text-[#3F6B45]">
                        {attended.has(d) ? "●" : ""}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Absentees tab ---

function AbsenteesTab({
  event,
  user,
  fromAddress,
}: {
  event: AppEvent;
  user: { name: string; email: string };
  fromAddress: string;
}) {
  const autoType = eventAutoSessionType(event.sessions);
  const [lastN, setLastN] = useState(4);
  const [childrenOnly, setChildrenOnly] = useState(autoType === "child");
  const [emailOpen, setEmailOpen] = useState(false);

  // Campus starts pre-set from the event title's guess (unchanged default
  // behavior), but is now a regular, editable filter pill like Status/Grade
  // rather than a hardcoded, un-removable value.
  const campusGuess = campusGroupFor(event.title);
  const [filters, setFilters] = useState<ReportFilters>({
    ...EMPTY_REPORT_FILTERS,
    campus: campusGuess === "Arlington" || campusGuess === "Leesburg" ? [campusGuess] : [],
  });

  const params = new URLSearchParams({
    seriesId: event.series_id,
    lastN: String(lastN),
    childrenOnly: String(childrenOnly),
  });
  filters.campus.forEach((c) => params.append("campus", c));
  filters.status.forEach((s) => params.append("status", s));
  if (filters.gradeFrom !== undefined) params.set("gradeFrom", String(filters.gradeFrom));
  if (filters.gradeTo !== undefined) params.set("gradeTo", String(filters.gradeTo));

  const { data, isLoading } = useSWR<{ occurrenceDates: string[]; absentees: Profile[] }>(
    `/api/attendance/absentees?${params.toString()}`,
    fetcher
  );
  const absentees = data?.absentees ?? [];
  const occurrenceDates = data?.occurrenceDates ?? [];

  function handleExport() {
    const rows = absentees.map((p) => ({
      name: `${p.first_name} ${p.last_name}`,
      role: p.household_role ?? "",
      grade: p.academic_grade ?? "",
    }));
    downloadCsv(
      `absentees-last-${lastN}.csv`,
      toCsv(rows, [
        { key: "name", label: "Name" },
        { key: "role", label: "Household Role" },
        { key: "grade", label: "Grade" },
      ])
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={lastN}
          onChange={(e) => setLastN(Number(e.target.value))}
          className="cursor-pointer rounded-[10px] border border-[#E5DCC8] bg-white px-3 py-2 text-[13.5px] text-brand-navy outline-none"
        >
          {[4, 8, 12, 26, 52].map((n) => (
            <option key={n} value={n}>
              Last {n} occurrences
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-semibold text-brand-navy">
          <input
            type="checkbox"
            checked={childrenOnly}
            onChange={(e) => setChildrenOnly(e.target.checked)}
            className="h-4 w-4 rounded border-[#E5DCC8] text-brand-navy focus:ring-brand-sky"
          />
          Children only
        </label>
        <ReportFilterBar filters={filters} onChange={setFilters} />
        <ExportButton onClick={handleExport} disabled={absentees.length === 0} />
        <button
          type="button"
          onClick={() => setEmailOpen(true)}
          disabled={absentees.length === 0}
          className="flex items-center gap-1.5 rounded-[10px] bg-brand-navy px-3.5 py-2 text-[13px] font-semibold text-brand-cream transition-colors hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Mail className="h-3.5 w-3.5" />
          Email absentees
        </button>
      </div>

      {!isLoading && occurrenceDates.length > 0 && (
        <p className="mb-4 text-[12.5px] text-[#8A94A0]">
          Checked against {occurrenceDates.length} occurrence{occurrenceDates.length === 1 ? "" : "s"}, most recent{" "}
          {formatDate(occurrenceDates[0])}.
        </p>
      )}

      {isLoading ? (
        <Loading />
      ) : absentees.length === 0 ? (
        <EmptyState
          icon={<UserX className="h-6 w-6" />}
          message={`Everyone attended at least one of the last ${lastN} occurrences.`}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {absentees.map((p) => (
            <Link
              key={p.id}
              href={`/people/${p.id}`}
              className="flex items-center gap-3 rounded-[12px] border border-[#EAE2D0] bg-white px-3.5 py-2.5 transition-colors hover:border-brand-navy/30"
            >
              <NameAvatar displayName={`${p.first_name} ${p.last_name}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold text-brand-navy">
                  {p.first_name} {p.last_name}
                </div>
                {p.academic_grade && <div className="text-[12px] text-[#8A94A0]">{p.academic_grade}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <EmailAbsenteesDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        user={user}
        fromAddress={fromAddress}
        seriesTitle={event.title}
        filters={{
          seriesId: event.series_id,
          lastN,
          childrenOnly,
          campus: filters.campus,
          status: filters.status,
          gradeFrom: filters.gradeFrom,
          gradeTo: filters.gradeTo,
        }}
        absenteeCount={absentees.length}
      />
    </div>
  );
}
