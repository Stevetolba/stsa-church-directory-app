import type { NextAuthConfig } from "next-auth";

// Edge-safe base config, imported directly by middleware.ts (which runs on
// the Edge Runtime). Must not import next-auth/providers/google — that
// pulls in jose's webapi/compression code via @auth/core/jwt.js, which
// uses Node-only APIs (DecompressionStream) unsupported on Edge. The
// Google provider and role-resolution callbacks live in lib/auth.ts,
// which only runs in the Node.js runtime (route handlers, server
// components) — middleware only needs to know whether a session exists.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
} satisfies NextAuthConfig;
