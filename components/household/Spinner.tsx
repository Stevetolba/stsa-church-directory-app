import { Loader2Icon } from "lucide-react";

// Button label that swaps to a spinner and a "…ing" message while a save is
// in flight, so the page never looks frozen.
export function BusyLabel({ busy, idle, working }: { busy: boolean; idle: string; working: string }) {
  if (!busy) return <>{idle}</>;
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <Loader2Icon className="size-4 animate-spin" aria-hidden />
      {working}
    </span>
  );
}
