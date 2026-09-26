export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { findByLawRulerId } from "@/lib/mva-call/server";

// claimreach.com/leads/lr/<LawRuler lead ID>: the desktop site's twin of
// /app/lr/<id>. Opens the full file for that LawRuler lead.
export default async function LawRulerLead({ params }: { params: Promise<{ leadid: string }> }) {
  const { leadid } = await params;
  let id = String(leadid || "").trim();
  try { id = decodeURIComponent(id); } catch { /* as typed */ }
  const sb = await supabaseServer();
  const found = await findByLawRulerId(sb, id);
  if (found) redirect(`/leads/${found.key}`);
  return (
    <div className="card" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
      <h2 style={{ marginTop: 0 }}>LawRuler lead {id} is not here yet</h2>
      <p className="muted">LawRuler has not sent it over. It shows up here as soon as it does.</p>
      <p><a href={`/app/lr/${encodeURIComponent(id)}`}>Open it in the App and wait for it</a></p>
    </div>
  );
}
