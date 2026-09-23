import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminCourseEditor } from "@/components/training/AdminCourseEditor";

export default async function TrainingCourseEditorPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return <AdminCourseEditor id={params.id} />;
}
