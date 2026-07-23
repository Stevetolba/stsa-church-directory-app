"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { Profile } from "@/types/profile";
import type { Household } from "@/types/household";
import { editProfileWithAddressSchema } from "@/lib/validation/profile";
import { z } from "zod";
import { StatusBadge } from "@/components/StatusBadge";

// Profile fields plus the profile's own structured address (street/city/
// state/postal_code) — the address maps to Subsplash's _embedded.address on
// save, independent of the household's shared address.
type EditFormValues = z.infer<typeof editProfileWithAddressSchema>;

export function EditProfileForm({
  profile,
  household,
}: {
  profile: Profile;
  household: Household | null;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Most profiles don't have their own address override yet — prefill from
  // the shared household address (same fallback the read-only profile page
  // uses) so the fields aren't blank, even though saving now always writes
  // to the person's own address, not the household's.
  const addressDefaults = profile.address_parts ?? household?.address_parts;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editProfileWithAddressSchema),
    defaultValues: {
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      phone_number: profile.phone_number ?? "",
      campus: profile.campus ?? "Arlington",
      directory_access: profile.directory_access ?? false,
      directory_role: profile.directory_role ?? "Volunteer",
      date_of_birth: profile.date_of_birth ?? "",
      allergy_notes: profile.allergy_notes ?? "",
      care_notes: profile.care_notes ?? "",
      street: addressDefaults?.street ?? "",
      city: addressDefaults?.city ?? "",
      state: addressDefaults?.state ?? "",
      postal_code: addressDefaults?.postal_code ?? "",
    },
  });

  async function onSubmit(values: EditFormValues) {
    setSubmitError(null);
    const { campus, directory_access, directory_role, ...restValues } = values;
    // Campus, Directory Access, and Directory Role all default to a value
    // even when unchanged (a controlled <select>/checkbox always reports
    // one) — only include each in the PATCH if it actually changed, so
    // saving name/email/phone doesn't trigger a needless custom-field write.
    const profileValues = {
      ...restValues,
      ...(campus !== (profile.campus ?? "Arlington") ? { campus } : {}),
      ...(directory_access !== (profile.directory_access ?? false) ? { directory_access } : {}),
      ...(directory_role !== (profile.directory_role ?? "Volunteer") ? { directory_role } : {}),
    };

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
        <Field label="Date of Birth" htmlFor="date_of_birth" error={errors.date_of_birth?.message}>
          <input
            id="date_of_birth"
            type="date"
            {...register("date_of_birth")}
            className={inputClass(!!errors.date_of_birth)}
          />
        </Field>
        <Field
          label="Directory Access"
          htmlFor="directory_access"
          error={errors.directory_access?.message}
          className="sm:col-span-2"
        >
          <label
            htmlFor="directory_access"
            className="flex cursor-pointer items-center gap-2 text-[13.5px] text-brand-navy"
          >
            <input
              id="directory_access"
              type="checkbox"
              {...register("directory_access")}
              className="h-4 w-4 rounded border-[#E5DCC8] text-brand-navy focus:ring-brand-sky"
            />
            Grant read-only volunteer sign-in access
          </label>
        </Field>
        <Field
          label="Directory Role"
          htmlFor="directory_role"
          error={errors.directory_role?.message}
          className="sm:col-span-2"
        >
          <select
            id="directory_role"
            {...register("directory_role")}
            className={inputClass(!!errors.directory_role)}
          >
            <option value="Volunteer">Volunteer</option>
            <option value="Team Lead">Team Lead — can email Children/Youth parents</option>
            <option value="Admin">Admin — full access, same as an admin email</option>
          </select>
          <p className="mt-1.5 text-[12px] text-[#8A94A0]">
            Elevates a non-staff person beyond read-only access. Admin and Team Lead both let
            this person sign in even without Directory Access checked above.
          </p>
        </Field>
      </div>

      <div className="my-6 h-px bg-[#F0EBDF]" />
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8A94A0]">
        Care &amp; Safety
      </div>
      <div className="grid grid-cols-1 gap-5">
        <Field label="Allergy Notes" htmlFor="allergy_notes" error={errors.allergy_notes?.message}>
          <textarea
            id="allergy_notes"
            rows={2}
            {...register("allergy_notes")}
            className={inputClass(!!errors.allergy_notes)}
          />
        </Field>
        {/* care_notes is child-only + "private" in Subsplash (ADR-0012). */}
        {profile.household_role === "child" && (
          <Field
            label="Care Notes (private)"
            htmlFor="care_notes"
            error={errors.care_notes?.message}
          >
            <textarea
              id="care_notes"
              rows={2}
              {...register("care_notes")}
              className={inputClass(!!errors.care_notes)}
            />
          </Field>
        )}
      </div>

      <div className="my-6 h-px bg-[#F0EBDF]" />
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8A94A0]">
        Address
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label="Street"
          htmlFor="street"
          error={errors.street?.message}
          className="sm:col-span-2"
        >
          <input id="street" {...register("street")} className={inputClass(!!errors.street)} />
        </Field>
        <Field label="City" htmlFor="city" error={errors.city?.message}>
          <input id="city" {...register("city")} className={inputClass(!!errors.city)} />
        </Field>
        <Field label="State" htmlFor="state" error={errors.state?.message}>
          <input id="state" {...register("state")} className={inputClass(!!errors.state)} />
        </Field>
        <Field
          label="Postal Code"
          htmlFor="postal_code"
          error={errors.postal_code?.message}
        >
          <input
            id="postal_code"
            {...register("postal_code")}
            className={inputClass(!!errors.postal_code)}
          />
        </Field>
      </div>

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
