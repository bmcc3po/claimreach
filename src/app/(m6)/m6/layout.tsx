export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { requireM6Session } from "@/lib/m6-scope";
import M6Nav from "@/components/m6/M6Nav";

// Innovative staff and TMP firm users work the same files here. Anyone else
// (a TMT firm user, a missing profile) is sent out — never shown an empty
// queue that looks like "you have no Motel 6 files."
export default async function M6Layout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) {
    redirect(session.dest === "firm-login" ? "/firm-login"
      : session.dest === "dashboard" ? "/dashboard"
      : "/portal");
  }

  return (
    <M6Nav userName={session.user.name ?? "You"} role={session.user.role}>
      {children}
    </M6Nav>
  );
}
