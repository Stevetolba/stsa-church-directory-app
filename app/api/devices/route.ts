import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/rbac";
import { createDeviceSetupCode, listDevices } from "@/lib/deviceAuth";

// ADR-0015 (Phase 3): admin-only device management — listing devices and
// generating a one-time setup code. Claiming that code (no session required)
// lives at /api/kiosk/claim; revoking an existing device is DELETE
// /api/devices/[id].

// GET /api/devices — list every device (claimed or still pending setup).
export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const devices = await listDevices();
  return NextResponse.json({ devices });
}

// POST /api/devices — generate a new device + one-time setup code.
export async function POST(request: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const session = await auth();
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const device = await createDeviceSetupCode(name, session!.user!.email!);
  return NextResponse.json({ device }, { status: 201 });
}
