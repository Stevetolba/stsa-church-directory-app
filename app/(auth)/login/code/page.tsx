"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { checkCodeAction, requestCodeAction, signInWithCodeAction } from "../actions";

type Step = "email" | "code" | "pick";

const FAILURE_MESSAGES: Record<string, string> = {
  wrong: "That code isn't right. Check it and try again.",
  expired: "That code has expired. Request a new one.",
  locked: "Too many wrong tries. Request a new code.",
  invalid: "We couldn't use that code. Request a new one.",
};

const inputCls = "w-full rounded-lg border border-border bg-white px-4 py-3 text-sm text-brand-navy";
const buttonCls =
  "w-full rounded-lg bg-brand-navy px-4 py-3 text-sm font-semibold text-brand-cream disabled:opacity-50";

export default function CodeLoginPage() {
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
      await requestCodeAction(email);
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
    const r = await signInWithCodeAction(email, code, profileId);
    setError(r.error);
    setBusy(false);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await checkCodeAction(email, code);
      if (!r.ok) {
        setError(FAILURE_MESSAGES[r.reason] ?? FAILURE_MESSAGES.invalid);
        setBusy(false);
        return;
      }
      if (r.candidates.length === 1) {
        await finish(r.candidates[0].profileId);
        return;
      }
      setCandidates(r.candidates);
      setStep("pick");
      setBusy(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-brand-sky/20 bg-card p-8 text-center shadow-sm">
        <div className="relative mx-auto mb-4 h-14 w-14 overflow-hidden rounded-full bg-white">
          <Image src="/stsa-logo.png" alt="STSA Church" fill sizes="56px" className="object-cover" />
        </div>
        <h1 className="font-heading text-2xl font-semibold text-brand-navy">Training sign-in</h1>

        {error && <p className="mt-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

        {step === "email" && (
          <form onSubmit={sendCode} className="mt-6 space-y-3 text-left">
            <p className="text-sm text-muted-foreground">
              Enter the email address you were invited with and we&apos;ll email you a sign-in code.
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
            <button type="submit" className={buttonCls} disabled={busy || !email.trim()}>
              Email me a code
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={submitCode} className="mt-6 space-y-3 text-left">
            <p className="text-sm text-muted-foreground">
              If that address belongs to someone invited to training, we&apos;ve emailed a 6-digit code. It expires in 10
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
            <button type="submit" className={buttonCls} disabled={busy || code.length !== 6}>
              Sign in
            </button>
            <button type="button" className="w-full text-xs text-muted-foreground underline" onClick={() => sendCode()}>
              Send a new code
            </button>
          </form>
        )}

        {step === "pick" && (
          <div className="mt-6 space-y-3 text-left">
            <p className="text-sm text-muted-foreground">More than one person uses this email. Who is signing in?</p>
            {candidates.map((c) => (
              <button
                key={c.profileId}
                type="button"
                className="w-full rounded-lg border border-border bg-white px-4 py-3 text-sm font-semibold text-brand-navy hover:bg-brand-cream disabled:opacity-50"
                disabled={busy}
                onClick={() => finish(c.profileId)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <p className="mt-6 text-xs">
          <Link href="/login" className="text-muted-foreground underline">
            Back to sign-in options
          </Link>
        </p>
      </div>
    </main>
  );
}
