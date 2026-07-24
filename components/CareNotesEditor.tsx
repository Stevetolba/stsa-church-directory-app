"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

// ADR-0018: the one field on this page any authenticated role — admin,
// staff, and volunteer — can edit, not just admin (contrast with the
// "Edit Profile" link elsewhere on this page, still admin-only). Inline
// here rather than sending everyone through the full EditProfileForm, which
// exposes a lot of admin-only fields (email, campus, Directory Access/Role)
// a volunteer shouldn't see an entry point to at all.
export function CareNotesEditor({
  profileId,
  initialValue,
}: {
  profileId: string;
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [draft, setDraft] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/profiles/${profileId}/care-notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ care_notes: draft }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Could not save care notes");
        return;
      }
      setValue(draft);
      setEditing(false);
      toast.success("Care notes saved");
    } catch {
      toast.error("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-[10px] border border-[#E5DCC8] bg-[#FBF9F4] px-4 py-3">
        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
          Care Notes · Private
        </div>
        <textarea
          autoFocus
          rows={3}
          maxLength={1500}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-[8px] border border-[#E5DCC8] bg-white px-3 py-2 text-[14px] text-brand-navy outline-none focus:border-brand-sky"
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
            disabled={saving}
            className="rounded-[8px] border border-[#E5DCC8] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#5B7185] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-[8px] bg-brand-navy px-3 py-1.5 text-[12.5px] font-semibold text-brand-cream disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-[#E5DCC8] bg-[#FBF9F4] px-4 py-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
          Care Notes · Private
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[#5B7185] hover:text-brand-navy"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>
      {value ? (
        <div className="whitespace-pre-wrap text-[14px] text-[#3E5670]">{value}</div>
      ) : (
        <div className="text-[13px] italic text-[#97A9B8]">No care notes yet.</div>
      )}
    </div>
  );
}
