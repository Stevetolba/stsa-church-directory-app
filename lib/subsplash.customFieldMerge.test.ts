import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Subsplash treats a PATCH's custom_fields as all-or-nothing, so every write
// must resend the profile's other fields. These tests pin that behaviour.
const PROFILE = {
  id: "p1",
  custom_fields: [
    {
      custom_field_definition: { id: "d-campus", name: "Campus", revision_id: "r-campus" },
      value: { choices: [{ id: "c-leesburg", name: "Leesburg" }] },
    },
    {
      custom_field_definition: { id: "d-min", name: "Ministry", revision_id: "r-min" },
      value: { choices: [{ id: "c-conn", name: "Connection Team" }] },
    },
    {
      custom_field_definition: { id: "d-role", name: "Ministry Role", revision_id: "r-role" },
      value: { choices: [{ id: "c-vol", name: "Volunteer" }] },
    },
    {
      custom_field_definition: { id: "d-notes", name: "Notes", revision_id: "r-notes" },
      value: {}, // unset — can't be sent back, Subsplash rejects empty values
    },
  ],
};

async function loadModule() {
  vi.resetModules();
  vi.stubEnv("SUBSPLASH_ORG_KEY", "ORG");
  vi.stubEnv("SUBSPLASH_BASE_URL", "https://subsplash.test");
  vi.stubEnv("SUBSPLASH_CLIENT_ID", "id");
  vi.stubEnv("SUBSPLASH_CLIENT_SECRET", "secret");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = String(url).includes("/tokens/") ? { access_token: "t", expires_in: 3600 } : PROFILE;
      return new Response(JSON.stringify(body), { status: 200 });
    })
  );
  return import("./subsplash");
}

describe("mergeCustomFieldInputs", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps the other fields when changing one", async () => {
    const { mergeCustomFieldInputs } = await loadModule();
    const merged = await mergeCustomFieldInputs("p1", [
      { custom_field_definition: { id: "d-min", revision_id: "r-min" }, value: { choices: [{ id: "c-new" }] } },
    ]);
    const byId = Object.fromEntries(merged.map((m) => [m.custom_field_definition.id, m.value]));
    expect(byId["d-min"]).toEqual({ choices: [{ id: "c-new" }] });
    expect(byId["d-campus"]).toEqual({ choices: [{ id: "c-leesburg" }] });
    expect(byId["d-role"]).toEqual({ choices: [{ id: "c-vol" }] });
    // Unset fields are dropped rather than sent back empty.
    expect(byId["d-notes"]).toBeUndefined();
  });

  it("removes a cleared field and keeps the rest", async () => {
    const { mergeCustomFieldInputs } = await loadModule();
    const merged = await mergeCustomFieldInputs("p1", [
      { custom_field_definition: { id: "d-min" }, clear: true },
      { custom_field_definition: { id: "d-role" }, clear: true },
    ]);
    expect(merged.map((m) => m.custom_field_definition.id)).toEqual(["d-campus"]);
  });
});
