// Server-only Subsplash client. SUBSPLASH_USE_MOCK (default true) selects
// between the mock fixtures (lib/mockData.ts) and real Subsplash calls —
// see the tech spec's "mock data first, wire the real API last" build
// strategy and ADR-0004's amendment for why filtering happens here rather
// than via Subsplash query params.

import type { Campus, MemberStatus, Profile } from "@/types/profile";
import type { Household } from "@/types/household";
import { getServiceToken } from "./subsplashToken";
import { mockHouseholds, mockProfiles } from "./mockData";

const USE_MOCK_DATA = process.env.SUBSPLASH_USE_MOCK !== "false";
const BASE_URL = process.env.SUBSPLASH_BASE_URL ?? "https://core.subsplash.com";
const DEFAULT_PAGE_SIZE = 25;
const MAX_SUBSPLASH_PAGE_SIZE = 100;
// Safety cap on how many Subsplash pages we'll walk to build an in-memory
// working set for search/filter (ADR-0004 amendment). At 100/page this is
// 10,000 profiles — generous for a single church, revisit per that ADR's
// cache follow-up if it's ever hit.
const MAX_SUBSPLASH_PAGES = 100;

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
  household_role?: string;
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

interface RawHousehold {
  id: string;
  name: string;
  primary_email?: string;
  primary_phone?: string;
  status?: string;
  created_at: string;
  updated_at: string;
  _embedded?: { members?: RawProfile[] };
}

interface HalCollection<T> {
  count: number;
  total: number;
  _links?: { next?: { href: string } };
  _embedded: Record<string, T[]>;
}

// --- Fetch helper (real mode only) ---

async function subsplashFetch<T>(path: string): Promise<T> {
  const token = await getServiceToken();
  const res = await fetch(`${BASE_URL}${path}`, {
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

function mapHousehold(raw: RawHousehold): Household {
  return {
    id: raw.id,
    name: raw.name,
    primary_email: raw.primary_email,
    primary_phone: raw.primary_phone,
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
    const data = await subsplashFetch<HalCollection<RawProfile>>(
      `/people/v1/profiles?sort=last_name&page[number]=${page}&page[size]=${MAX_SUBSPLASH_PAGE_SIZE}`
    );
    profiles.push(...data._embedded.profiles.map(mapProfile));
    if (profiles.length >= data.total || data._embedded.profiles.length < MAX_SUBSPLASH_PAGE_SIZE) {
      break;
    }
  }
  return profiles;
}

async function fetchAllHouseholdsFromSubsplash(): Promise<Household[]> {
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
      [`${p.first_name} ${p.last_name}`, p.email, p.phone_number ?? ""].some((field) =>
        field.toLowerCase().includes(needle)
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
  { search, page = 1, pageSize = DEFAULT_PAGE_SIZE }: ListHouseholdsParams
): HouseholdSearchResult {
  const needle = search?.trim().toLowerCase();
  const filtered = needle ? all.filter((h) => h.name.toLowerCase().includes(needle)) : all;
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
  const all = USE_MOCK_DATA ? mockProfiles : await fetchAllProfilesFromSubsplash();
  return filterAndPaginateProfiles(all, params);
}

export async function getProfile(id: string): Promise<Profile | null> {
  if (USE_MOCK_DATA) {
    return mockProfiles.find((p) => p.id === id) ?? null;
  }
  try {
    const raw = await subsplashFetch<RawProfile>(`/people/v1/profiles/${id}`);
    return mapProfile(raw);
  } catch {
    return null;
  }
}

// Only the fields actually editable via PATCH /people/v1/profiles/{id} at
// the top level. Membership status (Member/Visitor/etc.) is a separate
// Subsplash resource, not a field on this endpoint — mapping the edit
// form's status control to the right call is a Step 11 concern.
export type UpdateProfileInput = Partial<
  Pick<Profile, "first_name" | "last_name" | "email" | "phone_number">
>;

export async function updateProfile(id: string, patch: UpdateProfileInput): Promise<Profile> {
  if (USE_MOCK_DATA) {
    const existing = mockProfiles.find((p) => p.id === id);
    if (!existing) throw new Error(`Profile not found: ${id}`);
    Object.assign(existing, patch, { updated_at: new Date().toISOString() });
    return existing;
  }

  const token = await getServiceToken();
  const res = await fetch(`${BASE_URL}/people/v1/profiles/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`Subsplash API error: ${res.status} PATCH /people/v1/profiles/${id}`);
  }
  return mapProfile((await res.json()) as RawProfile);
}

export async function listHouseholds(params: ListHouseholdsParams): Promise<HouseholdSearchResult> {
  const all = USE_MOCK_DATA ? mockHouseholds : await fetchAllHouseholdsFromSubsplash();
  return filterAndPaginateHouseholds(all, params);
}

export async function getHousehold(id: string): Promise<Household | null> {
  if (USE_MOCK_DATA) {
    const household = mockHouseholds.find((h) => h.id === id);
    if (!household) return null;
    return { ...household, members: mockProfiles.filter((p) => p.household_id === id) };
  }
  try {
    const raw = await subsplashFetch<RawHousehold>(`/people/v1/households/${id}`);
    return mapHousehold(raw);
  } catch {
    return null;
  }
}
