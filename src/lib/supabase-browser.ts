import { createBrowserClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client — anon key only, RLS enforced. Safe in "use client" files.
export function supabaseBrowser() {
  return createBrowserClient(URL, ANON);
}
