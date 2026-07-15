import { z } from "zod";

// Resend's hard cap is 40MB per email; kept well under that since every
// batch of a multi-batch send re-uploads the same attachments (lib/email.ts).
export const MAX_ATTACHMENTS_TOTAL_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_COUNT = 10;

// content is base64 (no "data:...;base64," prefix — the client strips it
// before sending). Decoded size is ~3/4 of the base64 string length.
const attachmentSchema = z.object({
  filename: z.string().trim().min(1, "Attachment needs a filename").max(255, "Filename too long"),
  content: z.string().min(1, "Attachment is empty"),
});

// Shared by both email schemas below: subject/body/attachments never differ
// between "email parents" and "email people" — only the recipient-filter
// fields do.
const baseEmailFields = {
  subject: z.string().trim().min(1, "Subject is required").max(200, "Too long"),
  bodyHtml: z.string().trim().min(1, "Message body is required").max(20000, "Too long"),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS_COUNT, "Too many attachments").optional(),
};

function attachmentsWithinLimit(data: { attachments?: { content: string }[] }): boolean {
  const totalBase64Chars = (data.attachments ?? []).reduce((sum, a) => sum + a.content.length, 0);
  return (totalBase64Chars * 3) / 4 <= MAX_ATTACHMENTS_TOTAL_BYTES;
}
const ATTACHMENTS_REFINE_OPTIONS = {
  message: "Attachments must total 10MB or less",
  path: ["attachments"],
};

// Mirrors the Children page's filter query params (searchChildren's
// SearchChildrenParams) so a send targets exactly the currently-filtered
// set — the server recomputes the recipient list from these filters rather
// than trusting a client-supplied address list.
export const emailParentsSchema = z
  .object({
    ...baseEmailFields,
    search: z.string().trim().max(200, "Too long").optional().or(z.literal("")),
    status: z.array(z.string()).optional(),
    campus: z.array(z.enum(["Arlington", "Leesburg"])).optional(),
    gradeFrom: z.number().int().optional(),
    gradeTo: z.number().int().optional(),
    memberType: z.enum(["Child", "Adult", "All"]).optional(),
  })
  .refine(attachmentsWithinLimit, ATTACHMENTS_REFINE_OPTIONS);

export type EmailParentsValues = z.infer<typeof emailParentsSchema>;

// Mirrors the People page's filter query params (searchProfiles's
// SearchProfilesParams) — same server-recomputes-recipients principle as
// emailParentsSchema, but recipients are the profiles' own emails, not a
// resolved parent contact.
export const emailPeopleSchema = z
  .object({
    ...baseEmailFields,
    search: z.string().trim().max(200, "Too long").optional().or(z.literal("")),
    status: z.array(z.string()).optional(),
    campus: z.array(z.enum(["Arlington", "Leesburg"])).optional(),
    gradeFrom: z.number().int().optional(),
    gradeTo: z.number().int().optional(),
  })
  .refine(attachmentsWithinLimit, ATTACHMENTS_REFINE_OPTIONS);

export type EmailPeopleValues = z.infer<typeof emailPeopleSchema>;
