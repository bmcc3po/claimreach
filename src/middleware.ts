import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Refresh the Supabase session on every request and guard route groups.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isAuthPage = path === "/login" || path === "/firm-login" || path.startsWith("/auth");
  const isProtected =
    path.startsWith("/leads") || path.startsWith("/intake") || path.startsWith("/portal");
  // Only the auth-gated routes use the session in this middleware. Skip the
  // Supabase round-trip on every other route so a cold edge instance isn't
  // paying for wasted work — it lowers per-request cost and cold-start time.
  if (!isProtected && !isAuthPage) return NextResponse.next({ request: req });

  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(toSet: { name: string; value: string; options?: any }[]) {
          toSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && isProtected) {
    const url = req.nextUrl.clone();
    url.pathname = path.startsWith("/portal") ? "/firm-login" : "/login";
    return NextResponse.redirect(url);
  }
  if (user && isAuthPage && !path.startsWith("/auth")) {
    const url = req.nextUrl.clone();
    url.pathname = "/leads";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
