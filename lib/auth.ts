// NextAuth v5 (Auth.js) config — ADR-0001. Staff auth via Google Workspace
// SSO, entirely independent of the Subsplash service token (lib/subsplash.ts).
// ADR-0010 extends this to admit personal-email volunteers as read-only when
// they're flagged for directory access in Subsplash.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { GoogleProfile } from "next-auth/providers/google";
import type { Role } from "@/types/auth";
import { isAdminEmail, resolveRole } from "./roles";
import { hasDirectoryAccess } from "./subsplash";
import { authConfig } from "./auth.config";

const WORKSPACE_DOMAIN = process.env.CHURCH_GOOGLE_WORKSPACE_DOMAIN;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Google],
  // ADR-0010: 24h so a volunteer whose Subsplash access is revoked loses it
  // within a day. The access check only runs at sign-in (JWT sessions aren't
  // re-checked per request), so a long-lived session would keep stale access.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  callbacks: {
    async signIn({ profile }) {
      if (!WORKSPACE_DOMAIN) {
        throw new Error("CHURCH_GOOGLE_WORKSPACE_DOMAIN is not configured");
      }
      const email = profile?.email?.toLowerCase();
      const emailVerified = (profile as GoogleProfile | undefined)?.email_verified;
      // We trust the email as an identity key (for admin/volunteer matching),
      // so require Google to have verified it.
      if (!email || !emailVerified) return false;

      // Admins may use any Google account (e.g. a personal one).
      if (isAdminEmail(email)) return true;

      // Church staff: workspace-domain account. Keep the hd-claim + suffix
      // defense-in-depth from ADR-0001.
      const hostedDomain = (profile as GoogleProfile | undefined)?.hd;
      if (hostedDomain === WORKSPACE_DOMAIN && email.endsWith(`@${WORKSPACE_DOMAIN}`)) {
        return true;
      }

      // Volunteers: personal email, allowed only if flagged for directory
      // access in Subsplash (ADR-0010). Fails closed on any lookup error.
      return await hasDirectoryAccess(email);
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
