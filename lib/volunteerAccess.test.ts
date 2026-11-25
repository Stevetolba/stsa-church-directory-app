import { describe, expect, it } from "vitest";
import { applyLeadEdit, applyLeadRemoval, canManageVolunteer } from "./volunteerAccess";

describe("applyLeadEdit", () => {
  it("adds a volunteer to the lead's team and keeps their other teams", () => {
    expect(applyLeadEdit(["Worship"], ["Welcome"], ["Welcome"])).toEqual({ ok: true, teams: ["Worship", "Welcome"] });
  });

  it("lets a lead edit someone already on their team", () => {
    expect(applyLeadEdit(["Welcome", "Worship"], ["Welcome"], ["Welcome"])).toEqual({
      ok: true,
      teams: ["Worship", "Welcome"],
    });
  });

  it("rejects assigning a team the lead doesn't manage", () => {
    expect(applyLeadEdit([], ["Welcome"], ["Worship"])).toEqual({ ok: false, reason: "forbidden" });
    expect(applyLeadEdit([], ["Welcome"], ["Welcome", "Worship"])).toEqual({ ok: false, reason: "forbidden" });
  });

  it("rejects deselecting every team (that's a removal)", () => {
    expect(applyLeadEdit(["Welcome", "Worship"], ["Welcome"], [])).toEqual({ ok: false, reason: "no-team-selected" });
  });

  it("rejects editing someone on none of the lead's teams without adding them", () => {
    expect(applyLeadEdit(["Worship"], ["Welcome"], [])).toEqual({ ok: false, reason: "forbidden" });
  });

  it("works for a lead of several teams", () => {
    expect(applyLeadEdit(["Welcome", "Choir"], ["Welcome", "Worship"], ["Worship"])).toEqual({
      ok: true,
      teams: ["Choir", "Worship"],
    });
  });
});

describe("applyLeadRemoval", () => {
  it("removes only the lead's team and keeps the volunteer on the others", () => {
    expect(applyLeadRemoval(["Welcome", "Worship"], ["Welcome"])).toEqual({
      ok: true,
      teams: ["Worship"],
      clearRoles: false,
    });
  });

  it("clears roles when it was their only team", () => {
    expect(applyLeadRemoval(["Welcome"], ["Welcome"])).toEqual({ ok: true, teams: [], clearRoles: true });
  });

  it("rejects removing someone who isn't on the lead's team", () => {
    expect(applyLeadRemoval(["Worship"], ["Welcome"])).toEqual({ ok: false, reason: "forbidden" });
  });
});

describe("canManageVolunteer", () => {
  it("admin manages everyone", () => {
    expect(canManageVolunteer({ canManage: true, teams: null }, ["Anything"])).toBe(true);
  });
  it("lead manages only their team's volunteers", () => {
    const scope = { canManage: true, teams: ["Welcome"] };
    expect(canManageVolunteer(scope, ["Welcome", "Worship"])).toBe(true);
    expect(canManageVolunteer(scope, ["Worship"])).toBe(false);
  });
  it("read-only scope manages nobody", () => {
    expect(canManageVolunteer({ canManage: false, teams: [] }, ["Welcome"])).toBe(false);
  });
});
