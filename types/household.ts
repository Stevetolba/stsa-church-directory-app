import type { Profile } from "./profile";

// Structured address, mirroring Subsplash's _embedded.address
// (openapi.yaml → Address). `Household.address` remains the derived
// single-line display string; `address_parts` is what edit forms bind to and
// what PATCH sends back.
export interface HouseholdAddress {
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
}

export interface Household {
  id: string;
  name: string;
  primary_email?: string;
  primary_phone?: string;
  address?: string;
  address_parts?: HouseholdAddress;
  status?: string;
  members?: Profile[];
  created_at: string;
  updated_at: string;
}
