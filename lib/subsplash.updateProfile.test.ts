import { describe, expect, it } from "vitest";
import { updateProfile } from "./subsplash";

// ADR-0020: care_notes moved off a plain top-level Subsplash Profile field
// onto a VOLUNTEERNOTES custom field. Mock mode mirrors the real dual-write
// (top-level Profile.care_notes for reads, plus a synced custom_fields
// entry for display parity — same pattern as directory_access/directory_role).
describe("updateProfile — care_notes via VOLUNTEERNOTES custom field (mock mode)", () => {
  it("updates an existing VOLUNTEERNOTES custom field entry alongside care_notes", async () => {
    const updated = await updateProfile("profile-lily-whitfield", {
      care_notes: "Updated note for testing.",
    });

    expect(updated.care_notes).toBe("Updated note for testing.");
    const notesField = updated.custom_fields?.find(
      (f) => f.label.trim().toLowerCase() === "volunteernotes"
    );
    expect(notesField?.value).toBe("Updated note for testing.");
  });

  it("adds a new VOLUNTEERNOTES custom field entry for a profile that didn't have one yet", async () => {
    const updated = await updateProfile("profile-rohan-anand", {
      care_notes: "First note.",
    });

    expect(updated.care_notes).toBe("First note.");
    const notesField = updated.custom_fields?.find(
      (f) => f.label.trim().toLowerCase() === "volunteernotes"
    );
    expect(notesField?.value).toBe("First note.");
    // The profile's other custom fields (e.g. Campus) are untouched.
    expect(updated.custom_fields?.some((f) => f.label.trim().toLowerCase() === "campus")).toBe(true);
  });
});
