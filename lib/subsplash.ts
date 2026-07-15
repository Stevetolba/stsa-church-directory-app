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
import type { Household, HouseholdAddress } from "@/types/household";
import { getServiceToken } from "./subsplashToken";
import { mockHouseholds, mockProfiles } from "./mockData";
import { formatAddressParts, householdCampus, householdMemberType, parseAddressString } from "./household";
import { MAX_GRADE_VALUE, MIN_GRADE_VALUE } from "./grades";
import { calculateAge } from "./age";

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
  // revision_id + type are present on reads and required when writing the
  // field back (openapi.yaml → CustomFieldValueInput) — used by the Campus
  // write path below, since there's no custom-field-definitions endpoint to
  // look them up directly.
  custom_field_definition: { id: string; name: string; revision_id?: string; type?: string };
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
  // Plain top-level string fields (openapi.yaml → Profile, maxLength 1500).
  // care_notes is child-only + flagged "private" — see ADR-0012.
  allergy_notes?: string | null;
  care_notes?: string | null;
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
    // A profile's own linked address, independent of the household's
    // (openapi.yaml → ProfileRequest._embedded.address). Most profiles don't
    // have one set — display code falls back to the household's address.
    address?: RawAddress;
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

function findCampusField(
  customFields: RawCustomFieldValue[] | undefined
): RawCustomFieldValue | undefined {
  return customFields?.find(
    (f) => f.custom_field_definition.name.trim().toLowerCase() === CAMPUS_FIELD_NAME
  );
}

function extractCampus(customFields: RawCustomFieldValue[] | undefined): Campus | undefined {
  const field = findCampusField(customFields);
  // A profile can have multiple campus choices selected at once (confirmed
  // against the live org) — our model only supports one, so pick the first
  // recognized value rather than requiring an exact single-choice match.
  const choiceNames =
    field?.value.choices?.map((c) => c.name) ?? (field?.value.choice ? [field.value.choice.name] : []);
  return choiceNames.find((v): v is Campus => v === "Arlington" || v === "Leesburg");
}

// The Campus custom field's write metadata (definition id, revision id, and
// dropdown choice ids), learned from real profile data since Subsplash has
// no custom-field-definitions endpoint to look it up directly.
interface CampusFieldMeta {
  definitionId: string;
  revisionId?: string;
  type?: string;
  choiceIds: Partial<Record<Campus, string>>;
}

function mergeCampusFieldMeta(
  existing: CampusFieldMeta | null,
  field: RawCustomFieldValue
): CampusFieldMeta {
  const def = field.custom_field_definition;
  const meta: CampusFieldMeta = existing ?? { definitionId: def.id, choiceIds: {} };
  meta.definitionId = def.id;
  if (def.revision_id) meta.revisionId = def.revision_id;
  if (def.type) meta.type = def.type;
  const choices = field.value.choices?.length
    ? field.value.choices
    : field.value.choice
      ? [field.value.choice]
      : [];
  for (const choice of choices) {
    if (choice.name === "Arlington" || choice.name === "Leesburg") {
      meta.choiceIds[choice.name] = choice.id;
    }
  }
  return meta;
}

// A dropdown campus field needs the target choice's id; a text field just
// takes the name. We treat the field as a dropdown when the definition says
// so or when we've observed any choice value for it.
function campusUsesChoices(meta: CampusFieldMeta): boolean {
  return meta.type === "dropdown" || Object.keys(meta.choiceIds).length > 0;
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
  const address_parts = mapAddressParts(raw._embedded?.address);

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
    address: formatAddressParts(address_parts),
    address_parts,
    baptism_date: raw.baptism_date ?? undefined,
    allergy_notes: raw.allergy_notes ?? undefined,
    care_notes: raw.care_notes ?? undefined,
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

function mapAddressParts(address: RawAddress | undefined): HouseholdAddress | undefined {
  if (!address) return undefined;
  const parts: HouseholdAddress = {
    street: address.street,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code,
  };
  return Object.values(parts).some(Boolean) ? parts : undefined;
}

function mapHousehold(raw: RawHousehold): Household {
  const address_parts = mapAddressParts(raw._embedded?.address);
  return {
    id: raw.id,
    name: raw.name,
    primary_email: raw.primary_email,
    primary_phone: raw.primary_phone,
    address: formatAddressParts(address_parts),
    address_parts,
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
      `/people/v1/profiles?sort=last_name&page[number]=${page}&page[size]=${MAX_SUBSPLASH_PAGE_SIZE}&include=latest-membership-status-change,address`
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

// ADR-0010-adjacent: like ACCESS_FIELD_NAME, there's no custom-field-
// definitions endpoint to look up the Campus field's write metadata
// (definition id, revision id, dropdown choice ids), so we learn it by
// sampling real profile data — one page (not the full profiles walk),
// cached via unstable_cache so it survives across serverless invocations
// the same way the profiles/households caches do (see ADR-0009's revision
// note on why a plain module variable doesn't).
const getCampusFieldMetaCached = unstable_cache(
  async (): Promise<CampusFieldMeta | null> => {
    const data = await subsplashFetch<HalCollection<RawProfile>>(
      `/people/v1/profiles?page[number]=1&page[size]=${MAX_SUBSPLASH_PAGE_SIZE}`
    );
    let meta: CampusFieldMeta | null = null;
    for (const raw of data._embedded.profiles) {
      const field = findCampusField(raw.custom_fields);
      if (field) meta = mergeCampusFieldMeta(meta, field);
    }
    return meta;
  },
  ["subsplash-campus-field-meta"],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: ["subsplash-campus-meta"] }
);

// --- In-memory search/filter/paginate (shared by mock and real modes) ---

export interface SearchProfilesParams {
  search?: string;
  status?: MemberStatus[];
  campus?: Campus[];
  gradeFrom?: number;
  gradeTo?: number;
  // Currently only surfaced on the Children page — computed from
  // date_of_birth (see lib/age.ts), independent of gradeFrom/gradeTo so
  // either can be used alone or combined.
  ageFrom?: number;
  ageTo?: number;
  sortBy?: "first_name" | "last_name";
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
    ageFrom,
    ageTo,
    sortBy,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  }: SearchProfilesParams
): ProfileSearchResult {
  const needle = search?.trim().toLowerCase();
  // Phone numbers are also matched digit-only, so a search like "2159405960"
  // finds a profile displayed/stored as "(215) 940-5960" — formatting
  // shouldn't matter when searching by phone.
  const needleDigits = needle?.replace(/\D/g, "") ?? "";
  const gradeFilterActive = gradeFrom !== undefined || gradeTo !== undefined;
  const lowerGrade = gradeFrom ?? MIN_GRADE_VALUE;
  const upperGrade = gradeTo ?? MAX_GRADE_VALUE;
  const ageFilterActive = ageFrom !== undefined || ageTo !== undefined;

  const filtered = all.filter((p) => {
    const matchesStatus = !status?.length || status.includes(p.status);
    const matchesCampus = !campus?.length || (!!p.campus && campus.includes(p.campus));
    const matchesGrade =
      !gradeFilterActive ||
      (p.academic_grade_value !== undefined &&
        p.academic_grade_value >= lowerGrade &&
        p.academic_grade_value <= upperGrade);
    const matchesAge =
      !ageFilterActive ||
      (() => {
        const age = p.date_of_birth ? calculateAge(p.date_of_birth) : null;
        if (age === null) return false;
        return (ageFrom === undefined || age >= ageFrom) && (ageTo === undefined || age <= ageTo);
      })();
    const matchesSearch =
      !needle ||
      [`${p.first_name ?? ""} ${p.last_name ?? ""}`, p.email ?? ""].some((field) =>
        field.toLowerCase().includes(needle)
      ) ||
      (!!p.phone_number &&
        (p.phone_number.toLowerCase().includes(needle) ||
          (needleDigits.length > 0 && p.phone_number.replace(/\D/g, "").includes(needleDigits))));
    return matchesStatus && matchesCampus && matchesGrade && matchesAge && matchesSearch;
  });

  // Defaults to last_name to match the order the real-mode walk already
  // fetches in (sort=last_name — see fetchAllProfilesFromSubsplash), so
  // omitting sortBy doesn't change today's behavior. The other name field is
  // a tiebreaker for people who share the primary sort field.
  const primaryKey = sortBy ?? "last_name";
  const secondaryKey = primaryKey === "last_name" ? "first_name" : "last_name";
  filtered.sort(
    (a, b) =>
      (a[primaryKey] ?? "").localeCompare(b[primaryKey] ?? "") ||
      (a[secondaryKey] ?? "").localeCompare(b[secondaryKey] ?? "")
  );

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

// The full profile set (mock fixtures or the cached Subsplash walk). Shared by
// searchChildren and the volunteer-visibility helpers below so they all reason
// over the same data — ADR-0011.
async function allProfiles(): Promise<Profile[]> {
  return USE_MOCK_DATA ? mockProfiles : getCachedProfiles();
}

// The authoritative child marker is household_role === "child" (ADR-0011 /
// ADR-0006), not academic_grade — grades only cover Pre-K–12th and aren't a
// reliable child detector.
function isChild(profile: Profile): boolean {
  return profile.household_role === "child";
}

// Every profile belonging to a child-bearing household — children plus their
// guardians/parents/siblings. This is the pool the Children directory draws
// from and exactly matches profileVisibleToVolunteer's rule below, so
// broadening the list via memberType never exposes anyone a volunteer
// couldn't already reach by opening a child's household (ADR-0011).
async function childFamilyMembers(): Promise<Profile[]> {
  const all = await allProfiles();
  const childBearingHouseholdIds = new Set(
    all.filter(isChild).map((p) => p.household_id).filter((id): id is string => !!id)
  );
  return all.filter((p) => !!p.household_id && childBearingHouseholdIds.has(p.household_id));
}

export type ChildrenMemberType = "Child" | "Adult" | "All";

export interface SearchChildrenParams extends SearchProfilesParams {
  // Which members of child-bearing households to include. Defaults to
  // "Child" so the page's out-of-the-box behavior is unchanged — it only
  // broadens to guardians/parents when a caller explicitly asks.
  memberType?: ChildrenMemberType;
}

function matchesMemberType(profile: Profile, memberType: ChildrenMemberType): boolean {
  if (memberType === "All") return true;
  const type = householdMemberType(profile.household_role);
  return memberType === "Child" ? type === "Child" : type !== "Child";
}

// Children directory (ADR-0011): same filter/paginate/search as
// searchProfiles, but the base set is a child-bearing household's members
// (scoped further by memberType) — so overallTotal reports that scoped
// count, and no unrelated adult can ever appear regardless of the other
// filters.
export async function searchChildren(params: SearchChildrenParams): Promise<ProfileSearchResult> {
  const pool = await childFamilyMembers();
  const memberType = params.memberType ?? "Child";
  const scoped = pool.filter((p) => matchesMemberType(p, memberType));
  return filterAndPaginateProfiles(scoped, params);
}

export interface ParentContact {
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
}

export type ChildWithParents = Profile & {
  parent1?: ParentContact;
  parent2?: ParentContact;
};

// Attaches up to two guardian/parent contacts per child, drawn from the same
// cached profile set the rest of the Children directory reasons over (no new
// Subsplash calls) — used only by the CSV export, which needs a child's own
// row plus their parents' contact info together. This doesn't expose
// anything a volunteer couldn't already see by opening the child's household
// (ADR-0011's profileVisibleToVolunteer already covers a child's parents).
// Parents are picked deterministically (sorted by last, then first name) so
// re-exporting the same filtered set is stable.
export async function attachParentContacts(children: Profile[]): Promise<ChildWithParents[]> {
  const all = await allProfiles();
  const parentsByHousehold = new Map<string, Profile[]>();

  for (const child of children) {
    if (!child.household_id || parentsByHousehold.has(child.household_id)) continue;
    const parents = all
      .filter(
        (p) =>
          p.household_id === child.household_id &&
          (p.household_role === "guardian" || p.household_role === "parent")
      )
      .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
    parentsByHousehold.set(child.household_id, parents);
  }

  const toContact = (p: Profile): ParentContact => ({
    first_name: p.first_name,
    last_name: p.last_name,
    email: p.email,
    phone_number: p.phone_number,
  });

  return children.map((child) => {
    const parents = child.household_id ? (parentsByHousehold.get(child.household_id) ?? []) : [];
    return {
      ...child,
      parent1: parents[0] ? toContact(parents[0]) : undefined,
      parent2: parents[1] ? toContact(parents[1]) : undefined,
    };
  });
}

// A household is "child-bearing" if any member is a child. This is the single
// predicate the whole volunteer-scoping model is built on (ADR-0011).
export async function householdHasChild(householdId: string): Promise<boolean> {
  if (!householdId) return false;
  const all = await allProfiles();
  return all.some((p) => p.household_id === householdId && isChild(p));
}

// Volunteer read scope: a profile is visible iff it is a child, or it shares a
// (child-bearing) household with a child — i.e. a child's parents/guardians and
// siblings are visible, but unrelated adults are not. Returns false for an
// unknown id (fail closed — this gates member PII).
export async function profileVisibleToVolunteer(profileId: string): Promise<boolean> {
  const all = await allProfiles();
  const profile = all.find((p) => p.id === profileId);
  if (!profile) return false;
  if (isChild(profile)) return true;
  return (
    !!profile.household_id &&
    all.some((p) => p.household_id === profile.household_id && isChild(p))
  );
}

// Volunteer read scope for a household: visible iff it contains a child.
export function householdVisibleToVolunteer(householdId: string): Promise<boolean> {
  return householdHasChild(householdId);
}

export async function getProfile(id: string): Promise<Profile | null> {
  if (USE_MOCK_DATA) {
    return mockProfiles.find((p) => p.id === id) ?? null;
  }
  try {
    const raw = await subsplashFetch<RawProfile>(
      `/people/v1/profiles/${id}?include=latest-membership-status-change,address`
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
  Pick<
    Profile,
    "first_name" | "last_name" | "email" | "phone_number" | "campus" | "allergy_notes" | "care_notes"
  >
>;

// Distinguishes "campus write couldn't be resolved" (a 422-worthy
// client-ish situation) from an unexpected failure, so the API route can
// respond meaningfully rather than a blanket error.
export class CampusUpdateError extends Error {}

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

// Builds the custom_fields entry that sets a profile's campus, discovering
// the field's definition/revision (and dropdown choice id) from real
// profile data — first the profile being edited (freshest revision_id),
// falling back to the cached sample when that profile hasn't set campus
// yet or is missing a choice id we need. Throws CampusUpdateError when the
// write can't be resolved so the caller can report a clear reason.
async function buildCampusFieldInput(
  profileId: string,
  campus: Campus
): Promise<{ custom_field_definition: { id: string; revision_id?: string }; value: object }> {
  const currentRaw = await subsplashFetch<RawProfile>(`/people/v1/profiles/${profileId}`).catch(
    () => null
  );
  const fromProfile = currentRaw ? findCampusField(currentRaw.custom_fields) : undefined;
  let meta = fromProfile ? mergeCampusFieldMeta(null, fromProfile) : null;

  if (!meta || !meta.revisionId || (campusUsesChoices(meta) && !meta.choiceIds[campus])) {
    const sampled = await getCampusFieldMetaCached();
    if (sampled) {
      meta = meta
        ? { ...sampled, ...meta, choiceIds: { ...sampled.choiceIds, ...meta.choiceIds } }
        : sampled;
    }
  }

  if (!meta || !meta.revisionId) {
    throw new CampusUpdateError(
      "Could not resolve the Campus custom field's write metadata from Subsplash — it may not be configured."
    );
  }

  let value: { choice: { id: string } } | { text: string };
  if (campusUsesChoices(meta)) {
    const choiceId = meta.choiceIds[campus];
    if (!choiceId) {
      throw new CampusUpdateError(
        `No known Subsplash dropdown choice id for campus "${campus}" — it hasn't appeared on any sampled profile yet.`
      );
    }
    value = { choice: { id: choiceId } };
  } else {
    value = { text: campus };
  }

  return {
    custom_field_definition: { id: meta.definitionId, revision_id: meta.revisionId },
    value,
  };
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

  if (!ORG_KEY) {
    throw new Error("Missing SUBSPLASH_ORG_KEY — required as filter[org_key] on every request.");
  }

  const body: Record<string, unknown> = { ...topLevelPatch };
  if (topLevelPatch.phone_number !== undefined) {
    body.phone_number = phoneNumberForSubsplash(topLevelPatch.phone_number);
  }
  // Campus lives in a custom field, not a top-level column, so it rides
  // along in the same PATCH via the custom_fields array (openapi.yaml →
  // CustomFieldValueInput).
  if (campus !== undefined) {
    body.custom_fields = [await buildCampusFieldInput(id, campus)];
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
  // walk itself — see getCachedHouseholds for why.
  const all = USE_MOCK_DATA
    ? mockHouseholds.map((h) => ({
        ...h,
        address_parts: h.address_parts ?? parseAddressString(h.address),
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
    return {
      ...household,
      address_parts: household.address_parts ?? parseAddressString(household.address),
      members: mockProfiles.filter((p) => p.household_id === id),
    };
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

export type UpdateHouseholdInput = Partial<HouseholdAddress>;

export async function updateHousehold(id: string, patch: UpdateHouseholdInput): Promise<Household> {
  if (USE_MOCK_DATA) {
    const existing = mockHouseholds.find((h) => h.id === id);
    if (!existing) throw new Error(`Household not found: ${id}`);
    const mergedParts: HouseholdAddress = {
      ...(existing.address_parts ?? parseAddressString(existing.address) ?? {}),
      ...patch,
    };
    existing.address_parts = mergedParts;
    existing.address = formatAddressParts(mergedParts);
    existing.updated_at = new Date().toISOString();
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
    // postal_code) — confirmed in openapi.yaml's Address schema. We carry
    // those parts through the whole edit flow, so send them directly.
    body: JSON.stringify(Object.keys(patch).length > 0 ? { _embedded: { address: patch } } : {}),
  });
  if (!res.ok) {
    throw new Error(`Subsplash API error: ${res.status} PATCH /people/v1/households/${id}`);
  }
  revalidateTag("subsplash-households");
  return mapHousehold((await res.json()) as RawHousehold);
}
