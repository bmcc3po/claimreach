import { workArea, scopeWorkArea, inWorkArea, areaHref } from '@/lib/work-area';
export const runtime = "edge";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { authUser } from "@/lib/auth-user";
import { supabaseServer } from "@/lib/supabase-server";
import { reportPages } from "@/lib/signature-report-loader";
import { isTestFile } from "@/lib/file-visibility";
import FileCleanup from "@/components/FileCleanup";

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const area = workArea((await searchParams).area);
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  if (!user) redirect("/login");
  const { data: me, error } = await sb.from("app_users").select("role,active").eq("id", user.id).maybeSingle();
  if (error || me?.role !== "owner" || me.active !== true) redirect("/dashboard");
  // Caller RLS stays in force. Only metadata needed to review a cleanup is
  // projected to the browser; answers, signatures and documents stay intact.
  const leads = await reportPages(() => scopeWorkArea(sb.from("leads")
    .select("id,lead_no,claimant_name,campaign,archived_at,archive_reason,vendor_fields,firms(name)")
    .order("id"), area));
  const rows = leads.filter(l => !!l.archived_at || isTestFile(l)).map(l => ({
    id: l.id, leadNo: l.lead_no || "File", name: l.claimant_name || "Name missing",
    campaign: l.campaign || "", firm: l.firms?.name || "", archivedAt: l.archived_at || null,
    reason: l.archive_reason || "", test: isTestFile(l),
  }));
  return <FileCleanup rows={rows} />;
}
