import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminCourseList } from "@/components/training/AdminCourseList";

// Admin-only course authoring (ADR-0023). requireAdmin() on /api/admin/training/*
// is the real guard; this redirect just keeps non-admins off a page that would 403.
export default async function TrainingSettingsPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return <AdminCourseList />;
}
