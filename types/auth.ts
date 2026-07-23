import type { DefaultSession } from "next-auth";

// "volunteer" is a read-only tier for people outside the church's Google
// Workspace (personal-email volunteers) — access granted via a Subsplash
// custom field. It behaves identically to "staff" for authorization (both
// are non-admin, so writes are blocked); the distinct label lets the UI
// tell them apart and leaves room to restrict volunteers further. See
// ADR-0010.
export type Role = "admin" | "staff" | "volunteer";

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
    } & DefaultSession["user"];
  }
}
