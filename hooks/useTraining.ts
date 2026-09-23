"use client";

import useSWR from "swr";
import type { ProgressReport } from "@/lib/trainingReport";
import type { CourseSummary, CourseView, Course, Lesson, Question, RosterRow } from "@/lib/training";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function useTrainingCourses() {
  return useSWR<{ courses: CourseSummary[] }>("/api/training/courses", fetcher);
}

export function useCourseView(slug: string) {
  return useSWR<CourseView>(`/api/training/courses/${slug}`, fetcher);
}

export type AdminLesson = Lesson & { questions: Question[] };

export function useAdminCourses() {
  return useSWR<{ courses: Course[] }>("/api/admin/training/courses", fetcher);
}

export function useAdminCourse(id: string) {
  return useSWR<{ course: Course; lessons: AdminLesson[] }>(`/api/admin/training/courses/${id}`, fetcher);
}

export function useRoster(id: string) {
  return useSWR<{ roster: RosterRow[] }>(`/api/admin/training/courses/${id}/roster`, fetcher);
}

export function useProgressReport(id: string) {
  return useSWR<ProgressReport>(`/api/admin/training/courses/${id}/report`, fetcher);
}

export async function sendJson(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed: ${res.status}`);
  return data;
}
