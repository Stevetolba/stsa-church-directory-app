"use server";

import { signIn } from "@/lib/auth";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/" });
}

// ADR-0021: the native shell obtains a Google ID token itself (Google's
// native Sign-In SDK, see lib/nativeAuth.ts) and hands it here to run
// through the "native-google" Credentials provider, which verifies it and
// applies the exact same admission rules as signInWithGoogle above
// (lib/auth.ts's evaluateAdmission).
export async function signInWithNativeGoogle(idToken: string) {
  await signIn("native-google", { idToken, redirectTo: "/" });
}
