import { NextRequest, NextResponse } from "next/server";
import { netflyContext, netflyMatter } from "@/lib/netfly-server";
import { NETFLY_ANSWER_KEY } from "@/lib/netfly-ontake";
import { NETFLY_NOTE_FIELDS, NETFLY_NOTES_SYSTEM, noteSuggestions } from "@/lib/netfly-note-suggestions";
import { askRelay } from "@/lib/ai-relay";
export const runtime = "edge";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
export async function POST(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx?.actor.can("intake.fill")) return fail("This account cannot fill a NETFLY intake.", 403);
  let body: any;
  try { body = await req.json(); } catch { return fail("Invalid request.", 400); }
  if (!["suggest", "apply"].includes(body.op)) return fail("Choose notes review or apply.", 400);
  const matter = await netflyMatter(ctx, String(body.file || ""));
  if (!matter) return fail("NETFLY file not found.", 404);
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes.length < 10 || notes.length > 5000) return fail("Add a little more to your notes (10–5,000 characters).", 400);
  const saved = (matter.claim.answers as any)?.[NETFLY_ANSWER_KEY] || {};
  if (String(saved.fields?.final_notes || "").trim() !== notes) return fail("Save your latest notes first, then try again.", 409);
  if (body.op === "suggest") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    let answer: string;
    try { answer = await askRelay(NETFLY_NOTES_SYSTEM, JSON.stringify({ fields: NETFLY_NOTE_FIELDS.map(({ id, kind, choices }) => ({ id, kind, choices })), notes }), controller.signal); }
    finally { clearTimeout(timer); }
    if (!answer) return fail("The notes helper is unavailable. Your notes are saved; you can keep using the quick choices.", 503);
    let parsed: any;
    try { parsed = JSON.parse(answer.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")); }
    catch { return fail("The helper could not read those notes reliably. Your notes are saved.", 502); }
    return NextResponse.json({ suggestions: noteSuggestions(parsed.suggestions, notes, saved.fields || {}) });
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await ctx.db.from("claims").select("answers, updated_at")
      .eq("id", matter.claim.id).eq("lead_id", matter.lead.id).eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id).single();
    if (current.error || !current.data) return fail("Could not check the latest answers.", 503);
    const all = (current.data.answers || {}) as Record<string, any>;
    const netfly = all[NETFLY_ANSWER_KEY] || {}, fields = netfly.fields || {};
    if (String(fields.final_notes || "").trim() !== notes) return fail("Your notes changed. Review fresh suggestions first.", 409);
    const accepted = noteSuggestions(body.suggestions, notes, fields);
    const nextFields = { ...fields, ...Object.fromEntries(accepted.map(row => [row.id, row.value])) };
    if (!accepted.length) return NextResponse.json({ applied: [], fields });
    const update = await ctx.db.from("claims").update({ answers: { ...all, [NETFLY_ANSWER_KEY]: {
      ...netfly, fields: nextFields, notes_assist: { at: new Date().toISOString(), by: ctx.actor.id,
        source: "agent_notes", confirmed: true, fields: accepted.map(({ id, value, evidence }) => ({ id, value, evidence })) },
    } }, updated_at: new Date().toISOString() })
      .eq("id", matter.claim.id).eq("lead_id", matter.lead.id).eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id)
      .eq("updated_at", current.data.updated_at).select("id").maybeSingle();
    if (update.error) return fail("Suggestions were not saved. Your notes are still on file.", 503);
    if (update.data) return NextResponse.json({ applied: accepted.map(row => row.id), fields: nextFields });
  }
  return fail("Another update arrived. Review your notes again.", 409);
}


