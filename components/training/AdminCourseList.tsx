"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendJson, useAdminCourses } from "@/hooks/useTraining";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function AdminCourseList() {
  const { data, mutate } = useAdminCourses();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const course = await sendJson("/api/admin/training/courses", "POST", { title, slug: slugify(title) });
      await mutate();
      router.push(`/settings/training/${course.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create course");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-[22px] font-semibold text-brand-navy">Manage training</h1>
      <div className="mt-6 flex gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New course title (e.g. Membership Group)" />
        <Button onClick={create} disabled={busy || !slugify(title)}>
          Create course
        </Button>
      </div>
      <ul className="mt-6 divide-y rounded-xl bg-card ring-1 ring-foreground/10">
        {data?.courses.map((c) => (
          <li key={c.id}>
            <Link href={`/settings/training/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted">
              <span className="font-medium">{c.title}</span>
              <span className="text-xs text-muted-foreground">{c.published ? "Published" : "Draft"}</span>
            </Link>
          </li>
        ))}
        {data?.courses.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">No courses yet.</li>}
      </ul>
    </div>
  );
}
