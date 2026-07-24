import { describe, expect, it } from "vitest";
import { sendBulkEmail } from "./email";

// No RESEND_API_KEY in the test environment, so these exercise the mock
// (console-log) branch — sufficient to lock in the batch-count math without
// needing a real Resend call. This specifically guards the fix for a real
// rejected send: batching bcc at 50 (the full combined recipient cap) left
// no room for the mandatory "to" recipient every send also includes, so a
// "full" batch was actually 51 combined recipients — one over Resend's real
// limit. The threshold for a second batch is now 50 total bcc recipients
// (49 per batch), not 51.
function recipients(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `parent${i}@example.org`);
}

describe("sendBulkEmail batching", () => {
  it("sends a single batch for 0 recipients (the from-address-only copy)", async () => {
    const { batches } = await sendBulkEmail({
      bcc: [],
      fromName: "Church Office",
      replyTo: "staff@example.org",
      subject: "Test",
      html: "<p>Test</p>",
    });
    expect(batches).toBe(1);
  });

  it("sends a single batch for 49 recipients (fits alongside the mandatory to)", async () => {
    const { batches } = await sendBulkEmail({
      bcc: recipients(49),
      fromName: "Church Office",
      replyTo: "staff@example.org",
      subject: "Test",
      html: "<p>Test</p>",
    });
    expect(batches).toBe(1);
  });

  it("splits into two batches at 50 recipients — the exact count that previously triggered Resend's combined-recipient rejection", async () => {
    const { batches } = await sendBulkEmail({
      bcc: recipients(50),
      fromName: "Church Office",
      replyTo: "staff@example.org",
      subject: "Test",
      html: "<p>Test</p>",
    });
    expect(batches).toBe(2);
  });

  it("splits into three batches at 99 recipients (49 + 49 + 1)", async () => {
    const { batches } = await sendBulkEmail({
      bcc: recipients(99),
      fromName: "Church Office",
      replyTo: "staff@example.org",
      subject: "Test",
      html: "<p>Test</p>",
    });
    expect(batches).toBe(3);
  });
});
