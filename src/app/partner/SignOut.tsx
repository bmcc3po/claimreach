"use client";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function SignOut() {
  const router = useRouter();
  return <button type="button" onClick={async () => {
    await supabaseBrowser().auth.signOut();
    router.replace('/partner-login');
    router.refresh();
  }}>Sign out</button>;
}
