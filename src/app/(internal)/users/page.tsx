export const runtime = "edge";
import UserManager from "@/components/UserManager";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";

export default async function UsersPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  const { data: me } = await sb.from("app_users").select("role, perm_overrides").eq("id", user!.id).maybeSingle();
  const canManage = me && (["owner", "admin"].includes(me.role) || me.perm_overrides?.["users.manage"]);
  if (!canManage) {
    return <div className="card" style={{ padding: 20 }}><h2>Users</h2><p className="muted">You don't have permission to manage users.</p></div>;
  }
  const { data: firms } = await sb.from("firms").select("id, name, slug").order("name");
  return <UserManager firms={firms ?? []} />;
}
