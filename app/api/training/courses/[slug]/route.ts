import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/rbac";
import { getCourseView } from "@/lib/training";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const actor = await requireSignedIn();
  if (actor instanceof NextResponse) return actor;
  const view = await getCourseView(actor, params.slug);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(view);
}
