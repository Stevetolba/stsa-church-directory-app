import { Resend } from "resend";

// ADR-0014: lazy client, undefined when RESEND_API_KEY is unset (local dev,
// CI) — mirrors SUBSPLASH_USE_MOCK's mock-by-default approach so nobody
// accidentally emails real parents from a dev environment.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Resend caps recipients (to+cc+bcc combined) per send — batch to stay under it.
const MAX_RECIPIENTS_PER_SEND = 50;

// Shared with app/(dashboard)/children/page.tsx, which needs the real From
// address to show the sender an accurate preview of what recipients will see.
export function getFromAddress(): string {
  return process.env.EMAIL_FROM_ADDRESS ?? "notifications@example.org";
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export interface EmailAttachment {
  filename: string;
  // Base64-encoded, no "data:...;base64," prefix.
  content: string;
}

export interface SendBulkEmailParams {
  // Real recipients go in BCC so no parent's address is exposed to another.
  bcc: string[];
  fromName: string;
  replyTo: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export async function sendBulkEmail({
  bcc,
  fromName,
  replyTo,
  subject,
  html,
  attachments,
}: SendBulkEmailParams): Promise<{ batches: number }> {
  const fromAddress = getFromAddress();
  const from = `${fromName} <${fromAddress}>`;
  // fromAddress is already the "to" recipient on every send (below) — drop
  // it from bcc too so a parent whose email happens to match it (e.g. a
  // staff member emailing a group they're also the parent contact for)
  // doesn't appear as the same address in two recipient fields, which
  // Resend rejects.
  const uniqueBcc = bcc.filter((email) => email.toLowerCase() !== fromAddress.toLowerCase());
  // Always at least one batch (even an empty one) — the "to: fromAddress"
  // copy below must still go out when every real recipient turned out to be
  // fromAddress itself and got filtered above.
  const batches = uniqueBcc.length > 0 ? chunk(uniqueBcc, MAX_RECIPIENTS_PER_SEND) : [[]];

  const attachmentCount = attachments?.length ?? 0;

  if (!resend) {
    for (const batch of batches) {
      console.log("[email:mock] would send", {
        from,
        to: fromAddress,
        bcc: batch,
        replyTo,
        subject,
        attachments: attachmentCount,
      });
    }
    return { batches: batches.length };
  }

  for (const batch of batches) {
    // The from address is deliberately also the "to" recipient: Resend
    // requires a non-empty "to", and addressing it to EMAIL_FROM_ADDRESS
    // means every send always lands a copy there (a record of what went
    // out) without exposing it to parents, who only appear in bcc. If a
    // send spans multiple batches (>50 recipients), EMAIL_FROM_ADDRESS gets
    // one copy per batch rather than a single merged copy — acceptable
    // since most sends are well under the 50-recipient batch size. The same
    // attachments are re-sent with every batch for the same reason.
    const { error } = await resend.emails.send({
      from,
      to: fromAddress,
      ...(batch.length > 0 ? { bcc: batch } : {}),
      replyTo,
      subject,
      html,
      ...(attachmentCount > 0 ? { attachments } : {}),
    });
    if (error) {
      throw new Error(error.message);
    }
  }

  return { batches: batches.length };
}
