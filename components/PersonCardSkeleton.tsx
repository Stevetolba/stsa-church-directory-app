import { Skeleton } from "@/components/Skeleton";

// Mirrors PersonCard's dimensions so the swap-in on data arrival doesn't jump.
export function PersonCardSkeleton() {
  return (
    <div className="flex flex-col gap-3.5 rounded-[14px] border border-[#EAE2D0] bg-white p-5 shadow-[0_1px_3px_rgba(26,58,92,0.05)]">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="h-[46px] w-[46px] shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <Skeleton className="h-[17px] w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
      </div>

      <div className="h-px bg-[#F0EBDF]" />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3.5 w-28" />
      </div>
    </div>
  );
}
