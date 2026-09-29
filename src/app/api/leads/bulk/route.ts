import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { isInternalRole } from "@/lib/permissions";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { recordAudit } from "@/lib/audit";
export const runtime = "edge";

// Bulk operations on selected leads. Body: { op, ids:[], ...args }
// ops: set_status, set_stage, assign, move_firm, delete
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("id, role, perm_overrides, active").eq("id", auth.user.id).maybeSingle();
  const isStaff = isInternalRole(me?.role) && me?.active !== false;
  if (!isStaff) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const canDelete = me && (["owner", "admin"].includes(me.role) || me.perm_overrides?.["leads.delete"]);

  const b = await req.json();
  const ids: string[] = Array.isArray(b.ids) ? b.ids.filter(Boolean) : [];
  if (ids.length === 0) return NextResponse.json({ error: "no leads selected" }, { status: 400 });

  try {
    if (b.op === "set_stage") {
      const { error } = await sb.from("leads").update({ stage: b.stage }).in("id", ids);
      if (error) throw error;
      return NextResponse.json({ ok: true, count: ids.length });
    }
    if (b.op === "assign") {
      const { error } = await sb.from("leads").update({ assigned_agent: b.agentId || null }).in("id", ids);
      if (error) throw error;
      return NextResponse.json({ ok: true, count: ids.length });
    }
    if (b.op === "move_firm") {
      // Moving a file between firms rewires who may see it: owner/admin only.
      // ONE transaction moves the whole graph — lead, claims, documents,
      // signings, communications, notes, QA, activity — so a failure moves
      // nothing instead of leaving a half-owned file (Astra rounds 4-5).
      if (!["owner", "admin"].includes(me!.role)) return NextResponse.json({ error: "Only an owner or admin can move files between firms." }, { status: 403 });
      if (!b.firmId) return NextResponse.json({ error: "Pick the firm to move to." }, { status: 400 });
      // A complete transfer needs the file's new campaign at the new firm
      // (Astra round 6: campaign relationships were left pointing at the old
      // firm). The database refuses a campaign from another firm.
      if (!b.campaignId) return NextResponse.json({ error: "Pick the campaign at the new firm these files move into." }, { status: 400 });
      const { supabaseAdmin } = await import("@/lib/supabase-server");
      return await moveFirm(supabaseAdmin(), ids, String(b.firmId), String(b.campaignId), auth.user.id);
    }
    if (b.op === "set_status") {
      // status lives on the claim; the helper enforces the DQ-reason gate and audits.
      const { data: meName } = await sb.from("app_users").select("full_name").eq("id", auth.user.id).maybeSingle();
      // An explicit lead-wide command: every matter on every selected file.
      const res = await setClaimStatusForLeads({
        leadIds: ids, leadWide: true,
        status: b.status,
        dqReasonKey: b.dq_reason_key ?? null,
        dqNote: b.dq_note ?? null,
        actorId: auth.user.id,
        actorName: meName?.full_name ?? "User",
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json({ ok: true, count: ids.length });
    }
    // "Delete" archives. The row survives, hidden, for at least 90 days, because
    // a mis-clicked checkbox on a bulk selection used to destroy signed files
    // and everything attached to them with no way back.
    if (b.op === "delete" || b.op === "archive") {
      if (!canDelete) return NextResponse.json({ error: "no delete permission" }, { status: 403 });
      const { error } = await sb.from("leads")
        .update({ archived_at: new Date().toISOString(), archived_by: auth.user.id, archive_reason: b.reason ?? null })
        .in("id", ids);
      if (error) throw error;
      return NextResponse.json({ ok: true, count: ids.length, archived: true });
    }

    if (b.op === "restore") {
      if (!canDelete) return NextResponse.json({ error: "no delete permission" }, { status: 403 });
      const { error } = await sb.from("leads")
        .update({ archived_at: null, archived_by: null, archive_reason: null })
        .in("id", ids);
      if (error) throw error;
      return NextResponse.json({ ok: true, count: ids.length, restored: true });
    }

    // Permanent destruction. Owner only, archived only, and never as a first
    // action: a file has to have been archived before it can be destroyed.
    if (b.op === "purge") {
      if (me?.role !== "owner") {
        return NextResponse.json({ error: "Only the owner can permanently delete a file." }, { status: 403 });
      }
      const { data: rows } = await sb.from("leads").select("id, archived_at, lead_no").in("id", ids);
      const notArchived = (rows ?? []).filter((r: any) => !r.archived_at);
      if (notArchived.length) {
        return NextResponse.json({
          error: `Archive these first: ${notArchived.map((r: any) => r.lead_no).join(", ")}. Permanent deletion is only available on an already archived file.`,
        }, { status: 409 });
      }
      const { error } = await sb.from("leads").delete().in("id", ids);
      if (error) throw error;
      return NextResponse.json({ ok: true, count: ids.length, purged: true });
    }
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  } catch (e: any) {
    const raw = String(e?.message ?? "bulk failed");
    // A foreign key violation here means some child row still points at the
    // lead. The raw Postgres text names a constraint nobody recognizes, so say
    // what is actually blocking it instead.
    if (/foreign key|violates/i.test(raw)) {
      return NextResponse.json({
        error: "These leads have records attached that block deletion. Run the latest migrations, then try again. If it persists, tell me which lead IDs.",
        detail: raw,
      }, { status: 409 });
    }
    return NextResponse.json({ error: raw }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Firm transfer: COPY, then SWITCH, then clean up (Astra round 7b, G1).
//
// A storage call cannot join a database transaction. The old route moved each
// object first and tried to move it back when the SQL refused; when the move
// back failed it still said "Nothing moved" while the document sat at the new
// firm's path and the row pointed at the old one.
//
// Now the originals are never touched until the database has committed:
//   1. The target firm and campaign are checked before any storage call.
//   2. Each stored object is COPIED to <new firm>/<lead>/..., never over an
//      object already there. A failure removes the copies this request made
//      and stops before the database is asked.
//   3. ONE transaction (move_leads_to_firm) re-points every row, under the
//      unchanged storage guard.
//   4. Only then are the originals removed.
// At every step the rows point at an object that exists, so an interruption
// anywhere leaves every document readable. Every removal is checked on its
// own; anything left behind is named in the answer and in the activity log,
// and is never reported as "Nothing moved".
// ---------------------------------------------------------------------------
const CASE_DOCS = "case-docs";

type Leftover = { path: string; error: string };
type FileOf = { lead_id: string; firm_id: string | null };

function errText(e: any): string {
  return String(e?.message || e || "unknown error");
}

function copiesWord(n: number): string {
  return n === 1 ? "1 copy" : `${n} copies`;
}

/** Remove each path on its own so every result is checked and a failure
 *  names exactly which object is left. A thrown error is a failure too. */
async function removeEach(bucket: any, paths: string[]): Promise<Leftover[]> {
  const failed: Leftover[] = [];
  for (const p of paths) {
    try {
      const { error } = await bucket.remove([p]);
      if (error) failed.push({ path: p, error: errText(error) });
    } catch (e: any) {
      failed.push({ path: p, error: errText(e) });
    }
  }
  return failed;
}

/** One activity-log entry per file that has objects needing cleanup. */
async function auditLeftovers(opts: {
  paths: Leftover[]; fileOf: Map<string, FileOf>; firmIdFor: (f: FileOf) => string | null;
  actor: string; description: (n: number) => string; meta: Record<string, any>;
}) {
  const byLead = new Map<string, { file: FileOf; items: Leftover[] }>();
  for (const x of opts.paths) {
    const file = opts.fileOf.get(x.path) ?? { lead_id: "", firm_id: null };
    const entry = byLead.get(file.lead_id) ?? { file, items: [] };
    entry.items.push(x);
    byLead.set(file.lead_id, entry);
  }
  for (const { file, items } of byLead.values()) {
    await recordAudit({
      firm_id: opts.firmIdFor(file), lead_id: file.lead_id || undefined, actor: opts.actor,
      category: "system", description: opts.description(items.length),
      meta: { ...opts.meta, leftover_paths: items.map((i) => i.path), errors: items.map((i) => i.error) },
    });
  }
}

/** After the transaction answered with an error: did it commit anyway (an
 *  answer lost on the way back)? The transaction moves every lead together,
 *  so the leads' firm and campaign say which side of it we are on. */
async function transferCommitted(admin: any, ids: string[], firmId: string, campaignId: string):
  Promise<{ state: "committed"; count: number } | { state: "not" } | { state: "unknown"; why: string }> {
  try {
    const { data, error } = await admin.from("leads").select("id, firm_id, campaign_id").in("id", ids);
    if (error) return { state: "unknown", why: errText(error) };
    const rows = (data ?? []) as any[];
    if (rows.length && rows.every((r) => r.firm_id === firmId && r.campaign_id === campaignId)) {
      return { state: "committed", count: rows.length };
    }
    return { state: "not" };
  } catch (e: any) {
    return { state: "unknown", why: errText(e) };
  }
}

async function moveFirm(admin: any, ids: string[], firmId: string, campaignId: string, actor: string) {
  // 1. The target, before anything in storage is touched.
  const { data: firm, error: fErr } = await admin.from("firms").select("id").eq("id", firmId).maybeSingle();
  if (fErr) return NextResponse.json({ error: `Nothing moved: could not check the firm (${fErr.message}).` }, { status: 500 });
  if (!firm) return NextResponse.json({ error: "Nothing moved: that firm no longer exists. Refresh and pick the firm again." }, { status: 400 });
  const { data: camp, error: cErr } = await admin.from("campaigns").select("id, firm_id").eq("id", campaignId).maybeSingle();
  if (cErr) return NextResponse.json({ error: `Nothing moved: could not check the campaign (${cErr.message}).` }, { status: 500 });
  if (!camp) return NextResponse.json({ error: "Nothing moved: that campaign no longer exists. Refresh and pick the campaign again." }, { status: 400 });
  if (camp.firm_id !== firmId) {
    return NextResponse.json({ error: "Nothing moved: that campaign belongs to a different firm. Pick a campaign at the firm these files are moving to." }, { status: 400 });
  }

  // 2. Every stored document on the selected files.
  const { data: docs, error: dErr } = await admin.from("case_documents").select("id, lead_id, firm_id, storage_path").in("lead_id", ids).not("storage_path", "is", null);
  if (dErr) return NextResponse.json({ error: `Nothing moved: could not read the files' documents (${dErr.message}).` }, { status: 500 });

  // The plan: every row gets its path under the new firm (the database
  // refuses the transfer unless every stored document has one). One copy per
  // stored object, even when two rows share it. A document already under the
  // target firm keeps its path and needs no copy.
  const docMoves: { id: string; new_path: string }[] = [];
  const copies = new Map<string, string>();
  const fileOf = new Map<string, FileOf>();
  for (const d of docs ?? []) {
    const from = String(d.storage_path);
    const prefix = `${d.firm_id}/${d.lead_id}/`;
    if (!from.startsWith(prefix)) {
      return NextResponse.json({ error: `Nothing moved: document ${d.id} is not stored under its file's folder, so it cannot be relocated safely.` }, { status: 409 });
    }
    const to = `${firmId}/${d.lead_id}/${from.slice(prefix.length)}`;
    docMoves.push({ id: d.id, new_path: to });
    const file = { lead_id: String(d.lead_id), firm_id: d.firm_id ?? null };
    fileOf.set(from, file);
    fileOf.set(to, file);
    if (to !== from && !copies.has(from)) copies.set(from, to);
  }

  const bucket = admin.storage.from(CASE_DOCS);
  const made: string[] = [];

  // Stop before (or instead of) the switch. Removes the copies this request
  // made, checking each one, and says exactly what is left.
  const abandon = async (why: string, status: number) => {
    const left = await removeEach(bucket, made);
    if (!left.length) {
      return NextResponse.json({ error: `Nothing moved: ${why}. No file changed firms and every document is still in its original place.` }, { status });
    }
    await auditLeftovers({
      paths: left, fileOf, firmIdFor: (f) => f.firm_id, actor,
      description: (n) => `A move to another firm did not happen, and ${copiesWord(n)} made in the new firm's folder could not be removed. They need cleanup. The file and its documents stayed where they were.`,
      meta: { op: "move_firm", outcome: "not_moved", target_firm_id: firmId, campaign_id: campaignId, reason: why },
    });
    return NextResponse.json({
      error: `The move did not happen: ${why}. No file changed firms and every document is still in its original place, but ${copiesWord(left.length)} made in the new firm's folder could not be removed and still need cleanup: ${left.map((x) => x.path).join(", ")}.`,
      leftover_copies: left.map((x) => x.path),
    }, { status: 500 });
  };

  // 3. Copy. Never overwrite: an object already at the destination is not
  // this request's to replace (it may be left from an earlier attempt).
  for (const [from, to] of copies) {
    let why: string | null = null;
    let status = 500;
    try {
      const ex = await bucket.exists(to);
      if (ex?.data === true) {
        why = `a file already exists at ${to} in the new firm's folder (it may be left from an earlier attempt), and it was not overwritten`;
        status = 409;
      } else {
        const { error } = await bucket.copy(from, to);
        if (error) why = `a document could not be copied to the new firm (${from}: ${errText(error)})`;
        else made.push(to);
      }
    } catch (e: any) {
      why = `a document could not be copied to the new firm (${from}: ${errText(e)})`;
    }
    if (why) return await abandon(why, status);
  }

  // 4. Switch: ONE transaction re-points every row under the unchanged guard.
  let count: number | null = null;
  let rpcError: string | null = null;
  try {
    const { data, error } = await admin.rpc("move_leads_to_firm", {
      p_lead_ids: ids, p_firm_id: firmId, p_campaign_id: campaignId, p_doc_moves: docMoves,
    });
    if (error) rpcError = errText(error);
    else count = typeof data === "number" ? data : ids.length;
  } catch (e: any) {
    rpcError = errText(e);
  }
  if (rpcError) {
    // An error answer is not proof that nothing committed. Deleting the
    // copies after a commit would leave rows pointing at nothing, so look.
    const seen = await transferCommitted(admin, ids, firmId, campaignId);
    if (seen.state === "not") return await abandon(`the database refused the move (${rpcError})`, 500);
    if (seen.state === "unknown") {
      if (made.length) {
        await auditLeftovers({
          paths: made.map((p) => ({ path: p, error: "kept: result unknown" })), fileOf, firmIdFor: (f) => f.firm_id, actor,
          description: (n) => `A move to another firm answered with an error and its result could not be confirmed. The original documents and ${copiesWord(n)} in the new firm's folder were both kept. One set needs cleanup once the file is checked.`,
          meta: { op: "move_firm", outcome: "unknown", target_firm_id: firmId, campaign_id: campaignId, reason: rpcError, check_error: seen.why },
        });
      }
      return NextResponse.json({
        error: `The database answered with an error (${rpcError}) and the result could not be confirmed (${seen.why}). Nothing was deleted: the original documents and ${copiesWord(made.length)} at the new firm were both kept, so the files open either way. Check where the files are before trying again.`,
        kept_copies: made,
      }, { status: 500 });
    }
    count = seen.count;
  }

  // 5. Committed. Now, and only now, the originals go.
  const stuck = await removeEach(bucket, [...copies.keys()]);
  const moved = count ?? ids.length;
  if (!stuck.length) return NextResponse.json({ ok: true, count: moved, documents_moved: copies.size });
  const oldWord = stuck.length === 1 ? "1 old copy" : `${stuck.length} old copies`;
  await auditLeftovers({
    paths: stuck, fileOf, firmIdFor: () => firmId, actor,
    description: (n) => `Moved to another firm. ${n === 1 ? "1 old copy" : `${n} old copies`} in the previous firm's folder could not be removed and need cleanup. Every document opens from its new place.`,
    meta: { op: "move_firm", outcome: "moved", target_firm_id: firmId, campaign_id: campaignId },
  });
  return NextResponse.json({
    ok: true, count: moved, documents_moved: copies.size,
    cleanup_pending: stuck.map((x) => x.path),
    warning: `The move is done: ${moved} file${moved === 1 ? "" : "s"} now belong${moved === 1 ? "s" : ""} to the new firm and every document opens from its new place. ${oldWord} in the previous firm's folder could not be removed and still need cleanup: ${stuck.map((x) => x.path).join(", ")}.`,
  });
}
