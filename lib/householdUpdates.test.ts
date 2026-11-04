import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAcceptedChanges,
  getOpenRequest,
  getOrCreateOpenRequest,
  getRequest,
  listChanges,
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
