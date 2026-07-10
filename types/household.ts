import type { Profile } from "./profile";

export interface Household {
  id: string;
  name: string;
  primary_email?: string;
  primary_phone?: string;
  address?: string;
  status?: string;
  members?: Profile[];
  created_at: string;
  updated_at: string;
}
