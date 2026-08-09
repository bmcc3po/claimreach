"use client";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function SignOut() {
  const router = useRouter();
  async function out() {
    await supabaseBrowser().auth.signOut();
    router.push("/login");
  }
  return <button className="btn ghost" onClick={out}>Sign out</button>;
}
