import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { resolveChoiceFieldMeta } from "@/lib/subsplash";
import { SUBSPLASH_STATUS_LABEL } from "@/lib/trainingLogic";
import { getCourse } from "@/lib/training";

// Discovers (and caches) the course field's write metadata. Subsplash has no
// custom-field-definitions endpoint, so this only succeeds once both
// choices have been set on some profile at least once.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const course = await getCourse(params.id);
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!course.subsplashFieldName) {
    return NextResponse.json({ error: "This course has no Subsplash field name set" }, { status: 400 });
  }
  const wanted = Object.values(SUBSPLASH_STATUS_LABEL);
  const meta = await resolveChoiceFieldMeta(course.subsplashFieldName, wanted);
  const found = meta ? wanted.filter((w) => !!meta.choiceIds[w]) : [];
  return NextResponse.json({
    fieldName: course.subsplashFieldName,
    fieldFound: !!meta?.revisionId,
    choicesFound: found,
    choicesMissing: wanted.filter((w) => !found.includes(w)),
  });
}
