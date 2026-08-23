import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { ensureAppUser, resolveFirmHome } from "@/lib/firm-home";

export const runtime = "edge";

// Exchanges the magic-link / OAuth code for a session, then sends the user
// home. Firm provisioning is HERE: if app_users is missing, call
// provision_self_from_firm_access then land. RPC failure is returned as
// 500 — never swallowed. TMP m6 firm users land on /m6. Other firm users
// stay on /portal. Staff go to /dashboard.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const sb = await supabaseServer();
  if (code) {
    await sb.auth.exchangeCodeForSession(code);
  }
  const { data: { user } } = await sb.auth.getUser();
  let me: { role: string } | null = null;
  try {
    me = await ensureAppUser(sb, user);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not set up your account.";
    return new NextResponse(msg, {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const dest = (await resolveFirmHome(sb, {
    role: me?.role,
    email: user?.email,
    requestedNext: next,
  })) ?? "/firm-login";
  return NextResponse.redirect(`${origin}${dest}`);
}
