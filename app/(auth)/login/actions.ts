"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { checkLoginCode, requestLoginCode, type CodeFailure, type LearnerCandidate } from "@/lib/loginCode";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/" });
}

// ADR-0025: learners without a Google account sign in with an emailed code.

// Same answer whether or not the address belongs to an invited learner.
export async function requestCodeAction(email: string): Promise<void> {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  await requestLoginCode(email, { logoUrl: `${proto}://${host}/stsa-logo.png` });
}

export async function checkCodeAction(
  email: string,
  code: string
): Promise<{ ok: true; candidates: LearnerCandidate[] } | { ok: false; reason: CodeFailure }> {
  return checkLoginCode(email, code);
}

// On success this redirects (throws) to /training; it only returns on failure.
export async function signInWithCodeAction(email: string, code: string, profileId: string): Promise<{ error: string }> {
  try {
    await signIn("learner-code", { email, code, profileId, redirectTo: "/training" });
  } catch (err) {
    if (err instanceof AuthError) return { error: "That code didn't work. Please request a new one." };
    throw err;
  }
  return { error: "Something went wrong signing in. Please try again." };
}
