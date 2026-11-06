export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import { requireM6Session } from "@/lib/m6-scope";
import { loadAuditBoard, loadM6DripWording } from "@/lib/m6-audit-server";
import AuditBoard from "@/components/m6/AuditBoard";
import DripWordingList from "@/components/m6/DripWordingList";

export const metadata = { title: "Audit" };

export default async function AuditPage() {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return null;

  const nowIso = new Date().toISOString();
  const [board, drip] = await Promise.all([
    loadAuditBoard(sb, session.tmpFirmId, nowIso),
    loadM6DripWording(session.tmpFirmId),
  ]);

  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Audit</h1>
        <p className="m6-sub">
          Every Motel 6 file, every message and every update note in one place. Case work stays in Neos.
        </p>
      </div>

      {board.error && <p className="m6-error">Could not load the files: {board.error}</p>}
      {!board.neosReady && (
        <p className="m6-hint">Neos numbers are not switched on yet. Migration 0133 adds them.</p>
      )}

      <AuditBoard rows={board.rows} neosLinked={board.neosLinked} nowIso={nowIso} />

      <DripWordingList steps={drip} />
    </div>
  );
}
