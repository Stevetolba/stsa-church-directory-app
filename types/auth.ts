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
    } & DefaultSession["user"];
  }
}
