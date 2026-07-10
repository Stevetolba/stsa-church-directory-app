import { z } from "zod";

export const updateHouseholdSchema = z.object({
  address: z.string().trim().max(255, "Too long").optional().or(z.literal("")),
});

export type UpdateHouseholdValues = z.infer<typeof updateHouseholdSchema>;
