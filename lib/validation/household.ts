import { z } from "zod";

// Structured address, mapped to Subsplash's _embedded.address on PATCH.
// Each part is optional/blank-allowed so an admin can fill in whichever
// fields they have. Lengths are conservative relative to openapi.yaml's
// Address schema (which sets no explicit maxLengths).
const addressPart = (max: number) => z.string().trim().max(max, "Too long").optional().or(z.literal(""));

export const updateHouseholdSchema = z.object({
  street: addressPart(255),
  city: addressPart(120),
  state: addressPart(120),
  postal_code: addressPart(20),
});

export type UpdateHouseholdValues = z.infer<typeof updateHouseholdSchema>;
