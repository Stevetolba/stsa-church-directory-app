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
  campus: z.enum(["Arlington", "Leesburg"]),
});

export type EditProfileValues = z.infer<typeof editProfileSchema>;
