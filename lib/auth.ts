// NextAuth v5 (Auth.js) config — ADR-0001. Staff auth via Google Workspace
// SSO, entirely independent of the Subsplash service token (lib/subsplash.ts).
// ADR-0010 extends this to admit personal-email volunteers as read-only when
// they're flagged for directory access in Subsplash. ADR-0017 further
// extends the jwt callback to elevate a personal-email person to admin, or
// grant the one narrow "email children's parents" permission, based on a
// separate Subsplash DirectoryRole custom field.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { GoogleProfile } from "next-auth/providers/google";
import type { Role } from "@/types/auth";
import { isAdminEmail, resolveRole } from "./roles";
import { getDirectoryRole, getProfileIdByEmail, hasDirectoryAccess } from "./subsplash";
import { authConfig } from "./auth.config";
import { recordAccessEvent } from "./accessLog";
import { consumeLoginCode } from "./loginCode";

// ADR-0025: learners without a Google account sign in with an emailed
// one-time code. authorize() does all the checking (code valid, unused, and
// the chosen profile is an enrolled Learner), so the callbacks below just
// trust a successful "learner-code" sign-in.
const LEARNER_CODE_PROVIDER = "learner-code";

const WORKSPACE_DOMAIN = process.env.CHURCH_GOOGLE_WORKSPACE_DOMAIN;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google,
    Credentials({
      id: LEARNER_CODE_PROVIDER,
      credentials: { email: {}, code: {}, profileId: {} },
      async authorize(credentials) {
        const { email, code, profileId } = credentials as Record<string, string | undefined>;
        if (!email || !code || !profileId) return null;
        return consumeLoginCode(email, code, profileId);
      },
    }),
  ],
  // ADR-0010: 24h so a volunteer whose Subsplash access is revoked loses it
  // within a day. The access check only runs at sign-in (JWT sessions aren't
  // re-checked per request), so a long-lived session would keep stale access.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  callbacks: {
    async signIn({ profile, account, user }) {
      if (account?.provider === LEARNER_CODE_PROVIDER) {
        await recordAccessEvent({
          email: user.email ?? "",
          name: user.name ?? null,
          role: "learner",
          eventType: "sign_in",
        });
        return true;
      }
      if (!WORKSPACE_DOMAIN) {
        throw new Error("CHURCH_GOOGLE_WORKSPACE_DOMAIN is not configured");
      }
      const email = profile?.email?.toLowerCase();
      const name = (profile as GoogleProfile | undefined)?.name ?? null;
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
        await recordAccessEvent({ email, name, role, eventType: "sign_in" });
        return true;
      }

      // Church staff: workspace-domain account. Keep the hd-claim + suffix
      // defense-in-depth from ADR-0001.
      const hostedDomain = (profile as GoogleProfile | undefined)?.hd;
      if (hostedDomain === WORKSPACE_DOMAIN && email.endsWith(`@${WORKSPACE_DOMAIN}`)) {
        await recordAccessEvent({ email, name, role, eventType: "sign_in" });
        return true;
      }

      // Everyone else: personal email, admitted either the original way
      // (ADR-0010: flagged for read-only directory access), via a
      // Subsplash DirectoryRole of Admin/Team Lead (ADR-0017), or via
      // DirectoryRole "Learner" (ADR-0023: set by the admin's "Invite to
      // training" action on someone with no other access) — any of these
      // is enough to sign in; the jwt callback below works out which role
      // to grant. Fails closed on any lookup error.
      // Match on name as well as email: kids often have a parent's email (ADR-0023).
      const directoryRole = await getDirectoryRole(email, name);
      const grantedByRole =
        directoryRole === "Admin" || directoryRole === "Team Lead" || directoryRole === "Learner";
      const granted = grantedByRole || (await hasDirectoryAccess(email, name));
      await recordAccessEvent({ email, name, role, eventType: granted ? "sign_in" : "sign_in_denied" });
      return granted;
    },
    async jwt({ token, account, user }) {
      if (!token.email) return token;

      // ADR-0025: code sign-in already identified the exact profile, so skip
      // the email+name Subsplash lookups below (there's no Google name here).
      if (account?.provider === LEARNER_CODE_PROVIDER) {
        token.profileId = user?.id;
        token.role = "learner";
        token.canEmailChildren = false;
        return token;
      }

      // Only re-derive on a fresh sign-in (account present) — a token
      // refresh shouldn't re-hit Subsplash on every request; the 24h
      // maxAge above is what forces re-validation, not this callback.
      if (!account) return token;

      // ADR-0023: every signed-in person's Subsplash profile id, for the
      // training feature (progress/enrollment are keyed on it, like
      // checkIns.profileId). Best-effort — a lookup failure shouldn't block
      // sign-in for roles that don't need it.
      token.profileId = await getProfileIdByEmail(token.email, token.name ?? null);

      const baseRole = resolveRole(token.email);
      if (baseRole !== "volunteer") {
        token.role = baseRole;
        token.canEmailChildren = false;
        return token;
      }

      // Non-staff, non-admin-by-list: check Subsplash's DirectoryRole field
      // for an elevation (ADR-0017), or the training-only "Learner" tier
      // (ADR-0023). Admin promotes the whole session, same as being listed
      // in ADMIN_EMAILS; Team Lead only grants the one narrow permission
      // (sending the Children/Youth "Email Parents" feature); DirectoryRole
      // "Learner" only applies when the person has no other access —
      // hasDirectoryAccess already granted them a full "volunteer" session
      // otherwise, and that always wins (ADR-0023 never restricts someone
      // who already has broader access).
      const directoryRole = await getDirectoryRole(token.email, token.name ?? null);
      if (directoryRole === "Admin") {
        token.role = "admin";
      } else if (directoryRole === "Learner" && !(await hasDirectoryAccess(token.email, token.name ?? null))) {
        token.role = "learner";
      } else {
        token.role = "volunteer";
      }
      token.canEmailChildren = directoryRole === "Team Lead";
      return token;
    },
    async session({ session, token }) {
      const role = token.role as Role | undefined;
      if (role) {
        session.user.role = role;
      }
      session.user.canEmailChildren = !!token.canEmailChildren;
      session.user.profileId = token.profileId as string | undefined;
      return session;
    },
  },
});
