import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formats an ISO date string (e.g. "1968-04-12") for display. Parses the
// parts manually rather than `new Date(iso)` to avoid UTC-vs-local
// timezone shifting a date-only string by a day.
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
}
