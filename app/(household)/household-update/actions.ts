"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAccessEvent } from "@/lib/accessLog";
import {
  checkHouseholdLoginCode,
  requestHouseholdLoginCode,
  consumeHouseholdLoginCode,
  type CodeFailure,
  type HouseholdCandidate,
} from "@/lib/loginCode";
import { clearHouseholdSession, getHouseholdSession, setHouseholdSession, type HouseholdSession } from "@/lib/householdSession";
import {
  buildAddressChanges,
  buildNewMemberChanges,
  buildProfileChanges,
  type NewMemberRole,
} from "@/lib/householdUpdateLogic";
import { autoApplySubmittedRequest, getOrCreateOpenRequest, getOpenRequest, listChanges, replaceSubjectChanges, submitRequest } from "@/lib/householdUpdates";
import { getLiveMember } from "@/lib/householdPortal";
import { getHousehold } from "@/lib/subsplash";
import { householdMemberType } from "@/lib/household";
import { CHURCH_NAME } from "@/lib/trainingEmail";
import { sendEmail } from "@/lib/email";
import { buildHouseholdAutoAppliedAdminEmail, buildHouseholdSubmittedAdminEmail } from "@/lib/householdUpdateEmail";
import { getHouseholdAutoApply } from "@/lib/appSettings";

// ----------------------------------------------------------------- sign-in

export async function requestHouseholdCodeAction(email: string): Promise<void> {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  await requestHouseholdLoginCode(email, { logoUrl: `${proto}://${host}/stsa-logo.png` });
}

export async function checkHouseholdCodeAction(
  email: string,
  code: string
): Promise<{ ok: true; candidates: HouseholdCandidate[] } | { ok: false; reason: CodeFailure }> {
  return checkHouseholdLoginCode(email, code);
}

// Redirects on success; only returns on failure.
export async function signInHouseholdAction(email: string, code: string, profileId: string): Promise<{ error: string }> {
  const user = await consumeHouseholdLoginCode(email, code, profileId);
  if (!user) {
    await recordAccessEvent({ email: email.trim().toLowerCase(), role: "household", eventType: "sign_in_denied" });
    return { error: "That code didn't work. Please request a new one." };
  }
  setHouseholdSession({ profileId: user.id, householdId: user.householdId, email: user.email, name: user.name });
  await recordAccessEvent({ email: user.email, name: user.name, role: "household", eventType: "sign_in" });
  redirect("/household-update");
}

export async function signOutHouseholdAction(): Promise<void> {
  clearHouseholdSession();
  redirect("/household-update/login");
}

// ------------------------------------------------------------------ editing

// Optional extras a parent may add for anyone (children also get notes).
type ContactInput = {
  phone_number?: string;
  gender?: string;
  email?: string;
  home_street?: string;
  home_city?: string;
  home_state?: string;
  home_postal_code?: string;
  allergy_notes?: string;
  care_notes?: string;
};

// outcome is only set when instant apply is on (ADR-0031): the edit was written
// to Subsplash ("applied"), is waiting for the church office ("waiting", e.g. a
// new member), couldn't be written just now ("failed"), or changed nothing.
export type SaveOutcome = "applied" | "waiting" | "failed" | "unchanged";
export type SaveResult = { ok: true; outcome?: SaveOutcome } | { ok: false; errors: Record<string, string> };

function needSession(): HouseholdSession {
  const s = getHouseholdSession();
  if (!s) redirect("/household-update/login");
  return s;
}

async function openRequestFor(s: HouseholdSession) {
  const household = await getHousehold(s.householdId);
  return getOrCreateOpenRequest({
    householdId: s.householdId,
    householdName: household?.name ?? null,
    profileId: s.profileId,
    email: s.email,
  });
}

async function adminEmailsAndUrl(requestId: string) {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  return { admins, reviewUrl: `${proto}://${host}/settings/household-updates/${requestId}` };
}

// Admins hear about an instant apply only when something is left for them.
// The family gets an on-screen message instead of an email.
async function notifyAdminsWaiting(
  s: HouseholdSession,
  request: { id: string; householdName: string | null },
  applied: number,
  waiting: number
) {
  if (waiting === 0) return;
  try {
    const { admins, reviewUrl } = await adminEmailsAndUrl(request.id);
    const mail = buildHouseholdAutoAppliedAdminEmail({
      householdName: request.householdName ?? "A household",
      submittedBy: s.name,
      appliedCount: applied,
      waitingCount: waiting,
      reviewUrl,
    });
    for (const to of admins) await sendEmail({ to, fromName: CHURCH_NAME, subject: mail.subject, html: mail.html });
  } catch (err) {
    console.error("Household instant-apply admin email failed", err);
  }
}

// One-click update (ADR-0031): when the admin switch is on, a saved edit is
// submitted and written to Subsplash straight away. Anything that can't be
// (new members, values that moved, failed writes) stays pending for an admin.
async function applyNow(
  s: HouseholdSession,
  request: { id: string; householdName: string | null; note: string | null },
  subjectId: string
): Promise<SaveOutcome> {
  try {
    await submitRequest(request.id, request.note);
    const r = await autoApplySubmittedRequest(request.id);
    await recordAccessEvent({ email: s.email, name: s.name, role: "household", eventType: "household_update_apply", resource: `auto:${r.applied}/${r.waiting}` });
    await notifyAdminsWaiting(s, request, r.applied, r.waiting);
    const rows = await listChanges(request.id);
    if (rows.some((c) => c.subjectId === subjectId && !c.appliedAt && c.applyError)) return "failed";
    if (rows.some((c) => c.subjectId === subjectId && !c.appliedAt)) return "waiting";
    return "applied";
  } catch (err) {
    console.error("Household one-click update failed", err);
    return "failed";
  }
}

export async function saveMemberAction(
  profileId: string,
  input: ContactInput & { first_name: string; last_name: string; date_of_birth?: string; grade_value?: number | null }
): Promise<SaveResult> {
  const s = needSession();
  // The household id comes from the session; the profile must be a member of it.
  const live = await getLiveMember(s.householdId, profileId);
  if (!live) return { ok: false, errors: { form: "That person isn't part of your household." } };

  const isChild = householdMemberType(live.household_role) === "Child";
  const { changes, errors } = buildProfileChanges(live, input, { isChild });
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const request = await openRequestFor(s);
  await replaceSubjectChanges(
    request.id,
    { type: "profile", id: profileId, label: `${live.first_name} ${live.last_name}`.trim() },
    changes
  );
  await recordAccessEvent({ email: s.email, name: s.name, role: "household", eventType: "household_update_submit", resource: "draft-member" });
  if (await getHouseholdAutoApply()) {
    if (changes.length === 0) return { ok: true, outcome: "unchanged" };
    return { ok: true, outcome: await applyNow(s, request, profileId) };
  }
  return { ok: true };
}

export async function saveAddressAction(input: {
  street: string;
  city: string;
  state: string;
  postal_code: string;
}): Promise<SaveResult> {
  const s = needSession();
  const household = await getHousehold(s.householdId);
  if (!household) return { ok: false, errors: { form: "We couldn't find your household." } };
  const { changes, errors } = buildAddressChanges(household.address_parts ?? {}, input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const request = await openRequestFor(s);
  await replaceSubjectChanges(request.id, { type: "household", id: s.householdId, label: "Household address" }, changes);
  await recordAccessEvent({ email: s.email, name: s.name, role: "household", eventType: "household_update_submit", resource: "draft-address" });
  if (await getHouseholdAutoApply()) {
    if (changes.length === 0) return { ok: true, outcome: "unchanged" };
    return { ok: true, outcome: await applyNow(s, request, s.householdId) };
  }
  return { ok: true };
}

export async function saveNewMemberAction(
  key: string | null,
  input: ContactInput & {
    first_name: string;
    last_name: string;
    role: NewMemberRole;
    date_of_birth?: string;
    grade_value?: number | null;
  }
): Promise<SaveResult> {
  const s = needSession();
  const { changes, errors } = buildNewMemberChanges(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const request = await openRequestFor(s);

  let subjectKey = key;
  const existing = await listChanges(request.id);
  if (subjectKey) {
    // Only allow editing a new member this household already proposed.
    if (!existing.some((c) => c.subjectType === "new_member" && c.subjectId === subjectKey)) {
      return { ok: false, errors: { form: "That new family member wasn't found." } };
    }
  } else {
    const taken = new Set(existing.filter((c) => c.subjectType === "new_member").map((c) => c.subjectId));
    let n = 1;
    while (taken.has(`new-${n}`)) n++;
    subjectKey = `new-${n}`;
  }
  await replaceSubjectChanges(
    request.id,
    { type: "new_member", id: subjectKey, label: `${input.first_name} ${input.last_name}`.trim() },
    changes
  );
  await recordAccessEvent({ email: s.email, name: s.name, role: "household", eventType: "household_update_submit", resource: "draft-new-member" });
  // A new member always waits for the church office; submitting now puts them
  // in the admin queue (and applies anything else already saved).
  if (await getHouseholdAutoApply()) return { ok: true, outcome: await applyNow(s, request, subjectKey) };
  return { ok: true };
}

export async function removeNewMemberAction(key: string): Promise<void> {
  const s = needSession();
  const request = await getOpenRequest(s.householdId);
  if (!request) return;
  await replaceSubjectChanges(request.id, { type: "new_member", id: key, label: "" }, []);
}

// Discards a saved proposal for one person or the address.
export async function discardChangesAction(subject: { type: "profile" | "household"; id: string }): Promise<void> {
  const s = needSession();
  const request = await getOpenRequest(s.householdId);
  if (!request) return;
  const id = subject.type === "household" ? s.householdId : subject.id;
  await replaceSubjectChanges(request.id, { type: subject.type, id, label: "" }, []);
}

export type SubmitResult = { error?: string; mode?: "instant" | "review"; waiting?: number };

export async function submitHouseholdUpdateAction(note: string): Promise<SubmitResult> {
  const s = needSession();
  const request = await getOpenRequest(s.householdId);
  if (!request) return { error: "There's nothing to submit yet." };
  try {
    await submitRequest(request.id, note.slice(0, 1000));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not submit." };
  }
  await recordAccessEvent({ email: s.email, name: s.name, role: "household", eventType: "household_update_submit", resource: "submitted" });

  // ADR-0031: when the admin switch is on, write straight to Subsplash. Any
  // failure leaves the request pending for an admin; it never fails the submit.
  let instant: { applied: number; waiting: number } | null = null;
  try {
    if (await getHouseholdAutoApply()) {
      const r = await autoApplySubmittedRequest(request.id);
      instant = { applied: r.applied, waiting: r.waiting };
      await recordAccessEvent({ email: s.email, name: s.name, role: "household", eventType: "household_update_apply", resource: `auto:${r.applied}/${r.waiting}` });
    }
  } catch (err) {
    console.error("Household instant apply failed", err);
  }

  if (instant) {
    await notifyAdminsWaiting(s, request, instant.applied, instant.waiting);
    return { mode: "instant", waiting: instant.waiting };
  }

  // Notify the admins; a failure here must not undo a successful submission.
  try {
    const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
    if (admins.length > 0) {
      const changes = await listChanges(request.id);
      const h = headers();
      const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      const { subject, html } = buildHouseholdSubmittedAdminEmail({
        householdName: request.householdName ?? "A household",
        submittedBy: s.name,
        changeCount: changes.length,
        hasNote: !!note.trim(),
        reviewUrl: `${proto}://${host}/settings/household-updates/${request.id}`,
      });
      for (const to of admins) await sendEmail({ to, fromName: CHURCH_NAME, subject, html });
    }
  } catch (err) {
    console.error("Household update admin notification failed", err);
  }
  return { mode: "review" };
}
