// NextAuth v5 (Auth.js) config — ADR-0001. Staff auth via Google Workspace
// SSO, entirely independent of the Subsplash service token (lib/subsplash.ts).
// ADR-0010 extends this to admit personal-email volunteers as read-only when
// they're flagged for directory access in Subsplash. ADR-0017 further
// extends the jwt callback to elevate a personal-email person to admin, or
// grant the one narrow "email children's parents" permission, based on a
// separate Subsplash DirectoryRole custom field. ADR-0021 adds a second,
// Credentials-based provider so the native (Capacitor) shell can bridge a
// Google ID token obtained via its own native Sign-In SDK into the exact
// same session the web OAuth flow produces.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { GoogleProfile } from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { OAuth2Client } from "google-auth-library";
import type { Role } from "@/types/auth";
import { isAdminEmail, resolveRole } from "./roles";
import { getDirectoryRole, hasDirectoryAccess } from "./subsplash";
import { authConfig } from "./auth.config";
import { recordAccessEvent } from "./accessLog";

const WORKSPACE_DOMAIN = process.env.CHURCH_GOOGLE_WORKSPACE_DOMAIN;

// The same admission decision both providers below need — factored out so
// the native bridge (NativeGoogle's authorize(), further down) reuses it
// verbatim instead of re-deriving who's allowed in. Throws if
// WORKSPACE_DOMAIN is unconfigured, same as the original inline check.
async function evaluateAdmission(
  email: string,
  emailVerified: boolean | undefined,
  hostedDomain: string | undefined
): Promise<boolean> {
  if (!WORKSPACE_DOMAIN) {
    throw new Error("CHURCH_GOOGLE_WORKSPACE_DOMAIN is not configured");
  }
  // We trust the email as an identity key (for admin/volunteer matching), so
  // require Google to have verified it. Not logged: without a verified
  // email there's no reliable identity to attribute the attempt to.
  if (!email || !emailVerified) return false;

  // ADR-0016: resolveRole only classifies the email's shape (admin list /
  // workspace domain / neither) — it doesn't itself decide access — so it's
  // safe to compute up front and log against every branch below, including
  // a denial.
  const role = resolveRole(email);

  // Admins may use any Google account (e.g. a personal one).
  if (isAdminEmail(email)) {
    await recordAccessEvent({ email, role, eventType: "sign_in" });
    return true;
  }

  // Church staff: workspace-domain account. Keep the hd-claim + suffix
  // defense-in-depth from ADR-0001.
  if (hostedDomain === WORKSPACE_DOMAIN && email.endsWith(`@${WORKSPACE_DOMAIN}`)) {
    await recordAccessEvent({ email, role, eventType: "sign_in" });
    return true;
  }

  // Everyone else: personal email, admitted either the original way
  // (ADR-0010: flagged for read-only directory access) or via a Subsplash
  // DirectoryRole of Admin/Team Lead (ADR-0017) — either is enough to sign
  // in; the jwt callback below works out which. Fails closed on any lookup
  // error.
  const directoryRole = await getDirectoryRole(email);
  const grantedByRole = directoryRole === "Admin" || directoryRole === "Team Lead";
  const granted = grantedByRole || (await hasDirectoryAccess(email));
  await recordAccessEvent({ email, role, eventType: granted ? "sign_in" : "sign_in_denied" });
  return granted;
}

// ADR-0021: verifies a Google ID token obtained natively (the Capacitor
// shell's @capawesome/capacitor-google-sign-in — Google's own native
// Sign-In SDK, not an OAuth redirect the WebView would have to follow —
// see lib/nativeAuth.ts) and admits it through the exact same rules as the
// web OAuth flow. The token's audience must match this app's own web OAuth
// client id (AUTH_GOOGLE_ID): Google's native SDKs are configured (via each
// platform's own native setup — GIDClientID on iOS) to mint ID tokens
// against that same web client on every platform, so no separate native
// client id needs to be trusted server-side.
const googleIdTokenClient = new OAuth2Client();

const NativeGoogle = Credentials({
  id: "native-google",
  name: "Native Google Sign-In",
  credentials: { idToken: { label: "ID Token", type: "text" } },
  async authorize(credentials) {
    const idToken = typeof credentials?.idToken === "string" ? credentials.idToken : null;
    const audience = process.env.AUTH_GOOGLE_ID;
    if (!idToken || !audience) return null;

    let payload;
    try {
      const ticket = await googleIdTokenClient.verifyIdToken({ idToken, audience });
      payload = ticket.getPayload();
    } catch {
      // Expired, tampered, or wrong-audience token — reject silently, same
      // as any other failed sign-in attempt.
      return null;
    }
    if (!payload?.email) return null;

    const admitted = await evaluateAdmission(
      payload.email.toLowerCase(),
      payload.email_verified,
      payload.hd
    );
    if (!admitted) return null;

    return { id: payload.sub, email: payload.email, name: payload.name ?? null, image: payload.picture ?? null };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Google, NativeGoogle],
  // ADR-0010: 24h so a volunteer whose Subsplash access is revoked loses it
  // within a day. The access check only runs at sign-in (JWT sessions aren't
  // re-checked per request), so a long-lived session would keep stale access.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  callbacks: {
    async signIn({ profile, account }) {
      // NativeGoogle's authorize() above already ran this exact admission
      // check (including its own access-log entry) before returning a
      // user — reaching this callback for that provider means it already
      // passed, so there's nothing further to decide.
      if (account?.provider === "native-google") return true;

      const email = profile?.email?.toLowerCase() ?? "";
      const emailVerified = (profile as GoogleProfile | undefined)?.email_verified;
      const hostedDomain = (profile as GoogleProfile | undefined)?.hd;
      return evaluateAdmission(email, emailVerified, hostedDomain);
    },
    async jwt({ token, account }) {
      if (!token.email) return token;

      // Only re-derive on a fresh sign-in (account present) — a token
      // refresh shouldn't re-hit Subsplash on every request; the 24h
      // maxAge above is what forces re-validation, not this callback.
      if (!account) return token;

      const baseRole = resolveRole(token.email);
      if (baseRole !== "volunteer") {
        token.role = baseRole;
        token.canEmailChildren = false;
        return token;
      }

      // Non-staff, non-admin-by-list: check Subsplash's DirectoryRole field
      // for an elevation (ADR-0017). Admin promotes the whole session, same
      // as being listed in ADMIN_EMAILS; Team Lead only grants the one
      // narrow permission (sending the Children/Youth "Email Parents"
      // feature) — everything else about them stays exactly volunteer-scoped.
      const directoryRole = await getDirectoryRole(token.email);
      token.role = directoryRole === "Admin" ? "admin" : "volunteer";
      token.canEmailChildren = directoryRole === "Team Lead";
      return token;
    },
    async session({ session, token }) {
      const role = token.role as Role | undefined;
      if (role) {
        session.user.role = role;
      }
      session.user.canEmailChildren = !!token.canEmailChildren;
      return session;
    },
  },
});
