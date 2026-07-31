import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_MODES = ["plan", "execute", "auto"];

function sanitize(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => typeof m === "string" && m.trim())
    .map((m) => m.trim());
}

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({
      taskRouting: settings.taskRouting || { enabled: false, execution: [], planning: [], autoRouteByTools: true },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const current = (await getSettings()).taskRouting || {};

    const next = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
      execution: body.execution !== undefined ? sanitize(body.execution) : (current.execution || []),
      planning: body.planning !== undefined ? sanitize(body.planning) : (current.planning || []),
      autoRouteByTools: typeof body.autoRouteByTools === "boolean" ? body.autoRouteByTools : (current.autoRouteByTools !== false),
    };

    const updated = await updateSettings({ taskRouting: next });
    return NextResponse.json({ taskRouting: updated.taskRouting });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
