import type { DefaultSession } from "next-auth";

export type Role = "admin" | "staff";

declare module "next-auth" {
  interface Session {
    user: {
      role: Role;
    } & DefaultSession["user"];
  }
}
