import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveFirmHome } from "@/lib/firm-home";
import { bouncePath, isSafeFirmNext } from "@/lib/m6";

function isAuthPage(path: string) {
  return path === "/login" || path === "/firm-login" || path.startsWith("/auth");
}

function isPublicAsset(path: string) {
  if (path === "/manifest.json" || path === "/favicon.ico" || path === "/robots.txt") return true;
  return /\.(?:png|jpe?g|gif|svg|webp|ico|txt|xml|woff2?|css|js|map)$/i.test(path);
}

function isPublicPath(path: string) {
  if (isAuthPage(path)) return true;
  if (path.startsWith("/sign")) return true; // claimant e-sign stays public
  if (isPublicAsset(path)) return true;
  return false;
}

// Refresh the Supabase session on every gated request and guard route groups.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const authPage = isAuthPage(path);
  const isProtected = !isPublicPath(path);
  // Skip the Supabase round-trip on public assets and /sign so a cold edge
  // instance isn't paying for wasted work.
  if (!isProtected && !authPage) return NextResponse.next({ request: req });

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
    // /m6 is worked by BOTH sides, so it cannot assume a staff login. Send
    // people to the firm login, which the Turnbull team already uses; staff
    // accounts sign in there too.
    const firmApp = path.startsWith("/portal") || path.startsWith("/m6");
    url.pathname = firmApp ? "/firm-login" : "/login";
    url.search = "";
    if (firmApp) {
      const keep = isSafeFirmNext(path);
      if (keep) url.searchParams.set("next", keep);
    }
    return NextResponse.redirect(url);
  }

  if (user) {
    const onLogin = authPage && !path.startsWith("/auth");
    const onWrongHub = path === "/dashboard" || path === "/";
    if (onLogin || onWrongHub) {
      const { data: me } = await supabase.from("app_users").select("role").eq("id", user.id).maybeSingle();
      const home = await resolveFirmHome(supabase, {
        role: me?.role,
        email: user.email,
        requestedNext: onLogin ? req.nextUrl.searchParams.get("next") : null,
      });
      const dest = onLogin
        ? home
        : bouncePath(path, {
            signedIn: true,
            role: me?.role ?? null,
            isM6Recipient: home === "/m6" || !!home?.startsWith("/m6/"),
          });
      if (dest && dest !== path) {
        const url = req.nextUrl.clone();
        url.pathname = dest;
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
