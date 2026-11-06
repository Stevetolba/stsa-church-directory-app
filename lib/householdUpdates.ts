// Storage and apply logic for household self-update requests. Parents save
// proposed field changes here (nothing touches Subsplash); an admin later
// accepts individual changes and only then are they written. Same dual-path
// convention as lib/loginCode.ts: Neon Postgres via Drizzle when DATABASE_URL
// is set, otherwise an in-memory globalThis store so dev and tests need no
// setup.

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "./db";
import {
  householdUpdateChanges,
  householdUpdateRequests,
  type HouseholdUpdateChangeRow,
  type HouseholdUpdateRequestRow,
} from "./db/schema";
import type { ChangeField, ProposedChange, SubjectType } from "./householdUpdateLogic";
import { ADDRESS_FIELDS, EXTRA_MEMBER_FIELDS, HOME_ADDRESS_FIELDS, type HomeAddressField } from "./householdUpdateLogic";

export type RequestStatus = "draft" | "pending" | "applied" | "partially_applied" | "rejected";
export type Decision = "pending" | "accepted" | "rejected";

export type UpdateRequest = Omit<HouseholdUpdateRequestRow, "status"> & { status: RequestStatus };
export type UpdateChange = Omit<HouseholdUpdateChangeRow, "subjectType" | "field" | "decision"> & {
  subjectType: SubjectType;
  field: ChangeField;
  decision: Decision;
};

interface Store {
  requests: UpdateRequest[];
  changes: UpdateChange[];
}

declare global {
  // eslint-disable-next-line no-var
  var __householdUpdateStore: Store | undefined;
}

const mem = (): Store => (globalThis.__householdUpdateStore ??= { requests: [], changes: [] });
const now = () => new Date();
const OPEN: RequestStatus[] = ["draft", "pending"];

const asRequest = (r: HouseholdUpdateRequestRow): UpdateRequest => ({ ...r, status: r.status as RequestStatus });
const asChange = (c: HouseholdUpdateChangeRow): UpdateChange => c as UpdateChange;

// ---------------------------------------------------------------- requests

export async function getRequest(id: string): Promise<UpdateRequest | null> {
  if (isDbConfigured()) {
    const [r] = await getDb().select().from(householdUpdateRequests).where(eq(householdUpdateRequests.id, id)).limit(1);
    return r ? asRequest(r) : null;
  }
  return mem().requests.find((r) => r.id === id) ?? null;
}

export async function getOpenRequest(householdId: string): Promise<UpdateRequest | null> {
  if (isDbConfigured()) {
    const [r] = await getDb()
      .select()
      .from(householdUpdateRequests)
      .where(and(eq(householdUpdateRequests.householdId, householdId), inArray(householdUpdateRequests.status, OPEN)))
      .limit(1);
    return r ? asRequest(r) : null;
  }
  return mem().requests.find((r) => r.householdId === householdId && OPEN.includes(r.status)) ?? null;
}

export interface Submitter {
  householdId: string;
  householdName?: string | null;
  profileId: string;
  email: string;
}

// One open (draft or pending) request per household: a second parent, or the
// same parent on another device, continues the same request.
export async function getOrCreateOpenRequest(who: Submitter): Promise<UpdateRequest> {
  const existing = await getOpenRequest(who.householdId);
  if (existing) return existing;
  if (isDbConfigured()) {
    await getDb()
      .insert(householdUpdateRequests)
      .values({
        householdId: who.householdId,
        householdName: who.householdName ?? null,
        submittedByProfileId: who.profileId,
        submittedByEmail: who.email,
      })
      .onConflictDoNothing();
    // A concurrent insert may have won the race; read whichever row exists.
    const row = await getOpenRequest(who.householdId);
    if (!row) throw new Error("Could not create household update request");
    return row;
  }
  const t = now();
  const row: UpdateRequest = {
    id: crypto.randomUUID(),
    householdId: who.householdId,
    householdName: who.householdName ?? null,
    submittedByProfileId: who.profileId,
    submittedByEmail: who.email,
    note: null,
    status: "draft",
    rejectionReason: null,
    submittedAt: null,
    reviewedByEmail: null,
    reviewedAt: null,
    createdAt: t,
    updatedAt: t,
  };
  mem().requests.push(row);
  return row;
}

export async function listRequests(opts: { status?: RequestStatus } = {}): Promise<UpdateRequest[]> {
  if (isDbConfigured()) {
    const where = opts.status
      ? eq(householdUpdateRequests.status, opts.status)
      : ne(householdUpdateRequests.status, "draft");
    const rows = await getDb().select().from(householdUpdateRequests).where(where).orderBy(desc(householdUpdateRequests.updatedAt));
    return rows.map(asRequest);
  }
  return mem()
    .requests.filter((r) => (opts.status ? r.status === opts.status : r.status !== "draft"))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

async function patchRequest(id: string, patch: Partial<Omit<UpdateRequest, "id">>): Promise<void> {
  const next = { ...patch, updatedAt: now() };
  if (isDbConfigured()) {
    await getDb().update(householdUpdateRequests).set(next).where(eq(householdUpdateRequests.id, id));
    return;
  }
  const r = mem().requests.find((x) => x.id === id);
  if (r) Object.assign(r, next);
}

// ----------------------------------------------------------------- changes

export async function listChanges(requestId: string): Promise<UpdateChange[]> {
  if (isDbConfigured()) {
    const rows = await getDb()
      .select()
      .from(householdUpdateChanges)
      .where(eq(householdUpdateChanges.requestId, requestId))
      .orderBy(householdUpdateChanges.createdAt);
    return rows.map(asChange);
  }
  return mem().changes.filter((c) => c.requestId === requestId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export interface Subject {
  type: SubjectType;
  id: string;
  label: string;
}

// Replaces everything proposed for one subject (a person, the address, or one
// new member) with the given set. An empty set clears the subject, which is how
// "typed it back to the original" removes a pending change.
export async function replaceSubjectChanges(requestId: string, subject: Subject, changes: ProposedChange[]): Promise<void> {
  const request = await getRequest(requestId);
  if (!request || !OPEN.includes(request.status)) throw new Error("This update can no longer be edited.");
  const t = now();
  if (isDbConfigured()) {
    const db = getDb();
    await db
      .delete(householdUpdateChanges)
      .where(
        and(
          eq(householdUpdateChanges.requestId, requestId),
          eq(householdUpdateChanges.subjectType, subject.type),
          eq(householdUpdateChanges.subjectId, subject.id)
        )
      );
    if (changes.length > 0) {
      await db.insert(householdUpdateChanges).values(
        changes.map((c) => ({
          requestId,
          subjectType: subject.type,
          subjectId: subject.id,
          subjectLabel: subject.label,
          field: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue,
        }))
      );
    }
  } else {
    const store = mem();
    store.changes = store.changes.filter(
      (c) => !(c.requestId === requestId && c.subjectType === subject.type && c.subjectId === subject.id)
    );
    for (const c of changes) {
      store.changes.push({
        id: crypto.randomUUID(),
        requestId,
        subjectType: subject.type,
        subjectId: subject.id,
        subjectLabel: subject.label,
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
        decision: "pending",
        appliedAt: null,
        applyError: null,
        createdProfileId: null,
        createdAt: new Date(t.getTime() + store.changes.length),
      });
    }
  }
  await patchRequest(requestId, {});
}

// Submitting moves the request to "pending" for admin review. Calling it
// again on a pending request just refreshes the note and timestamp.
export async function submitRequest(requestId: string, note: string | null): Promise<void> {
  const request = await getRequest(requestId);
  if (!request || !OPEN.includes(request.status)) throw new Error("This update can no longer be submitted.");
  const changes = await listChanges(requestId);
  if (changes.length === 0 && !(note && note.trim())) throw new Error("There is nothing to submit yet.");
  await patchRequest(requestId, { status: "pending", note: note?.trim() || null, submittedAt: now() });
}

// ------------------------------------------------------------------ review

async function patchChange(id: string, patch: Partial<Omit<UpdateChange, "id">>): Promise<void> {
  if (isDbConfigured()) {
    await getDb().update(householdUpdateChanges).set(patch).where(eq(householdUpdateChanges.id, id));
    return;
  }
  const c = mem().changes.find((x) => x.id === id);
  if (c) Object.assign(c, patch);
}

// A new member is accepted or rejected as a unit (a half-created person with
// no name or role makes no sense), so any accepted field accepts them all.
export function normalizeAcceptedIds(changes: UpdateChange[], acceptedIds: Iterable<string>): Set<string> {
  const accepted = new Set(acceptedIds);
  const acceptedNewMembers = new Set(
    changes.filter((c) => c.subjectType === "new_member" && accepted.has(c.id)).map((c) => c.subjectId)
  );
  for (const c of changes) {
    if (c.subjectType === "new_member" && acceptedNewMembers.has(c.subjectId)) accepted.add(c.id);
  }
  return accepted;
}

export interface ApplyDeps {
  updateProfile: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  updateHousehold: (id: string, patch: Record<string, string>) => Promise<unknown>;
  createProfile: (input: {
    first_name: string;
    last_name: string;
    household_id: string;
    household_role: "parent" | "guardian" | "child";
    date_of_birth?: string;
    graduation_year?: number;
    gender?: string;
    email?: string;
  }) => Promise<{ id: string }>;
  // Optional: the person's current own address, so a partly changed address
  // is merged rather than sent as a fragment.
  getProfileAddress?: (id: string) => Promise<Record<string, string | undefined> | undefined>;
}

function splitProfileWrites(cs: UpdateChange[]): UpdateChange[][] {
  const home = cs.filter((c) => c.field in HOME_ADDRESS_FIELDS);
  const notes = cs.filter((c) => c.field === "care_notes");
  const basic = cs.filter((c) => !(c.field in HOME_ADDRESS_FIELDS) && c.field !== "care_notes");
  return [basic, home, notes].filter((g) => g.length > 0);
}

// Turns a person's accepted change rows into one updateProfile patch. A
// person's own address is sent as a whole: the changed parts laid over what
// they have now.
async function buildProfilePatch(
  cs: UpdateChange[],
  d: ApplyDeps,
  profileId: string | null
): Promise<Record<string, unknown>> {
  const patch: Record<string, unknown> = {};
  const addrChanges: Record<string, string> = {};
  for (const c of cs) {
    if (c.field === "graduation_year") patch.graduation_year = Number(c.newValue);
    else if (c.field in HOME_ADDRESS_FIELDS) addrChanges[HOME_ADDRESS_FIELDS[c.field as HomeAddressField]] = c.newValue ?? "";
    else patch[c.field] = c.newValue ?? "";
  }
  if (Object.keys(addrChanges).length > 0) {
    const current = profileId && d.getProfileAddress ? await d.getProfileAddress(profileId) : undefined;
    patch.address_parts = { ...(current ?? {}), ...addrChanges };
  }
  return patch;
}

async function defaultDeps(): Promise<ApplyDeps> {
  const sub = await import("./subsplash");
  return {
    updateProfile: (id, patch) => sub.updateProfile(id, patch),
    updateHousehold: (id, patch) => sub.updateHousehold(id, patch),
    createProfile: (input) => sub.createProfile(input),
    getProfileAddress: async (id) => {
      const p = await sub.getProfile(id);
      return p?.address_parts as Record<string, string | undefined> | undefined;
    },
  };
}

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Unknown error").slice(0, 500);

// Writes every accepted-but-not-yet-applied change to Subsplash, recording
// per-change success or error so a failure can be retried without losing the
// rest. Safe to call repeatedly: applied changes are skipped.
export async function applyAcceptedChanges(requestId: string, deps?: ApplyDeps): Promise<void> {
  const request = await getRequest(requestId);
  if (!request) throw new Error("Request not found");
  if (request.status !== "pending") throw new Error("Only a pending request can be applied.");
  const d = deps ?? (await defaultDeps());
  const todo = (await listChanges(requestId)).filter((c) => c.decision === "accepted" && !c.appliedAt);

  const group = (type: SubjectType) => {
    const m = new Map<string, UpdateChange[]>();
    for (const c of todo.filter((x) => x.subjectType === type)) m.set(c.subjectId, [...(m.get(c.subjectId) ?? []), c]);
    return m;
  };
  const finish = async (cs: UpdateChange[], error: string | null, createdProfileId?: string) => {
    for (const c of cs) {
      await patchChange(c.id, error ? { applyError: error } : { appliedAt: now(), applyError: null, ...(createdProfileId ? { createdProfileId } : {}) });
    }
  };

  for (const [profileId, cs] of Array.from(group("profile").entries())) {
    // Basic details, home address and care notes are separate Subsplash
    // writes (the notes are a custom field), so a refusal of one is reported
    // on its own rows and doesn't stop the others.
    for (const part of splitProfileWrites(cs)) {
      try {
        await d.updateProfile(profileId, await buildProfilePatch(part, d, profileId));
        await finish(part, null);
      } catch (e) {
        await finish(part, errMessage(e));
      }
    }
  }

  const addr = group("household").get(request.householdId) ?? [];
  if (addr.length > 0) {
    const patch: Record<string, string> = {};
    for (const c of addr) if ((ADDRESS_FIELDS as string[]).includes(c.field)) patch[c.field] = c.newValue ?? "";
    try {
      await d.updateHousehold(request.householdId, patch);
      await finish(addr, null);
    } catch (e) {
      await finish(addr, errMessage(e));
    }
  }

  const everything = await listChanges(requestId);
  for (const [subjectKey, cs] of Array.from(group("new_member").entries())) {
    const v = (f: ChangeField) => cs.find((c) => c.field === f)?.newValue ?? undefined;
    const extras = cs.filter((c) => EXTRA_MEMBER_FIELDS.includes(c.field));
    const core = cs.filter((c) => !EXTRA_MEMBER_FIELDS.includes(c.field));
    // A profile created on an earlier attempt must not be created twice.
    let createdId = everything.find((c) => c.subjectType === "new_member" && c.subjectId === subjectKey && c.createdProfileId)
      ?.createdProfileId ?? undefined;

    if (!createdId) {
      const role = v("household_role");
      const first = v("first_name");
      const last = v("last_name");
      if (!first || !last || (role !== "parent" && role !== "guardian" && role !== "child")) {
        await finish(cs, "Missing name or role");
        continue;
      }
      try {
        const gradYear = v("graduation_year");
        const created = await d.createProfile({
          first_name: first,
          last_name: last,
          household_id: request.householdId,
          household_role: role,
          date_of_birth: v("date_of_birth"),
          graduation_year: gradYear ? Number(gradYear) : undefined,
          gender: v("gender"),
          email: v("email"),
        });
        createdId = created.id;
        await finish(core, null, createdId);
      } catch (e) {
        await finish(cs, errMessage(e));
        continue;
      }
    }

    // Phone, home address and notes are written to the new profile afterwards.
    for (const part of splitProfileWrites(extras)) {
      try {
        await d.updateProfile(createdId, await buildProfilePatch(part, d, null));
        await finish(part, null, createdId);
      } catch (e) {
        await finish(part, errMessage(e));
      }
    }
  }

  await finalizeRequest(requestId);
}

// Decides the request's status from what happened to its changes. While any
// accepted change has failed it stays "pending" so the admin can retry.
export async function finalizeRequest(requestId: string, reviewerEmail?: string): Promise<RequestStatus> {
  const changes = await listChanges(requestId);
  const accepted = changes.filter((c) => c.decision === "accepted");
  const failed = accepted.filter((c) => !c.appliedAt);
  const rejected = changes.filter((c) => c.decision === "rejected");
  let status: RequestStatus;
  if (failed.length > 0) status = "pending";
  else if (accepted.length === 0) status = "rejected";
  else if (rejected.length > 0) status = "partially_applied";
  else status = "applied";
  await patchRequest(requestId, {
    status,
    ...(status !== "pending" ? { reviewedAt: now() } : {}),
    ...(reviewerEmail ? { reviewedByEmail: reviewerEmail } : {}),
  });
  return status;
}

// Admin accepts the ticked changes (everything else is rejected) and they are
// written to Subsplash.
export async function reviewRequest(
  requestId: string,
  acceptedIds: string[],
  reviewerEmail: string,
  deps?: ApplyDeps
): Promise<RequestStatus> {
  const request = await getRequest(requestId);
  if (!request || request.status !== "pending") throw new Error("Only a pending request can be reviewed.");
  const changes = await listChanges(requestId);
  const accepted = normalizeAcceptedIds(changes, acceptedIds);
  for (const c of changes) {
    if (c.appliedAt) continue; // already written; keep its decision
    await patchChange(c.id, { decision: accepted.has(c.id) ? "accepted" : "rejected", applyError: null });
  }
  await patchRequest(requestId, { reviewedByEmail: reviewerEmail });
  await applyAcceptedChanges(requestId, deps);
  return finalizeRequest(requestId, reviewerEmail);
}

// The admin created this person in Subsplash by hand. Their rows are closed
// out as applied (noted as manual) without any write to Subsplash.
export async function markNewMemberAddedManually(
  requestId: string,
  subjectId: string,
  reviewerEmail: string
): Promise<RequestStatus> {
  const request = await getRequest(requestId);
  if (!request || request.status !== "pending") throw new Error("Only a pending request can be updated.");
  const rows = (await listChanges(requestId)).filter((c) => c.subjectType === "new_member" && c.subjectId === subjectId);
  if (rows.length === 0) throw new Error("That family member wasn't found.");
  for (const c of rows) {
    if (c.appliedAt) continue;
    await patchChange(c.id, {
      decision: "accepted",
      appliedAt: now(),
      applyError: `Added manually in Subsplash (marked by ${reviewerEmail})`,
    });
  }
  await patchRequest(requestId, { reviewedByEmail: reviewerEmail });
  return finalizeRequest(requestId, reviewerEmail);
}

export async function rejectRequest(requestId: string, reason: string, reviewerEmail: string): Promise<void> {
  const request = await getRequest(requestId);
  if (!request || request.status !== "pending") throw new Error("Only a pending request can be rejected.");
  const changes = await listChanges(requestId);
  if (changes.some((c) => c.appliedAt)) throw new Error("Some changes were already applied; review the rest instead.");
  for (const c of changes) await patchChange(c.id, { decision: "rejected" });
  await patchRequest(requestId, {
    status: "rejected",
    rejectionReason: reason.trim() || null,
    reviewedByEmail: reviewerEmail,
    reviewedAt: now(),
  });
}

export async function countPendingRequests(): Promise<number> {
  if (isDbConfigured()) {
    const [r] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(householdUpdateRequests)
      .where(eq(householdUpdateRequests.status, "pending"));
    return r?.n ?? 0;
  }
  return mem().requests.filter((r) => r.status === "pending").length;
}
