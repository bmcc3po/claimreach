import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
import { isInternalRole } from "@/lib/permissions";
import { resolveMatter, rowBelongsToMatter } from "@/lib/matter";
import { firmMatterReleased } from "@/lib/firm-release";
export const runtime = "edge";

// GET ?lead= : list docs (with signed URLs). POST: upload (multipart).
//
// Storage keys are authorized on their CANONICAL form (Astra round 3): a key
// that begins with the right "firm/lead/" prefix can still normalize to a
// different object if it carries traversal or encoding tricks, and the
// privileged storage client would happily sign it. So a key is only ever
// signed or written when it is already canonical AND belongs to the row's own
// firm and lead.
function canonicalKeyFor(row: { firm_id?: string | null; lead_id?: string | null; storage_path?: string | null }): string | null {
  const path = String(row.storage_path ?? "");
  if (!path || path.length > 512) return null;
  // No traversal, no doubled or leading separators, no backslashes, no
  // percent-encoding ambiguity, no control characters: the raw key must
  // already be its normal form. Legacy file names keep working; a key that
  // needs normalizing never gets signed.
  if (path.includes("..") || path.includes("//") || path.includes("\\") || path.startsWith("/") || /%|[\u0000-\u001f]/.test(path)) return null;
  const parts = path.split("/");
  if (parts.length < 3) return null;
  if (row.firm_id && parts[0] !== String(row.firm_id)) return null;
  if (row.lead_id && parts[1] !== String(row.lead_id)) return null;
  for (const seg of parts.slice(2)) if (!seg || seg.startsWith(".")) return null;
  return path;
}

// A file name becomes one safe path segment: printable basename, no
// separators, no dot-leading tricks.
function safeFileName(name: string): string {
  const base = String(name || "file").split(/[\\/]/).pop() || "file";
  const cleaned = base.replace(/[^A-Za-z0-9._ ()-]/g, "_").replace(/\.{2,}/g, ".").replace(/^\.+/, "");
  return (cleaned || "file").slice(0, 140);
}

const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Authorize with the session before signing storage objects. A firm's release
// applies to this claim, never to the latest/first sibling on the lead.
async function documentScope(sb: any, leadId: unknown, claimId: unknown, upload = false) {
  const user = await gateUser(sb);
  if (!user) return { ok: false as const, status: 401, error: "unauthorized" };
  if ((!isInternalRole(user.role) && user.role !== "firm") || !user.can(upload ? "docs.upload" : "leads.view")) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }
  if (!validId(leadId) || (claimId && !validId(claimId))) return { ok: false as const, status: 400, error: "A valid file and matter are required." };
  const { data: lead, error } = await sb.from("leads").select("id, firm_id, archived_at").eq("id", leadId).maybeSingle();
  if (error) return { ok: false as const, status: 503, error: "Could not verify the file. Try again." };
  if (!lead || !lead.firm_id || (user.role === "firm" && (lead.archived_at || lead.firm_id !== user.firmId))) {
    return { ok: false as const, status: 404, error: "File not available." };
  }
  const matter = await resolveMatter(sb, leadId, { claimId: typeof claimId === "string" ? claimId : null, authoritativeDb: supabaseAdmin() });
  if (!matter.ok) return { ok: false as const, status: matter.status, error: matter.error };
  if (matter.claim.firm_id !== lead.firm_id) return { ok: false as const, status: 403, error: "The matter does not belong to this firm." };
  if (user.role === "firm" && !await firmMatterReleased(sb, matter.claim.status)) {
    return { ok: false as const, status: 403, error: "This matter is not ready for firm review." };
  }
  return { ok: true as const, user, lead, matter };
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const sp = new URL(req.url).searchParams;
  const scope = await documentScope(sb, sp.get("lead"), sp.get("claim"));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const { lead, matter, user } = scope;
  // Legacy unbound documents may be reviewed by internal staff on a proven
  // sole-matter file. Firm access always requires an explicit released matter.
  const legacyAllowed = user.role !== "firm" && matter.sole;
  let query = sb.from("case_documents").select("*").eq("lead_id", lead.id).eq("firm_id", lead.firm_id);
  query = legacyAllowed ? query.or(`claim_id.eq.${matter.claim.id},claim_id.is.null`) : query.eq("claim_id", matter.claim.id);
  const { data: docs, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load the documents. Try again." }, { status: 503 });
  const admin = supabaseAdmin();
  const withUrls = await Promise.all((docs ?? []).filter(d => rowBelongsToMatter(d, matter) &&
    (legacyAllowed || d.claim_id === matter.claim.id)).map(async (d) => {
    const key = canonicalKeyFor(d);
    if (!key) return { ...d, url: null }; // never sign a non-canonical key
    const { data: signed } = await admin.storage.from("case-docs").createSignedUrl(key, 3600);
    return { ...d, url: signed?.signedUrl ?? null };
  }));
  return NextResponse.json({ docs: withUrls, claim_id: matter.claim.id }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const lead_id = form.get("lead_id") as string;
  const claim_id = (form.get("claim_id") as string) || null;
  const doc_type = (form.get("doc_type") as string) || "other";
  if (!file || !lead_id) return NextResponse.json({ error: "file and lead_id required" }, { status: 400 });
  const scope = await documentScope(sb, lead_id, claim_id, true);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  // The path is derived from the LEAD's firm, not the uploader's (Astra
  // round 3: an internal operator has no firm, and the old operator-firm path
  // failed the document guard after the bytes were already uploaded). RLS on
  // the metadata insert below still decides whether this user may touch the
  // lead at all.
  const leadRow = scope.lead;

  const admin = supabaseAdmin();
  const path = `${leadRow.firm_id}/${lead_id}/${Date.now()}-${safeFileName(file.name)}`;
  const buf = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from("case-docs").upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data, error } = await sb.from("case_documents").insert({
    firm_id: leadRow.firm_id, lead_id, claim_id: scope.matter.claim.id, doc_type,
    file_name: file.name, storage_path: path,
    uploaded_by: scope.user.id, uploaded_by_name: scope.user.name ?? "Staff",
  }).select("*").single();
  if (error) {
    // The metadata row was refused: do not leave orphan bytes behind.
    try { await admin.storage.from("case-docs").remove([path]); } catch {}
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ doc: data });
}
