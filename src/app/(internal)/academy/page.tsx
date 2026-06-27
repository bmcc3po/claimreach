export const runtime = "edge";
import CrissiAcademy from "@/components/CrissiAcademy";
import TrainingRecords from "@/components/TrainingRecords";
import { supabaseServer } from "@/lib/supabase-server";

export default async function AcademyPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("role").eq("id", user!.id).maybeSingle();
  const isManager = me?.role === "owner" || me?.role === "admin";
  return (
    <div>
      <CrissiAcademy />
      {isManager && <div style={{ marginTop: 28 }}><TrainingRecords /></div>}
    </div>
  );
}
