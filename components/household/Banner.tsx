import { CheckCircle2Icon, ClockIcon, TriangleAlertIcon } from "lucide-react";

type Tone = "success" | "waiting" | "error";

const TONES: Record<Tone, { box: string; icon: string; Icon: typeof CheckCircle2Icon }> = {
  success: { box: "border-green-300 bg-green-50 text-green-900", icon: "text-green-600", Icon: CheckCircle2Icon },
  waiting: { box: "border-amber-300 bg-amber-50 text-amber-900", icon: "text-amber-600", Icon: ClockIcon },
  error: { box: "border-red-300 bg-red-50 text-red-900", icon: "text-red-600", Icon: TriangleAlertIcon },
};

// Coloured confirmation on the household overview: green when saved, amber
// when something is waiting for the church office, red when it didn't go through.
export function Banner({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const { box, icon, Icon } = TONES[tone];
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${box}`} role="status">
      <Icon className={`mt-0.5 size-5 shrink-0 ${icon}`} aria-hidden />
      <div>{children}</div>
    </div>
  );
}
