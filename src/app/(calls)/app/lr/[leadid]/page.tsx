export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { findByLawRulerId } from "@/lib/mva-call/server";
import LrWait from "@/components/calls/LrWait";

// claimreach.com/app/lr/<LawRuler lead ID>: the link in LawRuler's new-lead
// text. Opens that lead's call screen. When the text beats the webhook by a
// few seconds, this waits for the lead to land and then opens it.
export default async function LawRulerLink({ params }: { params: Promise<{ leadid: string }> }) {
  const { leadid } = await params;
  const id = decodeURIComponent(leadid || "").trim();
  const sb = await supabaseServer();
  const found = await findByLawRulerId(sb, id);
  if (found) redirect(`/app/${found.key}`);
  return <LrWait id={id} />;
}
