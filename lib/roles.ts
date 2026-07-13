// Server only — ADR-0002. Roles live here, not in any external token.
// ADR-0010: a third role, "volunteer", covers personal-Google-account
// sign-ins authorized via Subsplash (lib/auth.ts's signIn callback already
// confirmed access before this ever runs) — anyone not on the church
// Workspace domain and not an admin falls here.

import type { Role } from "@/types/auth";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const WORKSPACE_DOMAIN = process.env.CHURCH_GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase();

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

function isWorkspaceEmail(email: string): boolean {
  return !!WORKSPACE_DOMAIN && email.toLowerCase().endsWith(`@${WORKSPACE_DOMAIN}`);
}

// ADR-0010: three tiers. Admins (ADMIN_EMAILS) can write; workspace-domain
// staff and personal-email volunteers are both read-only, distinguished so
// the UI can label them and so volunteers could be restricted further later.
// This only assigns a role to an already-authorized user — the signIn gate
// (lib/auth.ts) decides who is allowed in at all.
export function resolveRole(email: string): Role {
  if (isAdminEmail(email)) return "admin";
  if (isWorkspaceEmail(email)) return "staff";
  return "volunteer";
}
