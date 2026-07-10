"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 py-[100px] text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div>
        <h1 className="font-heading text-xl font-semibold text-brand-navy">Something went wrong</h1>
        <p className="mt-1 text-[14px] text-[#8A94A0]">
          We couldn&apos;t load this page. Please try again.
        </p>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-[10px] bg-brand-navy px-5 py-2.5 text-[14px] font-semibold text-brand-cream"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-[10px] border border-[#E5DCC8] px-5 py-2.5 text-[14px] font-semibold text-[#5B7185]"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
