"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeNewMemberAction } from "@/app/(household)/household-update/actions";

export function RemoveNewMember({ memberKey }: { memberKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="text-sm text-muted-foreground underline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await removeNewMemberAction(memberKey);
        router.refresh();
        setBusy(false);
      }}
    >
      Remove
    </button>
  );
}
