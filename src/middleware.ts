import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveFirmHome } from "@/lib/firm-home";
import { bouncePath, isSafeFirmNext } from "@/lib/m6";
import { safeAppNext } from "@/lib/mva-call/links";
import { isInternalRole } from "@/lib/permissions";
import { isPartnerIdentity, partnerMayUsePath } from "@/lib/partner-access";

function isAuthPage(path: string) {
  return path === "/login" || path === "/firm-login" || path === "/partner-login" || path.startsWith("/auth");
}

function isPublicAsset(path: string) {
  if (path === "/manifest.json" || path === "/favicon.ico" || path === "/robots.txt") return true;
  return /\.(?:png|jpe?g|gif|svg|webp|ico|txt|xml|woff2?|css|js|map)$/i.test(path);
}

function isPublicPath(path: string) {
  if (isAuthPage(path)) return true;
  if (path.startsWith("/sign")) return true; // claimant e-sign stays public
  if (path.startsWith("/tools")) return true; // LawRuler property tool; page fail-closes on ?k=
  // Blank retainer PDFs DocuSeal fetches once during e-sign setup. Unguessable
  // folder, no client data. See src/lib/esign-packets.
  if (path.startsWith("/esign-src/") && path.endsWith(".pdf")) return true;
  if (isPublicAsset(path)) return true;
  return false;
}

// Refresh the Supabase session on every gated request and guard route groups.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const api = path.startsWith("/api/");
  const authPage = isAuthPage(path);
  const isProtected = !isPublicPath(path);
  // Skip the Supabase round-trip on public assets, /sign, and /tools so a cold edge
  // instance isn't paying for wasted work.
  if (!isProtected && !authPage && !api) return NextResponse.next({ request: req });

  let res = NextResponse.next({ request: req });
  if (path === "/partner" || path.startsWith("/partner/")) {
    res.headers.set("Cache-Control", "private, no-store");
  }

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

  // API routes have their own permission checks. This outer fence keeps an
  // external partner (or any authenticated user without an app_users profile)
  // from reaching a legacy handler that only excludes the "firm" role.
  // Unauthenticated webhooks and public signing endpoints continue to their
  // own route-level authentication unchanged.
  if (api) {
    if (!user) return res;
    if (isPartnerIdentity(user)) return new NextResponse("forbidden", { status: 403 });
    const { data: me, error } = await supabase.from("app_users")
      .select("id, active").eq("id", user.id).maybeSingle();
    if (error || !me || me.active === false) return new NextResponse("forbidden", { status: 403 });
    return res;
  }

  if (user && isPartnerIdentity(user) && !partnerMayUsePath(path)) {
    const url = req.nextUrl.clone();
    url.pathname = "/partner";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!user && isProtected) {
    const url = req.nextUrl.clone();
    // /m6 is worked by BOTH sides, so it cannot assume a staff login. Send
    // people to the firm login, which the Turnbull team already uses; staff
    // accounts sign in there too.
    const partnerApp = path === "/partner" || path.startsWith("/partner/");
    const firmApp = path.startsWith("/portal") || path.startsWith("/m6");
    url.pathname = partnerApp ? "/partner-login" : firmApp ? "/firm-login" : "/login";
    url.search = "";
    if (firmApp) {
      const keep = isSafeFirmNext(path);
      if (keep) url.searchParams.set("next", keep);
    }
    // A lead link from a text (/app/lr/<id>, /app/<id>) comes back to that
    // lead after sign-in instead of dropping them on the home screen.
    const appNext = safeAppNext(path + (req.nextUrl.search || ""));
    if (appNext) url.searchParams.set("next", appNext);
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
      const appNext = onLogin && isInternalRole(me?.role) ? safeAppNext(req.nextUrl.searchParams.get("next")) : null;
      const dest = onLogin
        ? (appNext || home)
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
  if (path === "/partner" || path.startsWith("/partner/")) {
    res.headers.set("Cache-Control", "private, no-store");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
