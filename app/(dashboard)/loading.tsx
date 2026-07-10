import { Skeleton } from "@/components/Skeleton";

export default function DashboardLoading() {
  return (
    <div>
      <Skeleton className="h-9 w-64" />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-[14px] border border-[#EAE2D0] bg-white p-5 shadow-[0_1px_3px_rgba(26,58,92,0.05)]"
          >
            <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-7 w-10" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      <Skeleton className="mt-8 h-[46px] max-w-[440px] rounded-[10px]" />

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-[14px] border border-[#EAE2D0] bg-white p-5 shadow-[0_1px_3px_rgba(26,58,92,0.05)]"
          >
            <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
