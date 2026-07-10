import { Skeleton } from "@/components/Skeleton";

export default function PersonDetailLoading() {
  return (
    <div className="mx-auto max-w-[640px]">
      <Skeleton className="mb-6 h-5 w-16" />

      <div className="rounded-[14px] border border-[#EAE2D0] bg-white p-6 shadow-[0_1px_3px_rgba(26,58,92,0.05)]">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>

        <div className="my-6 h-px bg-[#F0EBDF]" />

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="h-px bg-[#F0EBDF]" />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
