import type { Campus, MemberStatus } from "./profile";

// The trimmed shape the Volunteers roster API returns — only what the roster
// table and CSV export need, so a Team Lead (read-only) never receives full
// profile PII like date of birth or address.
export interface VolunteerRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
  status: MemberStatus;
  campuses: Campus[];
  teams: string[];
  ministry_roles: string[];
}

export interface VolunteerListResponse {
  volunteers: VolunteerRow[];
  total: number;
}

export interface VolunteerOptions {
  teams: string[];
  roles: string[];
  // Teams the caller may assign: null = every team (admin), [] = read-only.
  manageableTeams: string[] | null;
}
