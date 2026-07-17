import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEvent } from "@/lib/events";
import { CheckInPageClient } from "@/components/CheckInPageClient";

export default async function CheckInPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const event = await getEvent(params.id);
  if (!event) notFound();

  return <CheckInPageClient event={event} role={session.user.role} />;
}
