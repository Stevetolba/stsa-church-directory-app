import { Suspense } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Baby, Cake, CalendarCheck, Home, Search, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { listHouseholds, searchChildren, searchProfiles, type ProfileSearchResult } from "@/lib/subsplash";
import { listTodaysEvents } from "@/lib/events";
import { windowState } from "@/lib/eventTime";
import { groupProfilesByUpcomingBirthday, type BirthdayEntry } from "@/lib/birthdays";
import { EventCard } from "@/components/EventCard";
import { avatarTintForId, initialsOf } from "@/lib/avatar";
import { Skeleton } from "@/components/Skeleton";

function firstNameOf(name: string | null | undefined): string {
  if (!name) return "there";
  return name.trim().split(" ")[0];
}

// ADR-0011: volunteers get their own children-scoped landing page instead of
// the staff/admin one — middleware no longer blocks "/" for them (see
// middleware.ts), so this is the first thing they see after signing in.
export default async function DashboardPage() {
  const session = await auth();
  const name = session?.user?.name ?? null;

  if (session?.user?.role === "volunteer") {
    return <VolunteerDashboard name={name} />;
  }
  return <StaffDashboard name={name} canViewReports />;
}

// Not async: the shell below (header, search form, action cards) needs
// nothing but `name`/`canViewReports`, so it renders on the very first paint
// instead of blocking behind Subsplash's full profile walk (ADR-0009 warns
// that walk can take several seconds on a cold cache — this used to stall
// the *entire* page, including the static parts, behind it). The three data
// fetches below are kicked off here (not awaited) so they run in parallel
// while each dependent section streams in on its own via its own Suspense
// boundary once ready.
function StaffDashboard({ name, canViewReports }: { name: string | null; canViewReports: boolean }) {
  const now = new Date();
  // Birthdays reuses the same "walk up to 5000 profiles" cap the standalone
  // /birthdays page already accepts (its SHOW_ALL_PAGE_SIZE convention) — the
  // profile list doubles as today's birthday source, so this doesn't add a
  // second full-directory fetch beyond what the stat card needed anyway.
  // Shared as one promise between the two sections below that need it.
  const profilesPromise = searchProfiles({ pageSize: 5000 });
  const householdsPromise = listHouseholds({ pageSize: 1 });
  const eventsPromise = listTodaysEvents(now);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-semibold text-brand-navy">Welcome, {firstNameOf(name)}</h1>
        <Suspense fallback={<StatPillsSkeleton count={2} />}>
          <StaffStatPills profilesPromise={profilesPromise} householdsPromise={householdsPromise} />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <TodaysEventsSection eventsPromise={eventsPromise} canViewReports={canViewReports} now={now} />
      </Suspense>

      <Suspense fallback={null}>
        <TodaysBirthdaysAsync profilesPromise={profilesPromise} now={now} linkPrefix="/people" />
      </Suspense>

      <form
        action="/people"
        method="GET"
        className="mt-8 flex max-w-[440px] items-center gap-2.5 rounded-[10px] border border-[#E5DCC8] bg-white px-4 py-[11px] shadow-[0_1px_2px_rgba(26,58,92,0.04)]"
      >
        <Search className="h-4 w-4 shrink-0 text-[#97A9B8]" />
        <input
          type="text"
          name="search"
          placeholder="Search by name, email, or phone"
          className="w-full border-none bg-transparent text-[14.5px] text-brand-navy outline-none placeholder:text-[#97A9B8]"
        />
      </form>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ActionCard
          href="/people"
          icon={Users}
          title="Browse People"
          description="Search and view the church directory."
        />
        <ActionCard
          href="/households"
          icon={Home}
          title="Browse Households"
          description="View families and household groupings."
        />
      </div>
    </div>
  );
}

// Same not-async, stream-the-heavy-parts approach as StaffDashboard above.
function VolunteerDashboard({ name }: { name: string | null }) {
  const now = new Date();
  // searchChildren defaults to memberType "Child" — the same child-bearing-
  // household scoping the /children page and ADR-0011's volunteer visibility
  // rules already enforce, so this never surfaces an adult profile.
  const childrenPromise = searchChildren({ pageSize: 5000 });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-semibold text-brand-navy">Welcome, {firstNameOf(name)}</h1>
        <Suspense fallback={<StatPillsSkeleton count={1} />}>
          <VolunteerStatPill childrenPromise={childrenPromise} />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <TodaysBirthdaysAsync profilesPromise={childrenPromise} now={now} linkPrefix="/people" />
      </Suspense>

      <form
        action="/children"
        method="GET"
        className="mt-8 flex max-w-[440px] items-center gap-2.5 rounded-[10px] border border-[#E5DCC8] bg-white px-4 py-[11px] shadow-[0_1px_2px_rgba(26,58,92,0.04)]"
      >
        <Search className="h-4 w-4 shrink-0 text-[#97A9B8]" />
        <input
          type="text"
          name="search"
          placeholder="Search children and youth by name, email, or phone"
          className="w-full border-none bg-transparent text-[14.5px] text-brand-navy outline-none placeholder:text-[#97A9B8]"
        />
      </form>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ActionCard
          href="/children"
          icon={Baby}
          title="Browse Children and Youth"
          description="Search and view children and youth profiles."
        />
      </div>
    </div>
  );
}

async function StaffStatPills({
  profilesPromise,
  householdsPromise,
}: {
  profilesPromise: Promise<ProfileSearchResult>;
  householdsPromise: ReturnType<typeof listHouseholds>;
}) {
  const [{ total: memberCount }, { total: householdCount }] = await Promise.all([
    profilesPromise,
    householdsPromise,
  ]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatPill href="/people" icon={Users} label="People" value={memberCount} />
      <StatPill href="/households" icon={Home} label="Households" value={householdCount} />
    </div>
  );
}

async function VolunteerStatPill({ childrenPromise }: { childrenPromise: Promise<ProfileSearchResult> }) {
  const { total: childCount } = await childrenPromise;
  return <StatPill href="/children" icon={Baby} label="Children" value={childCount} />;
}

async function TodaysEventsSection({
  eventsPromise,
  canViewReports,
  now,
}: {
  eventsPromise: ReturnType<typeof listTodaysEvents>;
  canViewReports: boolean;
  now: Date;
}) {
  const todaysEvents = await eventsPromise;
  if (todaysEvents.length === 0) return null;
  return (
    <div className="mt-6">
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
        <CalendarCheck className="h-3.5 w-3.5" />
        Today&apos;s Events
      </div>
      <div className="flex flex-col gap-2.5">
        {todaysEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            highlighted={windowState(event, now) === "open"}
            canViewReports={canViewReports}
            now={now}
          />
        ))}
      </div>
    </div>
  );
}

// Shared by both dashboards — searchProfiles and searchChildren return the
// same ProfileSearchResult shape, so this doubles as the volunteer's
// children-only birthday source too (see VolunteerDashboard above).
async function TodaysBirthdaysAsync({
  profilesPromise,
  now,
  linkPrefix,
}: {
  profilesPromise: Promise<ProfileSearchResult>;
  now: Date;
  linkPrefix: string;
}) {
  const { profiles } = await profilesPromise;
  const todaysBirthdays =
    groupProfilesByUpcomingBirthday(profiles, now).find((g) => g.daysUntil === 0)?.entries ?? [];
  return <TodaysBirthdaysSection entries={todaysBirthdays} linkPrefix={linkPrefix} />;
}

function StatPillsSkeleton({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[30px] w-[104px] rounded-full" />
      ))}
    </div>
  );
}

function TodaysBirthdaysSection({
  entries,
  linkPrefix,
}: {
  entries: BirthdayEntry[];
  linkPrefix: string;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-6">
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
        <Cake className="h-3.5 w-3.5" />
        Today&apos;s Birthdays
      </div>
      <div className="flex flex-col gap-2">
        {entries.map(({ profile, turningAge }) => {
          const tint = avatarTintForId(profile.id);
          const householdCampus = [profile.household_name, profile.campus].filter(Boolean).join(" · ");
          return (
            <Link
              key={profile.id}
              href={`${linkPrefix}/${profile.id}`}
              className="flex items-center gap-3 rounded-[12px] border border-[#EAE2D0] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(26,58,92,0.05)] transition-colors hover:border-brand-navy/30"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-heading text-[13px] font-semibold"
                style={{ backgroundColor: tint.bg, color: tint.text }}
              >
                {initialsOf(profile.first_name, profile.last_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold text-brand-navy">
                  {profile.first_name} {profile.last_name}
                </div>
                {householdCampus && (
                  <div className="truncate text-[12.5px] text-[#8A94A0]">{householdCampus}</div>
                )}
              </div>
              <div className="shrink-0 whitespace-nowrap rounded-full bg-[#EEF2F6] px-[11px] py-1 text-[12px] font-semibold text-[#4C6178]">
                Turns {turningAge}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StatPill({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E5DCC8] bg-white px-3.5 py-[7px] text-[13px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/30 hover:text-brand-navy"
    >
      <Icon className="h-3.5 w-3.5 text-brand-sky" />
      <span className="font-heading text-brand-navy">{value}</span>
      {label}
    </Link>
  );
}

function ActionCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-[14px] border border-[#EAE2D0] bg-white p-5 shadow-[0_1px_3px_rgba(26,58,92,0.05)] transition hover:shadow-[0_2px_8px_rgba(26,58,92,0.1)]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-sky/[0.12] text-brand-sky">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-[15px] font-semibold text-brand-navy">{title}</div>
        <div className="text-[13px] text-muted-foreground">{description}</div>
      </div>
    </Link>
  );
}
