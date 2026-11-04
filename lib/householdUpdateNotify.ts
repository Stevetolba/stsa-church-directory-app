import { sendEmail } from "./email";
import { buildHouseholdReviewedEmail } from "./householdUpdateEmail";
import type { UpdateRequest } from "./householdUpdates";
import { CHURCH_NAME } from "./trainingEmail";

// Tells the household how their update turned out. Best-effort: a mail
// failure must never undo or block a completed review.
export async function notifyHouseholdOfOutcome(request: UpdateRequest): Promise<void> {
  if (request.status !== "applied" && request.status !== "partially_applied" && request.status !== "rejected") return;
  try {
    const { subject, html } = buildHouseholdReviewedEmail({
      householdName: request.householdName ?? "your household",
      outcome: request.status,
      reason: request.rejectionReason,
    });
    await sendEmail({ to: request.submittedByEmail, fromName: CHURCH_NAME, subject, html });
  } catch (err) {
    console.error("Household update outcome email failed", err);
  }
}
