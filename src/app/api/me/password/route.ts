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

  try {
    const admin = supabaseAdmin();
    const { data: updated, error } = await admin.auth.admin.updateUserById(user.id, {
      password: pw,
      app_metadata: { ...(user.app_metadata || {}), must_change_password: false },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (updated?.user?.id !== user.id || updated.user.app_metadata?.must_change_password !== false) {
      return NextResponse.json({ error: "Your password change was not confirmed. Stay on this screen and try again." }, { status: 502 });
    }
    // Page layouts and the database read trusted current Auth metadata. Check
    // it again before sending the user back to the protected application.
    const { data: checked, error: verifyError } = await admin.auth.admin.getUserById(user.id);
    if (verifyError || checked?.user?.id !== user.id || checked.user.app_metadata?.must_change_password !== false) {
      return NextResponse.json({ error: "Your password was updated, but the account unlock could not be confirmed. Stay on this screen and retry." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not confirm your password change. Stay on this screen and retry." }, { status: 502 });
  }
}
