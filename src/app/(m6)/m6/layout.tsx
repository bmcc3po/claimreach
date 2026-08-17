export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import M6Nav from "@/components/m6/M6Nav";

// The retention app is deliberately open to BOTH sides: Innovative staff and
// TMP's firm users work the same files here. Row-level security still governs
// what each one can write; this gate only decides who gets in the door.
export default async function M6Layout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/firm-login");

  const { data: me } = await sb.from("app_users")
    .select("id, role, full_name, firm_id").eq("id", user.id).maybeSingle();
  if (!me) redirect("/firm-login");

  return (
    <M6Nav userName={me.full_name ?? "You"} role={me.role}>
      {children}
    </M6Nav>
  );
}
