import type { ReactNode } from "react";

export function EmptyState({ icon, message }: { icon?: ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-[60px] text-center">
      {icon && (
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EEF2F6] text-[#8A94A0]">
          {icon}
        </div>
      )}
      <div className="text-[14.5px] text-[#8A94A0]">{message}</div>
    </div>
  );
}
