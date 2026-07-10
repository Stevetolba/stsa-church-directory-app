// Server only — ADR-0002. Roles live here, not in any external token.

import type { Role } from "@/types/auth";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function resolveRole(email: string): Role {
  return ADMIN_EMAILS.includes(email.toLowerCase()) ? "admin" : "staff";
}
