"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { Profile } from "@/types/profile";
import type { Household } from "@/types/household";
import { editProfileSchema } from "@/lib/validation/profile";
import { updateHouseholdSchema } from "@/lib/validation/household";
import { z } from "zod";
import { StatusBadge } from "@/components/StatusBadge";

const editFormSchema = editProfileSchema.extend({
  address: updateHouseholdSchema.shape.address,
});
type EditFormValues = z.infer<typeof editFormSchema>;

export function EditProfileForm({
  profile,
  household,
}: {
  profile: Profile;
  household: Household | null;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      phone_number: profile.phone_number ?? "",
      campus: profile.campus ?? "Arlington",
      address: household?.address ?? "",
    },
  });

  async function onSubmit(values: EditFormValues) {
    setSubmitError(null);
    const { address, campus, ...restProfileValues } = values;
    // Campus is a controlled <select> with a default, so it's always
    // present in `values` even when unchanged. Real-mode campus updates
    // aren't implemented yet (lib/subsplash.ts throws clearly if asked to
    // change it) — only include it in the PATCH if it actually changed,
    // so saving name/email/phone doesn't fail just because the select's
    // default value is technically "defined".
    const profileValues =
      campus !== (profile.campus ?? "Arlington") ? { ...restProfileValues, campus } : restProfileValues;

    const profileRes = await fetch(`/api/profiles/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileValues),
    });

    if (!profileRes.ok) {
      const body = await profileRes.json().catch(() => null);
      const message =
        profileRes.status === 403
          ? "You don't have permission to edit profiles."
          : (body?.error as string | undefined) ?? "Something went wrong saving changes. Please try again.";
      setSubmitError(message);
      toast.error(message);
      return;
    }

    if (household && address !== (household.address ?? "")) {
      const householdRes = await fetch(`/api/households/${household.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });

      if (!householdRes.ok) {
        const body = await householdRes.json().catch(() => null);
        const detail = (body?.error as string | undefined) ?? "Please try again.";
        const message = `Profile saved, but the household address couldn't be updated. ${detail}`;
        setSubmitError(message);
        toast.error(message);
        return;
      }
    }

    toast.success("Profile updated");
    router.push(`/people/${profile.id}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-[14px] border border-[#EAE2D0] bg-white p-6 shadow-[0_1px_3px_rgba(26,58,92,0.05)]"
    >
      <div className="mb-6 flex items-center gap-3">
        <span className="text-[13px] text-[#5B7185]">Status</span>
        <StatusBadge status={profile.status} />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="First Name" htmlFor="first_name" error={errors.first_name?.message}>
          <input
            id="first_name"
            {...register("first_name")}
            className={inputClass(!!errors.first_name)}
          />
        </Field>
        <Field label="Last Name" htmlFor="last_name" error={errors.last_name?.message}>
          <input id="last_name" {...register("last_name")} className={inputClass(!!errors.last_name)} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message} className="sm:col-span-2">
          <input id="email" type="email" {...register("email")} className={inputClass(!!errors.email)} />
        </Field>
        <Field label="Phone Number" htmlFor="phone_number" error={errors.phone_number?.message}>
          <input
            id="phone_number"
            {...register("phone_number")}
            className={inputClass(!!errors.phone_number)}
          />
        </Field>
        <Field label="Campus" htmlFor="campus" error={errors.campus?.message}>
          <select id="campus" {...register("campus")} className={inputClass(!!errors.campus)}>
            <option value="Arlington">Arlington</option>
            <option value="Leesburg">Leesburg</option>
          </select>
        </Field>
      </div>

      {household && (
        <>
          <div className="my-6 h-px bg-[#F0EBDF]" />
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8A94A0]">
            Household
          </div>
          <Field label="Address" htmlFor="address" error={errors.address?.message}>
            <input id="address" {...register("address")} className={inputClass(!!errors.address)} />
          </Field>
        </>
      )}

      {submitError && (
        <p className="mt-5 rounded-lg bg-destructive/10 px-4 py-3 text-[13.5px] text-destructive">
          {submitError}
        </p>
      )}

      <div className="mt-7 flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-[10px] bg-brand-navy px-5 py-2.5 text-[14px] font-semibold text-brand-cream disabled:opacity-60"
        >
          {isSubmitting ? "Saving…" : "Save Changes"}
        </button>
        <Link
          href={`/people/${profile.id}`}
          className="rounded-[10px] border border-[#E5DCC8] px-5 py-2.5 text-[14px] font-semibold text-[#5B7185]"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function inputClass(hasError: boolean): string {
  return `w-full rounded-[10px] border ${
    hasError ? "border-destructive" : "border-[#E5DCC8]"
  } bg-white px-3.5 py-2.5 text-[14px] text-brand-navy outline-none focus:border-brand-sky`;
}

function Field({
  label,
  htmlFor,
  error,
  className = "",
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-semibold text-[#5B7185]">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-[12px] text-destructive">{error}</p>}
    </div>
  );
}
