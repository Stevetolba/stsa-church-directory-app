export type MemberStatus = "Member" | "Regular Attendee" | "Visitor";

export type Campus = "Arlington" | "Leesburg";

export interface CustomField {
  id: string;
  label: string;
  value: string;
}

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  emails?: string[];
  phone_number?: string;
  phones?: string[];
  date_of_birth?: string;
  gender?: string;
  marital_status?: string;
  household_id?: string;
  household_name?: string;
  household_role?: string;
  status: MemberStatus;
  campus?: Campus;
  baptism_date?: string;
  photo_url?: string;
  custom_fields?: CustomField[];
  created_at: string;
  updated_at: string;
}
