import { redirect } from "next/navigation";
import { getHouseholdSession } from "@/lib/householdSession";
import { HouseholdLogin } from "@/components/household/HouseholdLogin";

export default function HouseholdLoginPage() {
  if (getHouseholdSession()) redirect("/household-update");
  return <HouseholdLogin />;
}
