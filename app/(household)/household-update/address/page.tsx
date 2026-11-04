import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHouseholdPage } from "@/lib/householdPageGuard";
import { loadPortal } from "@/lib/householdPortal";
import { AddressForm } from "@/components/household/AddressForm";

export default async function AddressPage() {
  const session = await requireHouseholdPage("household-address");
  const view = await loadPortal(session.householdId);
  if (!view) notFound();
  const { address } = view;

  return (
    <div className="space-y-4">
      <Link href="/household-update" className="text-sm text-muted-foreground underline">← Back to household</Link>
      <h1 className="font-heading text-2xl font-semibold text-brand-navy">Household address</h1>
      <p className="text-sm text-muted-foreground">One address is shared by everyone in your household.</p>
      <AddressForm
        hasPendingChanges={address.hasPendingChanges}
        initial={{ street: address.street, city: address.city, state: address.state, postal_code: address.postal_code }}
      />
    </div>
  );
}
