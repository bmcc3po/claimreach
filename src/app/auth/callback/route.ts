import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { ensureAppUser, resolveFirmHome } from "@/lib/firm-home";

export const runtime = "edge";

// Exchanges the magic-link / OAuth code for a session, then sends the user
// home. If app_users is missing, 0088 RPC provision_self_from_firm_access
// heals from firm_access (trigger is the other belt). TMP m6 firm users
// land on /m6. Other firm users stay on /portal. Staff go to /dashboard.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const sb = await supabaseServer();
  if (code) {
    await sb.auth.exchangeCodeForSession(code);
  }
  const { data: { user } } = await sb.auth.getUser();
  const me = await ensureAppUser(sb, user);
  const dest = (await resolveFirmHome(sb, {
    role: me?.role,
    email: user?.email,
    requestedNext: next,
  })) ?? "/firm-login";
  return NextResponse.redirect(`${origin}${dest}`);
}
