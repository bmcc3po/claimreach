import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { resolveSigningMatter } from "@/lib/mva-call/signing-matter";
import { resolveFormKey } from "@/lib/forms";
import { askRelay } from "@/lib/ai-relay";
import { STORY_FIELDS, STORY_ASSIST_SYSTEM, storySuggestions } from "@/lib/mva-call/story-assist";

export const runtime = "edge";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// Suggestions only. The agent accepts them through the existing call autosave,
// which retains concurrent edits and the pinned claim, and reports failures.
export async function POST(req: NextRequest) {
  const db = await supabaseServer(), actor = await requireStaff(db);
  if (!actor?.can("intake.fill")) return fail("This account cannot fill an intake.", 403);
  const b = await req.json().catch(() => null);
  const notes = typeof b?.notes === "string" ? b.notes.trim() : "";
  if (notes.length < 10 || notes.length > 12000) return fail("Add story notes (10–12,000 characters) first.", 400);
  if (!b?.lead_id || !b?.claim_id) return fail("Open the file's intake before using the story helper.", 400);
  const scoped = await resolveSigningMatter(db, String(b.lead_id), { claimId: String(b.claim_id) });
  if (!scoped.ok) return fail(scoped.error, scoped.status);
  const { lead, matter, campaignId } = scoped;
  const form = await resolveFormKey(db, lead.id, matter.claim.id);
  const { data: campaign, error } = await db.from("campaigns").select("id, name")
    .eq("id", campaignId).eq("firm_id", lead.firm_id).maybeSingle();
  if (error || !campaign || campaign.name !== "INNO MVA" || form !== "mva") return fail("The story helper is available inside INNO MVA.", 404);
  const answers = matter.claim.answers?.mva_call || {};
  if (String(answers.story?.text || "").trim() !== notes) return fail("Your latest story has not saved. Retry saving, then use Fill from story.", 409);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
  let answer: string;
  try {
    answer = await askRelay(STORY_ASSIST_SYSTEM, JSON.stringify({
      fields: STORY_FIELDS.map(({ path: _, ...field }) => field), notes,
    }), controller.signal);
  } catch { answer = ""; }
  finally { clearTimeout(timer); }
  if (!answer) return fail("The story helper is unavailable. Your notes are saved; you can fill the answers yourself.", 503);
  let parsed: any;
  try { parsed = JSON.parse(answer.replace(/^\s*\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60\s*$/, "")); }
  catch { return fail("The helper could not read those notes reliably. Your notes are saved.", 502); }
  return NextResponse.json({ suggestions: storySuggestions(parsed?.suggestions, notes, answers) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
