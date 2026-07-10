import { Skeleton } from "@/components/Skeleton";

export default function EditProfileLoading() {
  return (
    <div className="mx-auto max-w-[640px]">
      <Skeleton className="mb-6 h-9 w-40" />

      <div className="rounded-[14px] border border-[#EAE2D0] bg-white p-6 shadow-[0_1px_3px_rgba(26,58,92,0.05)]">
        <Skeleton className="mb-6 h-6 w-48" />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`flex flex-col gap-1.5 ${i === 2 ? "sm:col-span-2" : ""}`}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-[42px] w-full rounded-[10px]" />
            </div>
          ))}
        </div>

        <div className="mt-7 flex items-center gap-3">
          <Skeleton className="h-[42px] w-32 rounded-[10px]" />
          <Skeleton className="h-[42px] w-24 rounded-[10px]" />
        </div>
      </div>
    </div>
  );
}
