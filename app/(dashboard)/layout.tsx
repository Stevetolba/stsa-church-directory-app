import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // Middleware already redirects unauthenticated page requests to /login;
  // this is defense in depth (ADR-0005's spirit), not the primary guard.
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <Sidebar
        user={{
          name: session.user.name ?? session.user.email ?? "Staff",
          role: session.user.role,
          canEmailChildren: session.user.canEmailChildren,
        }}
      />
      <main className="min-w-0 flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-11 lg:pb-[60px] lg:pt-9">
        {children}
      </main>
    </div>
  );
}
