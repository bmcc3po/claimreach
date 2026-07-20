import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Server client — reads the user's session from cookies. RLS applies as the
// logged-in user. Server Components and route handlers only. cookies() is async
// in Next 15.
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(toSet: { name: string; value: string; options?: any }[]) {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch { /* no writable cookie store in a Server Component; middleware handles refresh */ }
      },
    },
  });
}

// Service-role admin client — BYPASSES RLS. SERVER ONLY. Never import into a
// "use client" file. For trusted system writes (canonical counters, webhook ingest).
export function supabaseAdmin() {
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}
