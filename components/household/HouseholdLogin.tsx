"use client";

import { useState } from "react";
import {
  checkHouseholdCodeAction,
  requestHouseholdCodeAction,
  signInHouseholdAction,
} from "@/app/(household)/household-update/actions";
import { inputCls, primaryBtn } from "./ui";

type Step = "email" | "code" | "pick";

const FAILURE_MESSAGES: Record<string, string> = {
  wrong: "That code isn't right. Check it and try again.",
  expired: "That code has expired. Request a new one.",
  locked: "Too many wrong tries. Request a new code.",
  invalid: "We couldn't use that code. Request a new one.",
};

export function HouseholdLogin() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [candidates, setCandidates] = useState<{ profileId: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestHouseholdCodeAction(email);
      setCode("");
      setStep("code");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function finish(profileId: string) {
    setBusy(true);
    // Redirects on success; only returns when the code didn't work.
    const r = await signInHouseholdAction(email, code, profileId);
    // On success the action redirects and the client gets nothing back.
    if (!r) return;
    setError(r.error);
    setBusy(false);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    let r: Awaited<ReturnType<typeof checkHouseholdCodeAction>>;
    try {
      r = await checkHouseholdCodeAction(email, code);
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
      return;
    }
    if (!r.ok) {
      setError(FAILURE_MESSAGES[r.reason] ?? FAILURE_MESSAGES.invalid);
      setBusy(false);
      return;
    }
    if (r.candidates.length === 1) {
      // Not inside the try above: a successful sign-in redirects, and Next
      // implements that by throwing, which must not be caught as an error.
      await finish(r.candidates[0].profileId);
      return;
    }
    setCandidates(r.candidates);
    setStep("pick");
    setBusy(false);
  }

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-brand-sky/20 bg-card p-8 shadow-sm">
      <h1 className="text-center font-heading text-2xl font-semibold text-brand-navy">Update your household</h1>
      {error && <p className="mt-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {step === "email" && (
        <form onSubmit={sendCode} className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            Enter the email address the church has on file for you and we&apos;ll email you a code. The church
            office may review some changes before the directory is updated.
          </p>
          <input
            type="email"
            required
            autoComplete="email"
            className={inputCls}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className={`${primaryBtn} w-full`} disabled={busy || !email.trim()}>
            Email me a code
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={submitCode} className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            If that address is on file for a parent or guardian, we&apos;ve emailed a 6-digit code. It expires in 10
            minutes.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className={`${inputCls} text-center text-xl tracking-[0.5em]`}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button type="submit" className={`${primaryBtn} w-full`} disabled={busy || code.length !== 6}>
            Continue
          </button>
          <button type="button" className="w-full text-xs text-muted-foreground underline" onClick={() => sendCode()}>
            Send a new code
          </button>
        </form>
      )}

      {step === "pick" && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">More than one household uses this email. Which one are you updating?</p>
          {candidates.map((c) => (
            <button
              key={c.profileId}
              type="button"
              className="w-full rounded-lg border border-[#CBD2D9] bg-white px-4 py-3 text-sm font-semibold text-brand-navy hover:bg-[#F5F7F9] disabled:opacity-50"
              disabled={busy}
              onClick={() => finish(c.profileId)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
