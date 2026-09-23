"use client";

import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { InviteToTrainingDialog } from "@/components/training/InviteToTrainingDialog";

// Admin-only "Invite to training" for one person, on their detail page.
export function InviteSingleButton({ profileId, name }: { profileId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-2 rounded-[10px] border border-[#E5DCC8] bg-white px-4 py-2 text-[13.5px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/30"
      >
        <GraduationCap className="h-3.5 w-3.5" />
        Invite to Training
      </button>
      <InviteToTrainingDialog
        open={open}
        onOpenChange={setOpen}
        getProfileIds={async () => [profileId]}
        countLabel={name}
      />
    </>
  );
}
