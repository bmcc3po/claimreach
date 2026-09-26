import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { passwordProblem } from "@/lib/password-rules";

export const runtime = "edge";

// POST /api/me/password  { password }
// First sign-in: set your own password. The must-change flag lives in the
// user's app_metadata, which only the server can write, so clearing it here is
// the only way past /set-password.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const pw = String(b?.password || "");
  const bad = passwordProblem(pw, user.email);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const { error } = await supabaseAdmin().auth.admin.updateUserById(user.id, {
    password: pw,
    app_metadata: { ...(user.app_metadata || {}), must_change_password: false },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
