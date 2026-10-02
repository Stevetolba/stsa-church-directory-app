import { Resend } from "resend";

// ADR-0014: lazy client, undefined when RESEND_API_KEY is unset (local dev,
// CI) — mirrors SUBSPLASH_USE_MOCK's mock-by-default approach so nobody
// accidentally emails real parents from a dev environment.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Resend caps recipients (to+cc+bcc combined) per send at 50 — confirmed via
// a real rejected send: a batch with a full 50-entry bcc list plus the
// mandatory "to" recipient below (51 combined) was refused for exceeding it.
// Reserve one slot for that "to" recipient so every batch's combined total
// (bcc + the always-present to) stays at or under the real cap.
const MAX_RECIPIENTS_PER_SEND = 50;
const MAX_BCC_PER_BATCH = MAX_RECIPIENTS_PER_SEND - 1;

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
  const batches = uniqueBcc.length > 0 ? chunk(uniqueBcc, MAX_BCC_PER_BATCH) : [[]];

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
    // send spans multiple batches (>49 recipients — MAX_BCC_PER_BATCH
    // already reserves this "to" slot out of Resend's 50-recipient combined
    // cap), EMAIL_FROM_ADDRESS gets one copy per batch rather than a single
    // merged copy — acceptable since most sends are well under that. The
    // same attachments are re-sent with every batch for the same reason.
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

// One message to one recipient, with no copy to the from address — unlike
// sendBulkEmail, which always addresses EMAIL_FROM_ADDRESS. Used for login
// codes, which must reach only the person signing in. With no RESEND_API_KEY
// (local dev) it logs the message, including the body, instead of sending.
export async function sendEmail({
  to,
  fromName,
  subject,
  html,
}: {
  to: string;
  fromName: string;
  subject: string;
  html: string;
}): Promise<void> {
  const from = `${fromName} <${getFromAddress()}>`;
  if (!resend) {
    console.log("[email:mock] would send", { from, to, subject, html });
    return;
  }
  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) throw new Error(error.message);
}

export interface BatchMessage {
  to: string;
  subject: string;
  html: string;
}

// Resend's batch endpoint takes at most 100 messages per call.
const MAX_BATCH = 100;

// Many personal, single-recipient messages in as few API calls as possible
// (training reminders, ADR-0026) — one request per 100 rather than one per
// person, which stays inside Resend's per-second rate limit. "permissive"
// validation reports a bad address on its own instead of failing the whole
// batch. Returns the indexes (into `messages`) that failed, with why.
export async function sendEmailBatch(
  messages: BatchMessage[],
  opts: { fromName: string; replyTo: string }
): Promise<{ failed: { index: number; message: string }[] }> {
  const from = `${opts.fromName} <${getFromAddress()}>`;
  if (!resend) {
    for (const m of messages) console.log("[email:mock] would send", { from, to: m.to, replyTo: opts.replyTo, subject: m.subject, html: m.html });
    return { failed: [] };
  }
  const failed: { index: number; message: string }[] = [];
  const batches = chunk(messages, MAX_BATCH);
  for (let b = 0; b < batches.length; b++) {
    const offset = b * MAX_BATCH;
    const { data, error } = await resend.batch.send(
      batches[b].map((m) => ({ from, to: m.to, replyTo: opts.replyTo, subject: m.subject, html: m.html })),
      { batchValidation: "permissive" }
    );
    if (error) {
      batches[b].forEach((_, i) => failed.push({ index: offset + i, message: error.message }));
      continue;
    }
    for (const e of data?.errors ?? []) failed.push({ index: offset + e.index, message: e.message });
  }
  return { failed };
}
