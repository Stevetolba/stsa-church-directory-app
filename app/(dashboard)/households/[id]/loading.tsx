import { Skeleton } from "@/components/Skeleton";

export default function HouseholdDetailLoading() {
  return (
    <div className="mx-auto max-w-[640px]">
      <Skeleton className="mb-6 h-5 w-40" />

      <div className="overflow-hidden rounded-[14px] border border-[#EAE2D0] bg-white shadow-[0_1px_3px_rgba(26,58,92,0.05)]">
        <div className="bg-brand-navy px-6 py-6">
          <Skeleton className="h-6 w-48 bg-white/20" />
          <Skeleton className="mt-2 h-4 w-64 bg-white/10" />
        </div>

        <div className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>

          <div className="h-px bg-[#F0EBDF]" />

          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-20" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-[42px] w-[42px] shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
