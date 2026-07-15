import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, Mail, MapPin, Phone, Pencil } from "lucide-react";
import { auth } from "@/lib/auth";
import { getHousehold, getProfile, profileVisibleToVolunteer } from "@/lib/subsplash";
import { avatarTintForId, initialsOf } from "@/lib/avatar";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyableField } from "@/components/CopyableField";
import { HouseholdTypeBadge } from "@/components/HouseholdTypeBadge";
import { householdMemberType } from "@/lib/household";

// No mockup exists for this screen — matches the card/typography treatment
// established by the People list and Dashboard.

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8A94A0]">
        {label}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[12px] text-[#8A94A0]">{label}</div>
      <div className="mt-0.5 text-[14px] text-[#3E5670]">{value}</div>
    </div>
  );
}

export default async function PersonDetailPage({ params }: { params: { id: string } }) {
  const [session, profile] = await Promise.all([auth(), getProfile(params.id)]);

  if (!profile) {
    notFound();
  }

  // ADR-0011: volunteers may only open children and their family members
  // (people who share a child-bearing household). Anyone else redirects back
  // to the children directory rather than leaking that the profile exists.
  const isVolunteer = session?.user.role === "volunteer";
  if (isVolunteer && !(await profileVisibleToVolunteer(profile.id))) {
    redirect("/children");
  }

  const household = profile.household_id ? await getHousehold(profile.household_id) : null;
  const otherMembers = household?.members?.filter((m) => m.id !== profile.id) ?? [];

  const isAdmin = session?.user.role === "admin";
  const backHref = isVolunteer ? "/children" : "/people";
  const backLabel = isVolunteer ? "Children" : "People";
  const tint = avatarTintForId(profile.id);
  const emails = [profile.email, ...(profile.emails ?? [])];
  const phones = [profile.phone_number, ...(profile.phones ?? [])].filter(
    (p): p is string => !!p
  );
  // The profile's own address if Subsplash has one linked, else the shared
  // household address most people rely on.
  const address = profile.address ?? household?.address;
  // Coarse Adult/Child grouping (not the granular guardian/parent/child/
  // other/unknown household_role) — matches what HouseholdTypeBadge shows
  // for other household members below.
  const householdType = householdMemberType(profile.household_role);
  // care_notes is child-only in Subsplash (ADR-0012); gate its display on the
  // same Adult/Child grouping the Household section uses.
  const isChild = householdType === "Child";

  return (
    <div className="mx-auto max-w-[640px]">
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#5B7185] hover:text-brand-navy"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {backLabel}
      </Link>

      <div className="rounded-[14px] border border-[#EAE2D0] bg-white p-6 shadow-[0_1px_3px_rgba(26,58,92,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-heading text-xl font-semibold"
              style={{ backgroundColor: tint.bg, color: tint.text }}
            >
              {initialsOf(profile.first_name, profile.last_name)}
            </div>
            <div>
              <h1 className="font-heading text-[26px] font-semibold text-brand-navy">
                {profile.first_name} {profile.last_name}
              </h1>
              <div className="mt-1.5 flex items-center gap-2">
                <StatusBadge status={profile.status} />
                {profile.campus && (
                  <span className="flex items-center gap-1 whitespace-nowrap rounded-full border border-[#E5DCC8] bg-white px-[11px] py-1 text-[12px] font-semibold text-[#5B7185]">
                    <MapPin className="h-3 w-3" />
                    {profile.campus}
                  </span>
                )}
              </div>
            </div>
          </div>

          {isAdmin && (
            <Link
              href={`/people/${profile.id}/edit`}
              className="flex shrink-0 items-center gap-2 rounded-[10px] bg-brand-navy px-4 py-2 text-[13.5px] font-semibold text-brand-cream"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Profile
            </Link>
          )}
        </div>

        <div className="my-6 h-px bg-[#F0EBDF]" />

        <div className="flex flex-col gap-6">
          <Section label="Contact">
            <div className="flex flex-col gap-1">
              {emails.map((email) => (
                <CopyableField
                  key={email}
                  icon={<Mail className="h-4 w-4 shrink-0 text-[#97A9B8]" />}
                  value={email}
                />
              ))}
              {phones.map((phone) => (
                <CopyableField
                  key={phone}
                  icon={<Phone className="h-4 w-4 shrink-0 text-[#97A9B8]" />}
                  value={phone}
                />
              ))}
              {address && (
                <CopyableField
                  icon={<MapPin className="h-4 w-4 shrink-0 text-[#97A9B8]" />}
                  value={address}
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                />
              )}
            </div>
          </Section>

          <div className="h-px bg-[#F0EBDF]" />

          <Section label="Personal">
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Date of Birth"
                value={profile.date_of_birth ? formatDate(profile.date_of_birth) : undefined}
              />
              <Field label="Gender" value={profile.gender} />
              <Field label="Marital Status" value={profile.marital_status} />
              <Field
                label="Baptism Date"
                value={profile.baptism_date ? formatDate(profile.baptism_date) : undefined}
              />
            </div>
          </Section>

          {/* Care & Safety (ADR-0012): allergy notes for anyone; care notes
              only for children (Subsplash-"private", child-only). Both are
              viewable by anyone who can reach this page — the volunteer
              visibility guard above already governs that. */}
          {(profile.allergy_notes || (isChild && profile.care_notes)) && (
            <>
              <div className="h-px bg-[#F0EBDF]" />
              <Section label="Care & Safety">
                <div className="flex flex-col gap-3">
                  {profile.allergy_notes && (
                    <div className="rounded-[10px] border border-[#F0D9A6] bg-[#FDF6E7] px-4 py-3">
                      <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#946200]">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Allergies
                      </div>
                      <div className="whitespace-pre-wrap text-[14px] text-[#5A4210]">
                        {profile.allergy_notes}
                      </div>
                    </div>
                  )}
                  {isChild && profile.care_notes && (
                    <div className="rounded-[10px] border border-[#E5DCC8] bg-[#FBF9F4] px-4 py-3">
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
                        Care Notes · Private
                      </div>
                      <div className="whitespace-pre-wrap text-[14px] text-[#3E5670]">
                        {profile.care_notes}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            </>
          )}

          {profile.household_id && (
            <>
              <div className="h-px bg-[#F0EBDF]" />
              <Section label="Household">
                <Link
                  href={`/households/${profile.household_id}`}
                  className="text-[14px] font-semibold text-brand-sky hover:underline"
                >
                  {household?.name ?? profile.household_name ?? "View household"}
                </Link>

                {profile.household_role && (
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <Field label="Household Type" value={householdType} />
                    {householdType === "Child" && (
                      <Field label="Grade" value={profile.academic_grade} />
                    )}
                  </div>
                )}

                {otherMembers.length > 0 && (
                  <div className="mt-4 flex flex-col gap-1">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8A94A0]">
                      Other Household Members
                    </div>
                    {otherMembers.map((member) => {
                      const memberTint = avatarTintForId(member.id);
                      return (
                        <Link
                          key={member.id}
                          href={`/people/${member.id}`}
                          className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-brand-cream"
                        >
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-heading text-[12px] font-semibold"
                            style={{ backgroundColor: memberTint.bg, color: memberTint.text }}
                          >
                            {initialsOf(member.first_name, member.last_name)}
                          </div>
                          <span className="flex-1 truncate text-[14px] text-brand-navy">
                            {member.first_name} {member.last_name}
                          </span>
                          <HouseholdTypeBadge role={member.household_role} />
                          <StatusBadge status={member.status} />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
