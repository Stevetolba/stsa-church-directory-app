import { z } from "zod";

// Field lengths mirror openapi.yaml's Profile schema (first_name/last_name
// maxLength 35, email maxLength 256). Membership status is intentionally
// excluded — see ADR-0007.
export const editProfileSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(35, "Too long"),
  last_name: z.string().trim().min(1, "Last name is required").max(35, "Too long"),
  email: z.email("Enter a valid email address").max(256, "Too long"),
  phone_number: z
    .string()
    .trim()
    .max(20, "Too long")
    .optional()
    .or(z.literal("")),
  // Optional: the edit form only includes campus in the PATCH body when it
  // actually changed (real-mode campus updates aren't implemented yet —
  // see updateProfile), so omitting it must still validate.
  campus: z.enum(["Arlington", "Leesburg"]).optional(),
  // Free-text safety fields (ADR-0012). maxLength 1500 mirrors the API's
  // Profile schema. Must be listed here — the PATCH route does
  // editProfileSchema.safeParse(body), and Zod strips keys it doesn't know,
  // so omitting these would silently drop them from the update.
  allergy_notes: z.string().trim().max(1500, "Too long").optional().or(z.literal("")),
  care_notes: z.string().trim().max(1500, "Too long").optional().or(z.literal("")),
});

export type EditProfileValues = z.infer<typeof editProfileSchema>;
