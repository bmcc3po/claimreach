import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAudit } from "@/lib/audit";
import { fieldLabelMap } from "@/lib/questionnaire";
import { coercePropCol, splitStayMonth } from "@/lib/claim-properties";

export const runtime = "edge";

function fmt(v: any): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// POST { claim_id, firm_id, answers, properties[] }
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { claim_id, firm_id, answers, properties } = await req.json();
  if (!claim_id) return NextResponse.json({ error: "claim_id required" }, { status: 400 });

  // Fetch existing claim (lead linkage + prior answers for diffing).
  const { data: claim } = await sb.from("claims").select("lead_id, answers, status, updated_at").eq("id", claim_id).maybeSingle();
  const prior: Record<string, any> = (claim?.answers as any) ?? {};
  // MERGE, never replace. Different surfaces (Guided, All sections, the call
  // console) send different subsets of keys; a save that omits a key must not
  // delete an answer another surface already captured (Astra audit, Sep 27:
  // a saved safety-gate answer was wiped by an All-sections save). Clearing a
  // field still works: the client sends the key with an empty value.
  const sent: Record<string, any> = answers ?? {};
  const next: Record<string, any> = { ...prior, ...sent };

  // Save answers. Move the claim to "contacting" (a real status key) only when it
  // is still at the very start (new/blank). Never downgrade a file that has moved
  // further along the pipeline (esign_sent, signed_*, qa, approved, etc.), since
  // a mid-pipeline intake edit must not reset its status.
  const START_STATUSES = new Set(["new", "", null as any, undefined as any]);
  // Optimistic revision: the update only lands on the version we merged
  // against (updated_at is touched by trigger on every write). A concurrent
  // save from another screen re-reads and re-merges instead of overwriting it
  // (Astra review, Sep 27: out-of-order saves could restore old answers).
  let merged = next;
  let seen = claim?.updated_at ?? null;
  let wrote = false;
  for (let attempt = 0; attempt < 4 && !wrote; attempt++) {
    const patch: any = { answers: merged };
    if (START_STATUSES.has(claim?.status as any)) patch.status = "contacting";
    let q = sb.from("claims").update(patch).eq("id", claim_id);
    q = seen === null ? q.is("updated_at", null) : q.eq("updated_at", seen);
    const { data: hit, error: cErr } = await q.select("id").maybeSingle();
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    if (hit) { wrote = true; break; }
    const { data: fresh, error: rErr } = await sb.from("claims").select("answers, updated_at").eq("id", claim_id).maybeSingle();
    if (rErr || !fresh) return NextResponse.json({ error: rErr?.message || "claim disappeared mid-save" }, { status: 500 });
    merged = { ...((fresh.answers as any) ?? {}), ...sent };
    seen = fresh.updated_at ?? null;
  }
  if (!wrote) return NextResponse.json({ error: "The file is being saved from another screen right now. Try again." }, { status: 409 });

  if (Array.isArray(properties)) {
    // Whitelist writable columns server-side too. brand_mismatch is a GENERATED
    // column and must never be written; this guards against any caller (not just
    // the intake UI) sending it and failing the whole insert.
    const WRITABLE_PROP_COLS = new Set([
      "canonical_id", "sequence_order", "remembered_brand", "current_brand",
      "name_as_recalled", "address", "cross_streets", "city", "state",
      "place_id", "lat", "lng", "loc_confidence", "landmarks",
      "stay_month", "stay_year", "stay_duration", "room_floor", "age_at_time",
      "under_18", "acts_count_here", "who_booked_paid", "payment_method",
      "men_per_day", "asked_staff_for_help", "asked_whom", "police_emt_called",
      "repeatedly_same_motel", "specific_rooms_req", "room_change_freq",
      "visitors_check_desk", "men_waiting_areas", "housekeeping_entered",
      "towel_change_freq", "sheet_change_freq", "dnd_long_periods", "condoms_visible",
      "staff_interact_traffk", "staff_interact_victim", "mgmt_intervened",
      "violence_public_areas", "drug_paraphernalia", "staff_witnessed_drugs",
      "staff_knowledge_other", "has_variance", "variance_notes",
      "variance_trafficker", "variance_control",
    ]);
    // Build fully type-coerced rows BEFORE any destructive write. A "MM/YYYY"
    // month-year string headed for the stay_month int column (and empty strings
    // headed for any int/bool/jsonb column) are converted here, so the insert
    // cannot fail on a type cast after we have already removed the old rows.
    const rows = properties.map((p: any, i: number) => {
      const clean: Record<string, any> = {};
      const custom: Record<string, any> = {};
      const derived = splitStayMonth(p.stay_month); // "10/1977" -> { month: 10, year: 1977 }
      for (const k of Object.keys(p)) {
        if (k === "custom") continue;
        if (WRITABLE_PROP_COLS.has(k)) {
          const c = coercePropCol(k, p[k]);
          if (c !== undefined) clean[k] = c; // undefined => omit, let DB default / NULL apply
        } else if (k !== "name" && k !== "place_id_display") {
          custom[k] = p[k]; // imported-form fields
        }
      }
      // The UI carries month+year in one field; persist the year column too.
      if (clean.stay_year === undefined && derived.year != null) clean.stay_year = derived.year;
      // Merge any custom bag the client already sent.
      const mergedCustom = { ...(p.custom && typeof p.custom === "object" ? p.custom : {}), ...custom };
      return { ...clean, custom: mergedCustom, claim_id, firm_id, sequence_order: i + 1 };
    });

    // Non-destructive replace. The old code did delete()-then-insert(), so any
    // failed insert (e.g. the stay_month cast) left the claim with ZERO
    // properties — silent data loss on a victim's intake. Instead: capture the
    // current rows, insert the new set, and only delete the old rows once the
    // insert has succeeded. On insert error we return early, data untouched.
    let insertedIds: string[] = [];
    if (rows.length) {
      const { data: ins, error: pErr } = await sb.from("claim_properties").insert(rows).select("id");
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
      insertedIds = (ins ?? []).map((r: any) => r.id);
    }
    // Converge instead of racing: everything on this claim that is NOT part of
    // the set we just wrote goes. Two overlapping saves end with one set, not
    // a doubled one (Astra review, Sep 27).
    let del = sb.from("claim_properties").delete().eq("claim_id", claim_id);
    if (insertedIds.length) del = del.not("id", "in", `(${insertedIds.join(",")})`);
    const { error: dErr } = await del;
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  // ---- Field-level audit: diff prior vs next, log each change with old→new ----
  const labels = fieldLabelMap();
  const keys = new Set([...Object.keys(prior), ...Object.keys(merged)]);
  const actor_name = me.full_name ?? "Staff";
  let changeCount = 0;

  for (const k of keys) {
    const before = prior[k];
    const after = merged[k];
    const same = JSON.stringify(before ?? null) === JSON.stringify(after ?? null);
    if (same) continue;
    changeCount++;

    const label = labels[k] ?? k;
    const had = before !== undefined && before !== null && before !== "";
    const has = after !== undefined && after !== null && after !== "";

    let category = "change";
    let description = "";
    if (!had && has) { category = "entered"; description = `entered "${label}": ${fmt(after)}`; }
    else if (had && !has) { category = "deleted"; description = `deleted "${fmt(before)}" from "${label}"`; }
    else { category = "change"; description = `changed "${label}" from "${fmt(before)}" to "${fmt(after)}"`; }

    await recordAudit({
      firm_id, lead_id: claim?.lead_id ?? undefined, claim_id,
      actor: auth.user.id, actor_name, category, description,
      meta: { field: k, before, after },
    });
  }

  // If nothing field-level changed but properties did, still note it.
  if (changeCount === 0 && Array.isArray(properties)) {
    await recordAudit({
      firm_id, lead_id: claim?.lead_id ?? undefined, claim_id,
      actor: auth.user.id, actor_name, category: "change",
      description: `updated properties (${properties.length})`,
    });
  }

  return NextResponse.json({ ok: true, changes: changeCount });
}
