import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/types/auth";

// Edge-safe base config, imported directly by middleware.ts (which runs on
// the Edge Runtime). Must not import next-auth/providers/google — that
// pulls in jose's webapi/compression code via @auth/core/jwt.js, which
// uses Node-only APIs (DecompressionStream) unsupported on Edge. The
// Google provider and the callback that actually *computes* role (including
// the Subsplash DirectoryRole lookup, ADR-0017) live in lib/auth.ts, which
// only runs in the Node.js runtime (route handlers, server components).
//
// The session callback below is still Edge-safe to include here: it does no
// Subsplash/DB lookup of its own, just projects a value the full config's
// jwt callback already computed and embedded in the signed token — reading
// it needs no extra imports beyond this file's existing ones.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    session({ session, token }) {
      const role = token.role as Role | undefined;
      if (role) {
        session.user.role = role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
