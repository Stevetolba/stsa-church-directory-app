import type { DefaultSession } from "next-auth";

// "volunteer" is a read-only tier for people outside the church's Google
// Workspace (personal-email volunteers) — access granted via a Subsplash
// custom field. It behaves identically to "staff" for authorization (both
// are non-admin, so writes are blocked); the distinct label lets the UI
// tell them apart and leaves room to restrict volunteers further. See
// ADR-0010.
// "learner" (ADR-0023) is the tier below "volunteer": someone the admin
// invited to training via the People list who has no DirectoryAccess and no
// other DirectoryRole. It's scoped to /training only (middleware.ts) — it
// can never see the People/Households/Children/Reports surfaces a
// "volunteer" can. Getting DirectoryAccess or a stronger DirectoryRole
// later (an admin edit, or another invite) supersedes it — see
// lib/auth.ts's jwt callback.
export type Role = "admin" | "staff" | "volunteer" | "learner";

declare module "next-auth" {
  interface Session {
    user: {
      role: Role;
      // ADR-0017: true for a personal-email volunteer whose Subsplash
      // DirectoryRole custom field is "Team Lead" — grants exactly one
      // extra permission (sending the Children/Youth "Email Parents"
      // feature) without otherwise changing their volunteer-tier scoping.
      // Deliberately not a new Role value: that would require re-auditing
      // every existing `role === "volunteer"` check across the app, when
      // the actual ask is one narrow, additive permission.
      canEmailChildren: boolean;
      // Subsplash profile id for the signed-in person, resolved at sign-in
      // (ADR-0023) — training progress/enrollment is keyed on this, same as
      // checkIns.profileId. Undefined only if the email lookup failed.
      profileId?: string;
    } & DefaultSession["user"];
  }
}
