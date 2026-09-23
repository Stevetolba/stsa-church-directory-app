import { CoursePlayer } from "@/components/training/CoursePlayer";

export default function CoursePage({ params }: { params: { slug: string } }) {
  return <CoursePlayer slug={params.slug} />;
}
