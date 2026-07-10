import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Home, Search, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { listHouseholds, searchProfiles } from "@/lib/subsplash";

function firstNameOf(name: string | null | undefined): string {
  if (!name) return "there";
  return name.trim().split(" ")[0];
}

export default async function DashboardPage() {
  const session = await auth();
  const [{ total: memberCount }, { total: householdCount }] = await Promise.all([
    searchProfiles({ pageSize: 1 }),
    listHouseholds({ pageSize: 1 }),
  ]);

  return (
    <div>
      <h1 className="font-heading text-3xl font-semibold text-brand-navy">
        Welcome, {firstNameOf(session?.user?.name)}
      </h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard icon={Users} label="Total People" value={memberCount} />
        <StatCard icon={Home} label="Total Households" value={householdCount} />
      </div>

      <form
        action="/people"
        method="GET"
        className="mt-8 flex max-w-[440px] items-center gap-2.5 rounded-[10px] border border-[#E5DCC8] bg-white px-4 py-[11px] shadow-[0_1px_2px_rgba(26,58,92,0.04)]"
      >
        <Search className="h-4 w-4 shrink-0 text-[#97A9B8]" />
        <input
          type="text"
          name="search"
          placeholder="Search by name, email, or phone"
          className="w-full border-none bg-transparent text-[14.5px] text-brand-navy outline-none placeholder:text-[#97A9B8]"
        />
      </form>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ActionCard
          href="/people"
          icon={Users}
          title="Browse People"
          description="Search and view the church directory."
        />
        <ActionCard
          href="/households"
          icon={Home}
          title="Browse Households"
          description="View families and household groupings."
        />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="flex items-center gap-4 rounded-[14px] border border-[#EAE2D0] bg-white p-5 shadow-[0_1px_3px_rgba(26,58,92,0.05)]">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-sky/[0.12] text-brand-sky">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-heading text-2xl font-semibold text-brand-navy">{value}</div>
        <div className="text-[13px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function ActionCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-[14px] border border-[#EAE2D0] bg-white p-5 shadow-[0_1px_3px_rgba(26,58,92,0.05)] transition hover:shadow-[0_2px_8px_rgba(26,58,92,0.1)]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-sky/[0.12] text-brand-sky">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-[15px] font-semibold text-brand-navy">{title}</div>
        <div className="text-[13px] text-muted-foreground">{description}</div>
      </div>
    </Link>
  );
}
