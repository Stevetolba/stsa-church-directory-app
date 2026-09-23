"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { useTrainingCourses } from "@/hooks/useTraining";
import { EmptyState } from "@/components/EmptyState";

const STATUS_LABEL = { not_started: "Not started", in_progress: "In progress", completed: "Completed" } as const;
const STATUS_STYLE = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
} as const;

export function TrainingCatalog({ isAdmin }: { isAdmin: boolean }) {
  const { data, error, isLoading } = useTrainingCourses();
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-[22px] font-semibold text-brand-navy">Training</h1>
        {isAdmin && (
          <Link href="/settings/training" className="text-sm font-medium text-brand-navy underline">
            Manage courses
          </Link>
        )}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-red-700">Could not load courses.</p>}
      {data && data.courses.length === 0 && (
        <EmptyState icon={<GraduationCap className="h-5 w-5" />} message="No courses yet — courses you're invited to will appear here." />
      )}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {data?.courses.map(({ course, lessonCount, completedLessons, status }) => {
          const pct = lessonCount ? Math.round((completedLessons / lessonCount) * 100) : 0;
          return (
            <Link
              key={course.id}
              href={`/training/${course.slug}`}
              className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
            >
              {course.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={course.coverImageUrl} alt="" className="aspect-video w-full object-cover" />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-brand-navy text-brand-cream">
                  <GraduationCap className="h-10 w-10" />
                </div>
              )}
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-heading text-base font-semibold text-brand-navy">{course.title}</h2>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                {!course.published && <p className="text-xs font-medium text-amber-700">Unpublished (admins only)</p>}
                {course.description && <p className="line-clamp-2 text-sm text-muted-foreground">{course.description}</p>}
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-brand-sky" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {completedLessons} of {lessonCount} lessons
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
