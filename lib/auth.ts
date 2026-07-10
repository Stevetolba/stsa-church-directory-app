// NextAuth v5 (Auth.js) config — ADR-0001. Staff auth via Google Workspace
// SSO, entirely independent of the Subsplash service token (lib/subsplash.ts).

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { GoogleProfile } from "next-auth/providers/google";
import type { Role } from "@/types/auth";
import { resolveRole } from "./roles";
import { authConfig } from "./auth.config";

const WORKSPACE_DOMAIN = process.env.CHURCH_GOOGLE_WORKSPACE_DOMAIN;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile }) {
      if (!WORKSPACE_DOMAIN) {
        throw new Error("CHURCH_GOOGLE_WORKSPACE_DOMAIN is not configured");
      }
      const email = profile?.email;
      const hostedDomain = (profile as GoogleProfile | undefined)?.hd;
      // Defense in depth (ADR-0001): the hd claim is convenient but in
      // theory spoofable, so also check the verified email's domain.
      return hostedDomain === WORKSPACE_DOMAIN && !!email?.toLowerCase().endsWith(`@${WORKSPACE_DOMAIN}`);
    },
    async jwt({ token }) {
      if (token.email) {
        token.role = resolveRole(token.email);
      }
      return token;
    },
    async session({ session, token }) {
      const role = token.role as Role | undefined;
      if (role) {
        session.user.role = role;
      }
      return session;
    },
  },
});
