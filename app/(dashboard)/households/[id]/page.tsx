import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import { getHousehold } from "@/lib/subsplash";
import { avatarTintForId, initialsOf } from "@/lib/avatar";
import { householdCampus } from "@/lib/household";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyableField } from "@/components/CopyableField";
import { HouseholdTypeBadge } from "@/components/HouseholdTypeBadge";

// No mockup exists for this screen as a page (the mockup shows a household
// modal) — built as a real route per the earlier decision to keep household
// detail navigable/linkable rather than a modal-only overlay.

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

export default async function HouseholdDetailPage({ params }: { params: { id: string } }) {
  const household = await getHousehold(params.id);

  if (!household) {
    notFound();
  }

  const campus = householdCampus(household);
  const members = household.members ?? [];

  return (
    <div className="mx-auto max-w-[640px]">
      <Link
        href="/households"
        className="mb-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#5B7185] hover:text-brand-navy"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Households
      </Link>

      <div className="overflow-hidden rounded-[14px] border border-[#EAE2D0] bg-white shadow-[0_1px_3px_rgba(26,58,92,0.05)]">
        <div className="bg-brand-navy px-6 py-6">
          <h1 className="font-heading text-[22px] font-semibold text-brand-cream">
            {household.name}
          </h1>
          <p className="mt-1 text-[13.5px] text-[#B9C4CF]">
            {[campus, household.address].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div className="flex flex-col gap-6 p-6">
          {(household.primary_email || household.primary_phone) && (
            <>
              <Section label="Primary Contact">
                <div className="flex flex-col gap-1">
                  {household.primary_email && (
                    <CopyableField
                      icon={<Mail className="h-4 w-4 shrink-0 text-[#97A9B8]" />}
                      value={household.primary_email}
                    />
                  )}
                  {household.primary_phone && (
                    <CopyableField
                      icon={<Phone className="h-4 w-4 shrink-0 text-[#97A9B8]" />}
                      value={household.primary_phone}
                    />
                  )}
                </div>
              </Section>
              <div className="h-px bg-[#F0EBDF]" />
            </>
          )}

          {household.address && (
            <>
              <Section label="Address">
                <CopyableField
                  icon={<MapPin className="h-4 w-4 shrink-0 text-[#97A9B8]" />}
                  value={household.address}
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(household.address)}`}
                />
              </Section>
              <div className="h-px bg-[#F0EBDF]" />
            </>
          )}

          <Section label={`${members.length} Member${members.length === 1 ? "" : "s"}`}>
            <div className="flex flex-col gap-1">
              {members.map((member) => {
                const tint = avatarTintForId(member.id);
                return (
                  <Link
                    key={member.id}
                    href={`/people/${member.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-brand-cream"
                  >
                    <div
                      className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full font-heading text-[13px] font-semibold"
                      style={{ backgroundColor: tint.bg, color: tint.text }}
                    >
                      {initialsOf(member.first_name, member.last_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-semibold text-brand-navy">
                          {member.first_name} {member.last_name}
                        </span>
                        <HouseholdTypeBadge role={member.household_role} />
                        <StatusBadge status={member.status} />
                      </div>
                      <div className="mt-0.5 truncate text-[12.5px] text-[#8A94A0]">
                        {[member.email, member.phone_number].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
