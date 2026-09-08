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

// Every church Workspace account (@stsa.church) is admin, same as anyone
// explicitly listed in ADMIN_EMAILS — there's no separate read-only staff
// tier anymore. Personal-email volunteers (ADR-0010) remain the only
// non-admin tier. This only assigns a role to an already-authorized user —
// the signIn gate (lib/auth.ts) decides who is allowed in at all.
export function resolveRole(email: string): Role {
  if (isAdminEmail(email) || isWorkspaceEmail(email)) return "admin";
  return "volunteer";
}
