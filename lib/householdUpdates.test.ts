import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAcceptedChanges,
  autoApplySubmittedRequest,
  getOpenRequest,
  getOrCreateOpenRequest,
  getRequest,
  listChanges,
  markNewMemberAddedManually,
  rejectRequest,
  replaceSubjectChanges,
  reviewRequest,
  submitRequest,
  type ApplyDeps,
} from "./householdUpdates";

const who = { householdId: "h1", householdName: "Lee Family", profileId: "p-parent", email: "mom@example.org" };

function deps(over: Partial<ApplyDeps> = {}): ApplyDeps {
  return {
    updateProfile: vi.fn(async () => ({})),
    updateHousehold: vi.fn(async () => ({})),
    createProfile: vi.fn(async () => ({ id: "new-profile" })),
    ...over,
  };
}

async function seed() {
  const req = await getOrCreateOpenRequest(who);
  await replaceSubjectChanges(req.id, { type: "profile", id: "kid1", label: "Sam Lee" }, [
    { field: "first_name", oldValue: "Sam", newValue: "Samuel" },
    { field: "graduation_year", oldValue: "2031", newValue: "2033" },
  ]);
  await replaceSubjectChanges(req.id, { type: "household", id: "h1", label: "Household address" }, [
    { field: "street", oldValue: "1 Main St", newValue: "2 Oak Ave" },
  ]);
  await submitRequest(req.id, "moved last month");
  return req;
}

beforeEach(() => {
  globalThis.__householdUpdateStore = undefined;
});

describe("open request", () => {
  it("keeps one open request per household", async () => {
    const a = await getOrCreateOpenRequest(who);
    const b = await getOrCreateOpenRequest({ ...who, profileId: "p-other", email: "dad@example.org" });
    expect(b.id).toBe(a.id);
    expect((await getOpenRequest("h1"))?.status).toBe("draft");
    expect(await getOpenRequest("h2")).toBeNull();
  });

  it("clears a subject when given no changes", async () => {
    const req = await getOrCreateOpenRequest(who);
    const subject = { type: "profile" as const, id: "kid1", label: "Sam" };
    await replaceSubjectChanges(req.id, subject, [{ field: "first_name", oldValue: "Sam", newValue: "S" }]);
    expect(await listChanges(req.id)).toHaveLength(1);
    await replaceSubjectChanges(req.id, subject, []);
    expect(await listChanges(req.id)).toHaveLength(0);
  });

  it("won't submit an empty request", async () => {
    const req = await getOrCreateOpenRequest(who);
    await expect(submitRequest(req.id, null)).rejects.toThrow();
  });

  it("can still be edited while pending, but not once decided", async () => {
    const req = await seed();
    await replaceSubjectChanges(req.id, { type: "profile", id: "kid1", label: "Sam" }, []);
    await rejectRequest(req.id, "no", "admin@x.org");
    await expect(replaceSubjectChanges(req.id, { type: "profile", id: "kid1", label: "Sam" }, [])).rejects.toThrow();
  });
});

describe("reviewRequest", () => {
  it("writes only the accepted changes", async () => {
    const req = await seed();
    const changes = await listChanges(req.id);
    const firstName = changes.find((c) => c.field === "first_name")!;
    const d = deps();
    const status = await reviewRequest(req.id, [firstName.id], "admin@x.org", d);

    expect(status).toBe("partially_applied");
    expect(d.updateProfile).toHaveBeenCalledTimes(1);
    expect(d.updateProfile).toHaveBeenCalledWith("kid1", { first_name: "Samuel" });
    expect(d.updateHousehold).not.toHaveBeenCalled();
    const after = await listChanges(req.id);
    expect(after.find((c) => c.id === firstName.id)).toMatchObject({ decision: "accepted" });
    expect(after.filter((c) => c.decision === "rejected")).toHaveLength(2);
    expect((await getRequest(req.id))?.reviewedByEmail).toBe("admin@x.org");
  });

  it("converts graduation_year to a number and writes the address together", async () => {
    const req = await seed();
    const ids = (await listChanges(req.id)).map((c) => c.id);
    const d = deps();
    expect(await reviewRequest(req.id, ids, "admin@x.org", d)).toBe("applied");
    expect(d.updateProfile).toHaveBeenCalledWith("kid1", { first_name: "Samuel", graduation_year: 2033 });
    expect(d.updateHousehold).toHaveBeenCalledWith("h1", { street: "2 Oak Ave" });
  });

  it("is rejected when nothing is accepted", async () => {
    const req = await seed();
    const d = deps();
    expect(await reviewRequest(req.id, [], "admin@x.org", d)).toBe("rejected");
    expect(d.updateProfile).not.toHaveBeenCalled();
  });

  it("keeps the request pending when a write fails, then retries only the failure", async () => {
    const req = await seed();
    const ids = (await listChanges(req.id)).map((c) => c.id);
    const failing = deps({ updateHousehold: vi.fn(async () => { throw new Error("Subsplash API error: 500"); }) });
    expect(await reviewRequest(req.id, ids, "admin@x.org", failing)).toBe("pending");
    const mid = await listChanges(req.id);
    expect(mid.find((c) => c.field === "street")?.applyError).toContain("500");
    expect(mid.find((c) => c.field === "first_name")?.appliedAt).toBeTruthy();

    const ok = deps();
    await applyAcceptedChanges(req.id, ok);
    expect(ok.updateProfile).not.toHaveBeenCalled(); // already applied
    expect(ok.updateHousehold).toHaveBeenCalledTimes(1);
    expect((await getRequest(req.id))?.status).toBe("applied");
  });

  it("cannot review a request twice", async () => {
    const req = await seed();
    await reviewRequest(req.id, [], "admin@x.org", deps());
    await expect(reviewRequest(req.id, [], "admin@x.org", deps())).rejects.toThrow();
  });
});

describe("new members", () => {
  async function seedNew() {
    const req = await getOrCreateOpenRequest(who);
    await replaceSubjectChanges(req.id, { type: "new_member", id: "new-1", label: "Eve Lee" }, [
      { field: "first_name", oldValue: null, newValue: "Eve" },
      { field: "last_name", oldValue: null, newValue: "Lee" },
      { field: "household_role", oldValue: null, newValue: "child" },
      { field: "graduation_year", oldValue: null, newValue: "2035" },
    ]);
    await submitRequest(req.id, null);
    return req;
  }

  it("accepting one field accepts the whole person, and creates one profile", async () => {
    const req = await seedNew();
    const one = (await listChanges(req.id)).find((c) => c.field === "first_name")!;
    const d = deps();
    expect(await reviewRequest(req.id, [one.id], "admin@x.org", d)).toBe("applied");
    expect(d.createProfile).toHaveBeenCalledTimes(1);
    expect(d.createProfile).toHaveBeenCalledWith({
      first_name: "Eve", last_name: "Lee", household_id: "h1", household_role: "child",
      date_of_birth: undefined, graduation_year: 2035,
    });
    expect((await listChanges(req.id)).every((c) => c.createdProfileId === "new-profile")).toBe(true);
  });

  it("writes a new member's phone, address and notes with a follow-up update", async () => {
    const req = await getOrCreateOpenRequest(who);
    await replaceSubjectChanges(req.id, { type: "new_member", id: "new-1", label: "Eve Lee" }, [
      { field: "first_name", oldValue: null, newValue: "Eve" },
      { field: "last_name", oldValue: null, newValue: "Lee" },
      { field: "household_role", oldValue: null, newValue: "child" },
      { field: "graduation_year", oldValue: null, newValue: "2035" },
      { field: "phone_number", oldValue: null, newValue: "5551112222" },
      { field: "home_street", oldValue: null, newValue: "9 Elm" },
      { field: "home_city", oldValue: null, newValue: "Dallas" },
      { field: "allergy_notes", oldValue: null, newValue: "Peanuts" },
    ]);
    await submitRequest(req.id, null);
    const ids = (await listChanges(req.id)).map((c) => c.id);
    const d = deps();
    expect(await reviewRequest(req.id, ids, "admin@x.org", d)).toBe("applied");
    expect(d.createProfile).toHaveBeenCalledTimes(1);
    expect(d.updateProfile).toHaveBeenCalledWith("new-profile", { phone_number: "5551112222", allergy_notes: "Peanuts" });
    expect(d.updateProfile).toHaveBeenCalledWith("new-profile", { address_parts: { street: "9 Elm", city: "Dallas" } });
  });

  it("sends a new member's gender and email when creating the profile", async () => {
    const req = await getOrCreateOpenRequest(who);
    await replaceSubjectChanges(req.id, { type: "new_member", id: "new-1", label: "Eve Lee" }, [
      { field: "first_name", oldValue: null, newValue: "Eve" },
      { field: "last_name", oldValue: null, newValue: "Lee" },
      { field: "household_role", oldValue: null, newValue: "child" },
      { field: "gender", oldValue: null, newValue: "female" },
      { field: "email", oldValue: null, newValue: "eve@x.org" },
    ]);
    await submitRequest(req.id, null);
    const ids = (await listChanges(req.id)).map((c) => c.id);
    const d = deps();
    expect(await reviewRequest(req.id, ids, "admin@x.org", d)).toBe("applied");
    expect(d.createProfile).toHaveBeenCalledWith(expect.objectContaining({ gender: "female", email: "eve@x.org" }));
    expect(d.updateProfile).not.toHaveBeenCalled();
  });

  it("retries only the extras, never creating the person twice", async () => {
    const req = await getOrCreateOpenRequest(who);
    await replaceSubjectChanges(req.id, { type: "new_member", id: "new-1", label: "Eve Lee" }, [
      { field: "first_name", oldValue: null, newValue: "Eve" },
      { field: "last_name", oldValue: null, newValue: "Lee" },
      { field: "household_role", oldValue: null, newValue: "child" },
      { field: "graduation_year", oldValue: null, newValue: "2035" },
      { field: "care_notes", oldValue: null, newValue: "Nightlight" },
    ]);
    await submitRequest(req.id, null);
    const ids = (await listChanges(req.id)).map((c) => c.id);
    const flaky = deps({ updateProfile: vi.fn(async () => { throw new Error("422"); }) });
    expect(await reviewRequest(req.id, ids, "admin@x.org", flaky)).toBe("pending");
    expect(flaky.createProfile).toHaveBeenCalledTimes(1);
    const ok = deps();
    await applyAcceptedChanges(req.id, ok);
    expect(ok.createProfile).not.toHaveBeenCalled();
    expect(ok.updateProfile).toHaveBeenCalledWith("new-profile", { care_notes: "Nightlight" });
    expect((await getRequest(req.id))?.status).toBe("applied");
  });

  it("sends a changed home address merged with the current one", async () => {
    const req = await getOrCreateOpenRequest(who);
    await replaceSubjectChanges(req.id, { type: "profile", id: "mom", label: "Ann Lee" }, [
      { field: "home_city", oldValue: "Austin", newValue: "Round Rock" },
      { field: "phone_number", oldValue: null, newValue: "5551112222" },
    ]);
    await submitRequest(req.id, null);
    const ids = (await listChanges(req.id)).map((c) => c.id);
    const d = deps({ getProfileAddress: vi.fn(async () => ({ street: "1 Main St", city: "Austin", state: "TX", postal_code: "78701" })) });
    await reviewRequest(req.id, ids, "admin@x.org", d);
    expect(d.updateProfile).toHaveBeenCalledWith("mom", { phone_number: "5551112222" });
    expect(d.updateProfile).toHaveBeenCalledWith("mom", {
      address_parts: { street: "1 Main St", city: "Round Rock", state: "TX", postal_code: "78701" },
    });
  });

  it("reports a refused address on its own rows without blocking the rest of the person", async () => {
    const req = await getOrCreateOpenRequest(who);
    await replaceSubjectChanges(req.id, { type: "profile", id: "mom", label: "Ann Lee" }, [
      { field: "phone_number", oldValue: null, newValue: "5551112222" },
      { field: "home_street", oldValue: null, newValue: "9 Elm" },
      { field: "care_notes", oldValue: null, newValue: "Nightlight" },
    ]);
    await submitRequest(req.id, null);
    const ids = (await listChanges(req.id)).map((c) => c.id);
    const d = deps({
      updateProfile: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
        if ("address_parts" in patch) throw new Error("Subsplash API error: 400 — bad address");
        return {};
      }),
    });
    expect(await reviewRequest(req.id, ids, "admin@x.org", d)).toBe("pending");
    const rows = await listChanges(req.id);
    const by = (f: string) => rows.find((c) => c.field === f)!;
    expect(by("phone_number").appliedAt).not.toBeNull();
    expect(by("care_notes").appliedAt).not.toBeNull();
    expect(by("home_street").appliedAt).toBeNull();
    expect(by("home_street").applyError).toContain("bad address");
  });

  it("can be closed out as added manually when Subsplash refuses to create the person", async () => {
    const req = await seedNew();
    const ids = (await listChanges(req.id)).map((c) => c.id);
    const refused = deps({ createProfile: vi.fn(async () => { throw new Error("403"); }) });
    expect(await reviewRequest(req.id, ids, "admin@x.org", refused)).toBe("pending");
    expect(await markNewMemberAddedManually(req.id, "new-1", "admin@x.org")).toBe("applied");
    const rows = await listChanges(req.id);
    expect(rows.every((c) => c.appliedAt && c.decision === "accepted")).toBe(true);
    expect(rows[0].applyError).toContain("manually");
    // Nothing further is written, and a retry has nothing left to do.
    expect(refused.createProfile).toHaveBeenCalledTimes(1);
    await expect(markNewMemberAddedManually(req.id, "new-1", "admin@x.org")).rejects.toThrow();
  });

  it("only closes out the person asked for", async () => {
    const req = await seedNew();
    await expect(markNewMemberAddedManually(req.id, "new-9", "admin@x.org")).rejects.toThrow("wasn't found");
  });

  it("does not create a duplicate when retrying after another failure", async () => {
    const req = await seedNew();
    const ids = (await listChanges(req.id)).map((c) => c.id);
    const failing = deps({ createProfile: vi.fn(async () => { throw new Error("409"); }) });
    expect(await reviewRequest(req.id, ids, "admin@x.org", failing)).toBe("pending");
    const ok = deps();
    await applyAcceptedChanges(req.id, ok);
    await applyAcceptedChanges(req.id, ok).catch(() => {}); // already finished
    expect(ok.createProfile).toHaveBeenCalledTimes(1);
  });
});

describe("instant apply (ADR-0031)", () => {
  const live = {
    id: "h1",
    name: "Lee Family",
    address_parts: { street: "1 Main St" },
    members: [{ id: "kid1", first_name: "Sam", last_name: "Lee", graduation_year: 2031 }],
  } as never;
  const withLive = (household: unknown = live, over: Partial<ApplyDeps> = {}) =>
    deps({ getHousehold: vi.fn(async () => household as never), ...over });

  it("writes people and address rows and ends applied, closing the request", async () => {
    const req = await seed();
    const d = withLive();
    const r = await autoApplySubmittedRequest(req.id, d);
    expect(r).toMatchObject({ status: "applied", waiting: 0 });
    expect(d.updateProfile).toHaveBeenCalledWith("kid1", expect.objectContaining({ first_name: "Samuel" }));
    expect(d.updateHousehold).toHaveBeenCalledWith("h1", { street: "2 Oak Ave" });
    expect((await getRequest(req.id))?.reviewedByEmail).toBe("auto");
    expect(await getOpenRequest("h1")).toBeNull();
  });

  it("leaves a new member for an admin and does not create them", async () => {
    const req = await getOrCreateOpenRequest(who);
    await replaceSubjectChanges(req.id, { type: "profile", id: "kid1", label: "Sam" }, [
      { field: "first_name", oldValue: "Sam", newValue: "Samuel" },
    ]);
    await replaceSubjectChanges(req.id, { type: "new_member", id: "new-1", label: "Eve Lee" }, [
      { field: "first_name", oldValue: null, newValue: "Eve" },
      { field: "last_name", oldValue: null, newValue: "Lee" },
      { field: "household_role", oldValue: null, newValue: "child" },
    ]);
    await submitRequest(req.id, null);
    const d = withLive();
    const r = await autoApplySubmittedRequest(req.id, d);
    expect(r).toMatchObject({ status: "pending", applied: 1, waiting: 3 });
    expect(d.createProfile).not.toHaveBeenCalled();
    expect((await getOpenRequest("h1"))?.id).toBe(req.id);
  });

  it("holds a row whose live value moved since the parent saw it", async () => {
    const req = await seed();
    const moved = { ...(live as object), members: [{ id: "kid1", first_name: "Sammy", last_name: "Lee", graduation_year: 2031 }] };
    const d = withLive(moved);
    const r = await autoApplySubmittedRequest(req.id, d);
    // first_name drifted (Sam -> Sammy); grade and address still apply.
    expect(r.status).toBe("pending");
    expect(r.waiting).toBe(1);
    expect(d.updateProfile).toHaveBeenCalledWith("kid1", { graduation_year: 2033 });
  });

  it("holds everything when the live household can't be read", async () => {
    const req = await seed();
    const d = withLive(null);
    const r = await autoApplySubmittedRequest(req.id, d);
    expect(r).toMatchObject({ status: "pending", applied: 0 });
    expect(d.updateProfile).not.toHaveBeenCalled();
  });

  it("keeps a failed write pending so an admin can retry it", async () => {
    const req = await seed();
    const d = withLive(live, { updateHousehold: vi.fn(async () => { throw new Error("boom"); }) });
    const r = await autoApplySubmittedRequest(req.id, d);
    expect(r.status).toBe("pending");
    const failed = (await listChanges(req.id)).filter((c) => c.applyError);
    expect(failed).toHaveLength(1);
    const retry = await reviewRequest(req.id, (await listChanges(req.id)).map((c) => c.id), "admin@x.org", deps());
    expect(retry).toBe("applied");
  });

  it("starts a fresh request for the next edit after an applied one", async () => {
    const req = await seed();
    await autoApplySubmittedRequest(req.id, withLive());
    const next = await getOrCreateOpenRequest(who);
    expect(next.id).not.toBe(req.id);
  });

  it("keeps already-applied rows when the parent edits again while the request is open", async () => {
    const req = await getOrCreateOpenRequest(who);
    await replaceSubjectChanges(req.id, { type: "profile", id: "kid1", label: "Sam" }, [
      { field: "first_name", oldValue: "Sam", newValue: "Samuel" },
    ]);
    await replaceSubjectChanges(req.id, { type: "new_member", id: "new-1", label: "Eve" }, [
      { field: "first_name", oldValue: null, newValue: "Eve" },
      { field: "last_name", oldValue: null, newValue: "Lee" },
      { field: "household_role", oldValue: null, newValue: "child" },
    ]);
    await submitRequest(req.id, null);
    await autoApplySubmittedRequest(req.id, withLive());
    await replaceSubjectChanges(req.id, { type: "profile", id: "kid1", label: "Sam" }, [
      { field: "last_name", oldValue: "Lee", newValue: "Leigh" },
    ]);
    const fields = (await listChanges(req.id)).filter((c) => c.subjectId === "kid1").map((c) => c.field).sort();
    expect(fields).toEqual(["first_name", "last_name"]);
  });
});
