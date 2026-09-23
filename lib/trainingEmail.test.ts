import { describe, expect, it } from "vitest";
import { buildInviteEmail } from "./trainingEmail";

describe("buildInviteEmail", () => {
  const email = buildInviteEmail({
    courseTitles: ["Ancient Faith Class 101"],
    trainingUrl: "https://app.example.org/training",
    logoUrl: "https://app.example.org/stsa-logo.png",
    invitedByName: "Steve Tolba",
  });
  it("identifies the course as an STSA Church course", () => {
    expect(email.subject).toBe("STSA Church training: you're invited to Ancient Faith Class 101");
    expect(email.html).toContain("This is an STSA Church training course.");
    expect(email.html).toContain("An Ancient Faith in a modern world");
    expect(email.html).toContain('src="https://app.example.org/stsa-logo.png"');
    expect(email.html).toContain('href="https://www.stsa.church"');
    expect(email.html).toContain("www.stsa.church");
    expect(email.html).toContain("invited by Steve Tolba to take a course with STSA Church");
    expect(email.html).toContain('href="https://app.example.org/training"');
  });
  it("uses plural wording and escapes HTML for several courses", () => {
    const multi = buildInviteEmail({ courseTitles: ["A <b>", "B"], trainingUrl: "https://x.test/training", logoUrl: "https://x.test/stsa-logo.png", invitedByName: "S" });
    expect(multi.html).toContain("these courses");
    expect(multi.html).toContain("A &lt;b&gt;");
    expect(multi.html).not.toContain("<b>");
  });
});
