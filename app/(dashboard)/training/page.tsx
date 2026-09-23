import { auth } from "@/lib/auth";
import { TrainingCatalog } from "@/components/training/TrainingCatalog";

export default async function TrainingPage() {
  const session = await auth();
  return <TrainingCatalog isAdmin={session?.user?.role === "admin"} />;
}
