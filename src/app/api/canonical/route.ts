import { NextResponse } from "next/server";
import { SPINE, CASE_PRESETS } from "@/lib/canonical-fields";
export const runtime = "edge";

// Serves the canonical dictionary for the Integrations docs + mapping UI.
export async function GET() {
  return NextResponse.json({
    spine: SPINE.map((f) => ({ id: f.id, label: f.label, kind: f.kind, group: f.group, sensitive: !!f.sensitive })),
    presets: CASE_PRESETS.map((p) => ({ key: p.key, label: p.label, family: p.family, defaultGates: p.defaultGates, extras: p.extras.map((f) => ({ id: f.id, label: f.label, kind: f.kind })) })),
  });
}
