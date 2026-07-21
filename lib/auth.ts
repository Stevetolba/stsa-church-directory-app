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
import { recordAccessEvent } from "./accessLog";

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
      // so require Google to have verified it. Not logged: without a
      // verified email there's no reliable identity to attribute the
      // attempt to.
      if (!email || !emailVerified) return false;

      // ADR-0016: resolveRole only classifies the email's shape (admin list /
      // workspace domain / neither) — it doesn't itself decide access — so
      // it's safe to compute up front and log against every branch below,
      // including a denial.
      const role = resolveRole(email);

      // Admins may use any Google account (e.g. a personal one).
      if (isAdminEmail(email)) {
        await recordAccessEvent({ email, role, eventType: "sign_in" });
        return true;
      }

      // Church staff: workspace-domain account. Keep the hd-claim + suffix
      // defense-in-depth from ADR-0001.
      const hostedDomain = (profile as GoogleProfile | undefined)?.hd;
      if (hostedDomain === WORKSPACE_DOMAIN && email.endsWith(`@${WORKSPACE_DOMAIN}`)) {
        await recordAccessEvent({ email, role, eventType: "sign_in" });
        return true;
      }

      // Volunteers: personal email, allowed only if flagged for directory
      // access in Subsplash (ADR-0010). Fails closed on any lookup error.
      const granted = await hasDirectoryAccess(email);
      await recordAccessEvent({ email, role, eventType: granted ? "sign_in" : "sign_in_denied" });
      return granted;
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
