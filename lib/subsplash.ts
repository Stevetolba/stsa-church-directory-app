// Server-only Subsplash client. SUBSPLASH_USE_MOCK (default true) selects
// between the mock fixtures (lib/mockData.ts) and real Subsplash calls —
// see the tech spec's "mock data first, wire the real API last" build
// strategy and ADR-0004's amendment for why filtering happens here rather
// than via Subsplash query params. ADR-0009 covers the in-memory caching
// below — the real org has thousands of profiles, so walking every page
// on every request (as ADR-0004 originally did) is a 15-40s
// production-breaking cost; caching the full walk's result is what makes
// that approach viable at real scale. (unstable_cache was tried first but
// hits Next's 2MB per-entry Data Cache limit at this data size — see
// ADR-0009's revision note.)

import type { Campus, MemberStatus, Profile } from "@/types/profile";
import type { Household } from "@/types/household";
import { getServiceToken } from "./subsplashToken";
import { mockHouseholds, mockProfiles } from "./mockData";
import { householdCampus } from "./household";

const USE_MOCK_DATA = process.env.SUBSPLASH_USE_MOCK !== "false";
const BASE_URL = process.env.SUBSPLASH_BASE_URL ?? "https://core.subsplash.com";
const ORG_KEY = process.env.SUBSPLASH_ORG_KEY;
const DEFAULT_PAGE_SIZE = 25;
const MAX_SUBSPLASH_PAGE_SIZE = 100;
// Safety cap on how many Subsplash pages we'll walk to build an in-memory
// working set for search/filter (ADR-0004 amendment). At 100/page this is
// 20,000 profiles — the real org already has 4,000+, so this has real
// headroom rather than comfortable-in-theory headroom.
const MAX_SUBSPLASH_PAGES = 200;
// ADR-0009: how long the full profiles/households walk is cached before
// Subsplash is re-queried. A staff directory doesn't need real-time
// freshness; this trades a few minutes of staleness for not re-fetching
// thousands of records on every page view.
const CACHE_REVALIDATE_SECONDS = 300;

// --- Raw Subsplash response shapes (only the fields we consume) ---

interface RawCustomFieldValue {
  custom_field_definition: { id: string; name: string };
  value: { text?: string; choice?: { id: string; name: string } };
}

interface RawMembershipStatusChange {
  status: "visitor" | "newcomer" | "regular_attender" | "member" | "former_attender" | null;
}

interface RawHouseholdEmbed {
  id: string;
  name: string;
}

interface RawProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  emails?: { email: string }[];
  phone_number?: { significant: string; country: { calling_code: string; region_code: string } };
  phones?: { phone: string }[];
  date_of_birth?: string | null;
  gender?: string;
  marital_status?: string;
  household_role?: "guardian" | "parent" | "child" | "other" | "unknown";
  academic_grade?: { name: string; value: number } | null;
  graduation_year?: number | null;
  baptism_date?: string | null;
  custom_fields?: RawCustomFieldValue[];
  created_at: string;
  updated_at: string;
  _embedded?: {
    household?: RawHouseholdEmbed;
    "latest-membership-status-change"?: RawMembershipStatusChange;
    photo?: { _links?: { self?: { href: string } } };
  };
}

interface RawAddress {
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
}

interface RawHousehold {
  id: string;
  name: string;
  primary_email?: string;
  primary_phone?: string;
  status?: string;
  created_at: string;
  updated_at: string;
  _embedded?: { members?: RawProfile[]; address?: RawAddress };
}

interface HalCollection<T> {
  count: number;
  total: number;
  _links?: { next?: { href: string } };
  _embedded: Record<string, T[]>;
}

// --- Fetch helper (real mode only) ---

async function subsplashFetch<T>(path: string): Promise<T> {
  if (!ORG_KEY) {
    throw new Error("Missing SUBSPLASH_ORG_KEY — required as filter[org_key] on every request.");
  }
  const token = await getServiceToken();
  const separator = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE_URL}${path}${separator}filter[org_key]=${ORG_KEY}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Subsplash API error: ${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}

// --- Mapping: Subsplash's raw shapes -> our app types ---

const MEMBERSHIP_STATUS_MAP: Record<string, MemberStatus> = {
  visitor: "Visitor",
  newcomer: "Newcomer",
  regular_attender: "Regular Attendee",
  member: "Member",
  former_attender: "Former Attender",
};

const CAMPUS_FIELD_NAME = "campus";

function extractCustomFieldValue(field: RawCustomFieldValue): string | undefined {
  return field.value.choice?.name ?? field.value.text;
}

function extractCampus(customFields: RawCustomFieldValue[] | undefined): Campus | undefined {
  const field = customFields?.find(
    (f) => f.custom_field_definition.name.toLowerCase() === CAMPUS_FIELD_NAME
  );
  const value = field ? extractCustomFieldValue(field) : undefined;
  return value === "Arlington" || value === "Leesburg" ? value : undefined;
}

function formatPhone(phone: RawProfile["phone_number"]): string | undefined {
  if (!phone) return undefined;
  const digits = phone.significant;
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `${phone.country.calling_code} ${digits}`;
}

function mapProfile(raw: RawProfile): Profile {
  const statusRaw = raw._embedded?.["latest-membership-status-change"]?.status;
  const household = raw._embedded?.household;

  return {
    id: raw.id,
    first_name: raw.first_name,
    last_name: raw.last_name,
    email: raw.email,
    emails: raw.emails?.map((e) => e.email),
    phone_number: formatPhone(raw.phone_number),
    phones: raw.phones?.map((p) => p.phone),
    date_of_birth: raw.date_of_birth ?? undefined,
    gender: raw.gender,
    marital_status: raw.marital_status,
    household_id: household?.id,
    household_name: household?.name,
    household_role: raw.household_role,
    academic_grade: raw.academic_grade?.name,
    graduation_year: raw.graduation_year ?? undefined,
    status: statusRaw ? MEMBERSHIP_STATUS_MAP[statusRaw] : "Visitor",
    campus: extractCampus(raw.custom_fields),
    baptism_date: raw.baptism_date ?? undefined,
    photo_url: raw._embedded?.photo?._links?.self?.href,
    custom_fields: raw.custom_fields?.map((f) => ({
      id: f.custom_field_definition.id,
      label: f.custom_field_definition.name,
      value: extractCustomFieldValue(f) ?? "",
    })),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

function formatAddress(address: RawAddress | undefined): string | undefined {
  if (!address) return undefined;
  const cityStateZip = [address.city, [address.state, address.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [address.street, cityStateZip].filter(Boolean).join(", ") || undefined;
}

function mapHousehold(raw: RawHousehold): Household {
  return {
    id: raw.id,
    name: raw.name,
    primary_email: raw.primary_email,
    primary_phone: raw.primary_phone,
    address: formatAddress(raw._embedded?.address),
    status: raw.status,
    members: raw._embedded?.members?.map(mapProfile),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

// --- Real-mode: walk Subsplash's pages to build a working set ---
// Subsplash can't filter by search text, membership status, or custom
// fields (ADR-0004 amendment), so we fetch what it can page/sort for us
// and filter here.

async function fetchAllProfilesFromSubsplash(): Promise<Profile[]> {
  const profiles: Profile[] = [];
  for (let page = 1; page <= MAX_SUBSPLASH_PAGES; page++) {
    // include=latest-membership-status-change: without it this embed is
    // always absent (confirmed against the live API), so every profile
    // would silently fall back to the "Visitor" default in mapProfile.
    const data = await subsplashFetch<HalCollection<RawProfile>>(
      `/people/v1/profiles?sort=last_name&page[number]=${page}&page[size]=${MAX_SUBSPLASH_PAGE_SIZE}&include=latest-membership-status-change`
    );
    profiles.push(...data._embedded.profiles.map(mapProfile));
    if (profiles.length >= data.total || data._embedded.profiles.length < MAX_SUBSPLASH_PAGE_SIZE) {
      break;
    }
  }
  return profiles;
}

async function fetchAllHouseholdsFromSubsplash(): Promise<Household[]> {
  // Deliberately no include=members here: embedding every member's full
  // profile inside every household blew past unstable_cache's 2MB
  // per-entry limit (confirmed — this list's cached payload hit ~2.9MB
  // against the real org). Members are joined from the (separately
  // cached) profiles walk in listHouseholds() instead — same data, no
  // duplication. getHousehold()'s single-item fetch still uses
  // include=members since fetching one household's members is cheap.
  const households: Household[] = [];
  for (let page = 1; page <= MAX_SUBSPLASH_PAGES; page++) {
    const data = await subsplashFetch<HalCollection<RawHousehold>>(
      `/people/v1/households?sort=name&page[number]=${page}&page[size]=${MAX_SUBSPLASH_PAGE_SIZE}`
    );
    households.push(...data._embedded.households.map(mapHousehold));
    if (households.length >= data.total || data._embedded.households.length < MAX_SUBSPLASH_PAGE_SIZE) {
      break;
    }
  }
  return households;
}

// ADR-0009: cache the full walk rather than re-fetching thousands of
// records on every request. Plain in-memory TTL cache (same pattern as
// subsplashToken.ts's token cache) rather than Next's unstable_cache — the
// real profiles list is ~3MB mapped, over unstable_cache's 2MB per-entry
// Data Cache limit, which fails silently-ish (throws async, doesn't block
// the response, but never actually caches) at this org's real size.
interface CachedCollection<T> {
  data: T[];
  expiresAt: number;
}

let cachedProfiles: CachedCollection<Profile> | null = null;
let cachedHouseholds: CachedCollection<Household> | null = null;
// In-flight promises so concurrent requests during a cold cache (e.g. right
// after a restart, or once the 5-minute TTL lapses under real traffic)
// share one walk instead of each independently re-fetching thousands of
// records — confirmed happening in practice (one request took 25s despite
// another having just warmed the cache moments earlier).
let profilesInFlight: Promise<Profile[]> | null = null;
let householdsInFlight: Promise<Household[]> | null = null;

async function getCachedProfiles(): Promise<Profile[]> {
  const now = Date.now();
  if (cachedProfiles && cachedProfiles.expiresAt > now) {
    return cachedProfiles.data;
  }
  if (!profilesInFlight) {
    profilesInFlight = fetchAllProfilesFromSubsplash().finally(() => {
      profilesInFlight = null;
    });
  }
  const data = await profilesInFlight;
  cachedProfiles = { data, expiresAt: now + CACHE_REVALIDATE_SECONDS * 1000 };
  return data;
}

async function getCachedHouseholds(): Promise<Household[]> {
  const now = Date.now();
  if (cachedHouseholds && cachedHouseholds.expiresAt > now) {
    return cachedHouseholds.data;
  }
  if (!householdsInFlight) {
    householdsInFlight = fetchAllHouseholdsFromSubsplash().finally(() => {
      householdsInFlight = null;
    });
  }
  const data = await householdsInFlight;
  cachedHouseholds = { data, expiresAt: now + CACHE_REVALIDATE_SECONDS * 1000 };
  return data;
}

// --- In-memory search/filter/paginate (shared by mock and real modes) ---

export interface SearchProfilesParams {
  search?: string;
  status?: MemberStatus;
  campus?: Campus;
  page?: number;
  pageSize?: number;
}

export interface ProfileSearchResult {
  profiles: Profile[];
  total: number;
  overallTotal: number;
  page: number;
  pageSize: number;
}

function filterAndPaginateProfiles(
  all: Profile[],
  { search, status, campus, page = 1, pageSize = DEFAULT_PAGE_SIZE }: SearchProfilesParams
): ProfileSearchResult {
  const needle = search?.trim().toLowerCase();

  const filtered = all.filter((p) => {
    const matchesStatus = !status || p.status === status;
    const matchesCampus = !campus || p.campus === campus;
    const matchesSearch =
      !needle ||
      [`${p.first_name ?? ""} ${p.last_name ?? ""}`, p.email ?? "", p.phone_number ?? ""].some(
        (field) => field.toLowerCase().includes(needle)
      );
    return matchesStatus && matchesCampus && matchesSearch;
  });

  const start = (page - 1) * pageSize;
  return {
    profiles: filtered.slice(start, start + pageSize),
    total: filtered.length,
    overallTotal: all.length,
    page,
    pageSize,
  };
}

export interface ListHouseholdsParams {
  search?: string;
  campus?: Campus;
  page?: number;
  pageSize?: number;
}

export interface HouseholdSearchResult {
  households: Household[];
  total: number;
  overallTotal: number;
  page: number;
  pageSize: number;
}

function filterAndPaginateHouseholds(
  all: Household[],
  { search, campus, page = 1, pageSize = DEFAULT_PAGE_SIZE }: ListHouseholdsParams
): HouseholdSearchResult {
  const needle = search?.trim().toLowerCase();

  const filtered = all.filter((h) => {
    const matchesCampus = !campus || householdCampus(h) === campus;
    const matchesSearch =
      !needle ||
      [h.name ?? "", h.address ?? ""].some((field) => field.toLowerCase().includes(needle));
    return matchesCampus && matchesSearch;
  });

  const start = (page - 1) * pageSize;
  return {
    households: filtered.slice(start, start + pageSize),
    total: filtered.length,
    overallTotal: all.length,
    page,
    pageSize,
  };
}

// --- Public API ---

export async function searchProfiles(params: SearchProfilesParams): Promise<ProfileSearchResult> {
  const all = USE_MOCK_DATA ? mockProfiles : await getCachedProfiles();
  return filterAndPaginateProfiles(all, params);
}

export async function getProfile(id: string): Promise<Profile | null> {
  if (USE_MOCK_DATA) {
    return mockProfiles.find((p) => p.id === id) ?? null;
  }
  try {
    const raw = await subsplashFetch<RawProfile>(
      `/people/v1/profiles/${id}?include=latest-membership-status-change`
    );
    return mapProfile(raw);
  } catch {
    return null;
  }
}

// Only the fields actually editable via PATCH /people/v1/profiles/{id} at
// the top level, plus campus (handled separately below — it lives in
// custom_fields, not as a top-level field). Membership status
// (Member/Visitor/etc.) is a separate Subsplash resource entirely — see
// ADR-0007.
export type UpdateProfileInput = Partial<
  Pick<Profile, "first_name" | "last_name" | "email" | "phone_number" | "campus">
>;

export async function updateProfile(id: string, patch: UpdateProfileInput): Promise<Profile> {
  const { campus, ...topLevelPatch } = patch;

  if (USE_MOCK_DATA) {
    const existing = mockProfiles.find((p) => p.id === id);
    if (!existing) throw new Error(`Profile not found: ${id}`);
    Object.assign(existing, topLevelPatch, { updated_at: new Date().toISOString() });
    if (campus !== undefined) {
      existing.campus = campus;
      const campusField = existing.custom_fields?.find((f) => f.label.toLowerCase() === "campus");
      if (campusField) {
        campusField.value = campus;
      } else {
        existing.custom_fields = [
          ...(existing.custom_fields ?? []),
          { id: "cf-campus", label: "Campus", value: campus },
        ];
      }
    }
    return existing;
  }

  if (campus !== undefined) {
    // Updating a custom field for real requires the Campus field's
    // custom_field_definition id/revision_id and, since it's a dropdown,
    // the target choice's id — none of which are hardcodable (they're
    // org-specific and would need a GET /people/v1/custom-field-definitions
    // lookup this app doesn't make yet). Stopping here rather than
    // guessing and risking a bad write against real data.
    throw new Error(
      "Updating campus against the real Subsplash API isn't implemented yet — requires looking up the Campus custom field's definition and choice IDs first."
    );
  }

  if (!ORG_KEY) {
    throw new Error("Missing SUBSPLASH_ORG_KEY — required as filter[org_key] on every request.");
  }
  const token = await getServiceToken();
  const res = await fetch(`${BASE_URL}/people/v1/profiles/${id}?filter[org_key]=${ORG_KEY}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(topLevelPatch),
  });
  if (!res.ok) {
    throw new Error(`Subsplash API error: ${res.status} PATCH /people/v1/profiles/${id}`);
  }
  // Otherwise the People list would show stale data for up to
  // CACHE_REVALIDATE_SECONDS after a save (ADR-0009).
  cachedProfiles = null;
  return mapProfile((await res.json()) as RawProfile);
}

export async function listHouseholds(params: ListHouseholdsParams): Promise<HouseholdSearchResult> {
  // Household cards need member previews/counts and a derived campus
  // (lib/household.ts), so members are joined in here even though this is
  // the "list" fetch. Real mode joins from the (separately cached)
  // profiles walk rather than requesting include=members on the household
  // walk itself — see fetchAllHouseholdsFromSubsplash for why.
  const all = USE_MOCK_DATA
    ? mockHouseholds.map((h) => ({
        ...h,
        members: mockProfiles.filter((p) => p.household_id === h.id),
      }))
    : await (async () => {
        const [households, profiles] = await Promise.all([getCachedHouseholds(), getCachedProfiles()]);
        return households.map((h) => ({
          ...h,
          members: profiles.filter((p) => p.household_id === h.id),
        }));
      })();
  return filterAndPaginateHouseholds(all, params);
}

export async function getHousehold(id: string): Promise<Household | null> {
  if (USE_MOCK_DATA) {
    const household = mockHouseholds.find((h) => h.id === id);
    if (!household) return null;
    return { ...household, members: mockProfiles.filter((p) => p.household_id === id) };
  }
  try {
    const raw = await subsplashFetch<RawHousehold>(`/people/v1/households/${id}?include=members`);
    return mapHousehold(raw);
  } catch {
    return null;
  }
}

export type UpdateHouseholdInput = Partial<Pick<Household, "address">>;

export async function updateHousehold(id: string, patch: UpdateHouseholdInput): Promise<Household> {
  if (USE_MOCK_DATA) {
    const existing = mockHouseholds.find((h) => h.id === id);
    if (!existing) throw new Error(`Household not found: ${id}`);
    Object.assign(existing, patch, { updated_at: new Date().toISOString() });
    return existing;
  }

  if (!ORG_KEY) {
    throw new Error("Missing SUBSPLASH_ORG_KEY — required as filter[org_key] on every request.");
  }
  const token = await getServiceToken();
  const res = await fetch(`${BASE_URL}/people/v1/households/${id}?filter[org_key]=${ORG_KEY}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    // Subsplash wants a structured _embedded.address (street/city/state/
    // postal_code) — confirmed in openapi.yaml's household PATCH request
    // body. Our display model stores one formatted string, so putting the
    // whole thing in `street` is a best-effort stopgap; proper structured
    // address input fields are needed before this is production-ready.
    body: JSON.stringify(
      patch.address !== undefined ? { _embedded: { address: { street: patch.address } } } : {}
    ),
  });
  if (!res.ok) {
    throw new Error(`Subsplash API error: ${res.status} PATCH /people/v1/households/${id}`);
  }
  cachedHouseholds = null;
  return mapHousehold((await res.json()) as RawHousehold);
}
