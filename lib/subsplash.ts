// Server-only Subsplash client. SUBSPLASH_USE_MOCK (default true) selects
// between the mock fixtures (lib/mockData.ts) and real Subsplash calls —
// see the tech spec's "mock data first, wire the real API last" build
// strategy and ADR-0004's amendment for why filtering happens here rather
// than via Subsplash query params. ADR-0009 covers the caching below — the
// real org has thousands of profiles, so walking every page on every
// request (as ADR-0004 originally did) is a 15-40s production-breaking
// cost; caching the walk is what makes that approach viable at real scale.

import { revalidateTag, unstable_cache } from "next/cache";
import type { Campus, MemberStatus, Profile } from "@/types/profile";
import type { Household } from "@/types/household";
import { getServiceToken } from "./subsplashToken";
import { mockHouseholds, mockProfiles } from "./mockData";
import { householdCampus } from "./household";
import { MAX_GRADE_VALUE, MIN_GRADE_VALUE } from "./grades";

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
  // Confirmed against the live org: multi-select fields (e.g. Campus) use
  // `choices` (array), not the singular `choice` this originally assumed
  // — every campus lookup silently returned undefined as a result.
  value: { text?: string; choice?: { id: string; name: string }; choices?: { id: string; name: string }[] };
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
  // Lifecycle status (active/archived/merged/gdpr/fraud) — distinct from the
  // membership status in `_embedded.latest-membership-status-change`. Only
  // consumed by hasDirectoryAccess() to avoid granting access via a
  // non-active profile.
  status?: string;
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

// ADR-0010: the custom field a church admin sets in Subsplash to grant a
// personal-email volunteer read-only access. Name is configurable so the
// church can call it whatever they like without a code change.
const ACCESS_FIELD_NAME = (process.env.SUBSPLASH_ACCESS_FIELD_NAME ?? "Directory Access")
  .trim()
  .toLowerCase();

// Affirmative values that count as "access granted", covering the likely
// Subsplash field types: Yes/No or single-select ("Yes"), or a checkbox
// (which tends to serialize as "true"/"1"). Anything else (incl. "No",
// empty, or an unset field) means no access.
const ACCESS_GRANTED_VALUES = new Set(["yes", "y", "true", "1", "granted", "checked", "on"]);

function extractCustomFieldValue(field: RawCustomFieldValue): string | undefined {
  if (field.value.choices?.length) {
    return field.value.choices.map((c) => c.name).join(", ");
  }
  return field.value.choice?.name ?? field.value.text;
}

function extractCampus(customFields: RawCustomFieldValue[] | undefined): Campus | undefined {
  const field = customFields?.find(
    (f) => f.custom_field_definition.name.trim().toLowerCase() === CAMPUS_FIELD_NAME
  );
  // A profile can have multiple campus choices selected at once (confirmed
  // against the live org) — our model only supports one, so pick the first
  // recognized value rather than requiring an exact single-choice match.
  const choiceNames = field?.value.choices?.map((c) => c.name) ?? (field?.value.choice ? [field.value.choice.name] : []);
  return choiceNames.find((v): v is Campus => v === "Arlington" || v === "Leesburg");
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
    academic_grade_value: raw.academic_grade?.value,
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

// ADR-0009 (amended): cache each page individually via unstable_cache
// rather than a plain in-memory variable. A plain module-level cache
// doesn't survive across Vercel serverless invocations — confirmed in
// production ("still there is API latency" after the first cache
// implementation shipped) — whereas unstable_cache's Data Cache does.
// Caching the *whole* mapped profiles list in one entry was tried first
// and rejected: it's ~3MB at this org's size, over unstable_cache's 2MB
// per-entry limit. Caching per-page (each ~70KB) stays well under that.
const getCachedProfilePage = unstable_cache(
  async (page: number) => {
    const data = await subsplashFetch<HalCollection<RawProfile>>(
      `/people/v1/profiles?sort=last_name&page[number]=${page}&page[size]=${MAX_SUBSPLASH_PAGE_SIZE}&include=latest-membership-status-change`
    );
    return data._embedded.profiles.map(mapProfile);
  },
  ["subsplash-profiles-page"],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: ["subsplash-profiles"] }
);

async function getCachedProfiles(): Promise<Profile[]> {
  const profiles: Profile[] = [];
  for (let page = 1; page <= MAX_SUBSPLASH_PAGES; page++) {
    const pageProfiles = await getCachedProfilePage(page);
    profiles.push(...pageProfiles);
    if (pageProfiles.length < MAX_SUBSPLASH_PAGE_SIZE) break;
  }
  return profiles;
}

// Households (without embedded members — see listHouseholds) map to a much
// smaller payload than profiles, comfortably under the 2MB limit as one
// entry, so this doesn't need per-page chunking.
const getCachedHouseholds = unstable_cache(
  async () => {
    const households: Household[] = [];
    for (let page = 1; page <= MAX_SUBSPLASH_PAGES; page++) {
      // include=address: same stub-by-default issue as members — without
      // it, household.address is always undefined even when a real
      // address exists (confirmed against the live org).
      const data = await subsplashFetch<HalCollection<RawHousehold>>(
        `/people/v1/households?sort=name&page[number]=${page}&page[size]=${MAX_SUBSPLASH_PAGE_SIZE}&include=address`
      );
      households.push(...data._embedded.households.map(mapHousehold));
      if (households.length >= data.total || data._embedded.households.length < MAX_SUBSPLASH_PAGE_SIZE) {
        break;
      }
    }
    return households;
  },
  ["subsplash-all-households"],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: ["subsplash-households"] }
);

// --- In-memory search/filter/paginate (shared by mock and real modes) ---

export interface SearchProfilesParams {
  search?: string;
  status?: MemberStatus;
  campus?: Campus;
  gradeFrom?: number;
  gradeTo?: number;
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
  {
    search,
    status,
    campus,
    gradeFrom,
    gradeTo,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  }: SearchProfilesParams
): ProfileSearchResult {
  const needle = search?.trim().toLowerCase();
  const gradeFilterActive = gradeFrom !== undefined || gradeTo !== undefined;
  const lowerGrade = gradeFrom ?? MIN_GRADE_VALUE;
  const upperGrade = gradeTo ?? MAX_GRADE_VALUE;

  const filtered = all.filter((p) => {
    const matchesStatus = !status || p.status === status;
    const matchesCampus = !campus || p.campus === campus;
    const matchesGrade =
      !gradeFilterActive ||
      (p.academic_grade_value !== undefined &&
        p.academic_grade_value >= lowerGrade &&
        p.academic_grade_value <= upperGrade);
    const matchesSearch =
      !needle ||
      [`${p.first_name ?? ""} ${p.last_name ?? ""}`, p.email ?? "", p.phone_number ?? ""].some(
        (field) => field.toLowerCase().includes(needle)
      );
    return matchesStatus && matchesCampus && matchesGrade && matchesSearch;
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

function isAccessValueGranted(value: string | undefined): boolean {
  return !!value && ACCESS_GRANTED_VALUES.has(value.trim().toLowerCase());
}

// ADR-0010: does this email belong to someone granted read-only directory
// access via Subsplash? Used by the sign-in gate (lib/auth.ts) to admit
// personal-email volunteers. Returns false (deny) on any lookup error —
// fail closed, since this decides who can see member PII.
export async function hasDirectoryAccess(email: string): Promise<boolean> {
  const needle = email.trim().toLowerCase();
  if (!needle) return false;

  if (USE_MOCK_DATA) {
    return mockProfiles.some(
      (p) =>
        p.email?.toLowerCase() === needle &&
        p.custom_fields?.some(
          (f) => f.label.trim().toLowerCase() === ACCESS_FIELD_NAME && isAccessValueGranted(f.value)
        )
    );
  }

  try {
    // filter[email] is exact-match (openapi.yaml: "Wildcards not supported"),
    // which is exactly what we want here; filter[org_key] is added by
    // subsplashFetch. custom_fields come back on this list response.
    const data = await subsplashFetch<HalCollection<RawProfile>>(
      `/people/v1/profiles?filter[email]=${encodeURIComponent(needle)}`
    );
    return data._embedded.profiles.some((raw) => {
      const active = !raw.status || raw.status.toLowerCase() === "active";
      const granted = raw.custom_fields?.some(
        (f) =>
          f.custom_field_definition.name.trim().toLowerCase() === ACCESS_FIELD_NAME &&
          isAccessValueGranted(extractCustomFieldValue(f))
      );
      return active && !!granted;
    });
  } catch {
    return false;
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

// Subsplash's PATCH body wants phone_number as PhoneNumberWithCountryCode
// ({ significant, country: { calling_code, region_code } }), not the
// formatted display string ("(215) 940-5960") our UI shows and edits —
// confirmed against the live API (a PATCH with the formatted string
// always 400s, regardless of what else is in the body). Only handles
// 10-digit US numbers, matching formatPhone()'s only well-formed output;
// this app's users are all in one US-based church.
function phoneNumberForSubsplash(
  formatted: string
): { significant: string; country: { calling_code: string; region_code: string } } | null {
  const digits = formatted.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length !== 10) {
    throw new Error("Phone number must be a 10-digit US number.");
  }
  return { significant: digits, country: { calling_code: "+1", region_code: "US" } };
}

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

  const body: Record<string, unknown> = { ...topLevelPatch };
  if (topLevelPatch.phone_number !== undefined) {
    body.phone_number = phoneNumberForSubsplash(topLevelPatch.phone_number);
  }

  const token = await getServiceToken();
  const res = await fetch(`${BASE_URL}/people/v1/profiles/${id}?filter[org_key]=${ORG_KEY}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Subsplash API error: ${res.status} PATCH /people/v1/profiles/${id}`);
  }
  // Otherwise the People list would show stale data for up to
  // CACHE_REVALIDATE_SECONDS after a save (ADR-0009).
  revalidateTag("subsplash-profiles");
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
    const raw = await subsplashFetch<RawHousehold>(`/people/v1/households/${id}?include=members,address`);
    const household = mapHousehold(raw);
    if (household.members?.length) {
      // include=members never embeds a member's latest-membership-status-
      // change (confirmed against the live API, including nested include
      // attempts), so every member showed as "Visitor" via mapProfile's
      // fallback. The (separately cached) profiles walk already has the
      // correct status for each — swap in that copy where available.
      const cachedProfiles = await getCachedProfiles();
      const byId = new Map(cachedProfiles.map((p) => [p.id, p]));
      household.members = household.members.map((m) => byId.get(m.id) ?? m);
    }
    return household;
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
  revalidateTag("subsplash-households");
  return mapHousehold((await res.json()) as RawHousehold);
}
