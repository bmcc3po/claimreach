export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import { requireM6Session } from "@/lib/m6-scope";
import { isInternalRole } from "@/lib/permissions";
import { PFS_FORM_KEY, pfsAskable } from "@/lib/pfs";
import type { Field } from "@/lib/questionnaire";
import PfsDesk from "@/components/m6/PfsDesk";

export const metadata = { title: "Fact sheet" };

export default async function M6PfsPage() {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return null;
  const canImport = isInternalRole(session.user.role)
    && ["owner", "admin", "manager"].includes(session.user.role);

  let form: { name: string; question_count: number; updated_at: string | null } | null = null;
  const { data } = await sb.from("intake_forms")
    .select("name, fields, updated_at")
    .eq("claim_type", PFS_FORM_KEY)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.fields && Array.isArray(data.fields)) {
    form = {
      name: data.name,
      question_count: pfsAskable(data.fields as Field[]).length,
      updated_at: data.updated_at ?? null,
    };
  }

  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Fact sheet</h1>
        <p className="m6-sub">The judge&apos;s questions. Same answers table as intake. Motel 6 only.</p>
      </div>
      <PfsDesk form={form} canImport={canImport} />
    </div>
  );
}
