export const runtime = "edge";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { requireM6Session } from "@/lib/m6-scope";
import { loadAuditFile } from "@/lib/m6-audit-server";
import AuditFile from "@/components/m6/AuditFile";

export const metadata = { title: "File audit" };

export default async function AuditFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) notFound();

  const nowIso = new Date().toISOString();
  const file = await loadAuditFile(sb, id, session.tmpFirmId, nowIso);
  if (!file) notFound();

  return (
    <AuditFile
      lead={file.lead}
      row={file.row}
      timeline={file.timeline}
      upcoming={file.upcoming}
      neosReady={file.neosReady}
      neosLinked={file.neosLinked}
    />
  );
}
