import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
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

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lead = new URL(req.url).searchParams.get("lead");
  const { data: docs } = await sb.from("case_documents").select("*").eq("lead_id", lead).order("created_at", { ascending: false });
  const admin = supabaseAdmin();
  const withUrls = await Promise.all((docs ?? []).map(async (d) => {
    const key = canonicalKeyFor(d);
    if (!key) return { ...d, url: null }; // never sign a non-canonical key
    const { data: signed } = await admin.storage.from("case-docs").createSignedUrl(key, 3600);
    return { ...d, url: signed?.signedUrl ?? null };
  }));
  return NextResponse.json({ docs: withUrls });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("full_name, firm_id").eq("id", auth.user.id).maybeSingle();

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const lead_id = form.get("lead_id") as string;
  const claim_id = (form.get("claim_id") as string) || null;
  const doc_type = (form.get("doc_type") as string) || "other";
  if (!file || !lead_id) return NextResponse.json({ error: "file and lead_id required" }, { status: 400 });

  // The path is derived from the LEAD's firm, not the uploader's (Astra
  // round 3: an internal operator has no firm, and the old operator-firm path
  // failed the document guard after the bytes were already uploaded). RLS on
  // the metadata insert below still decides whether this user may touch the
  // lead at all.
  const { data: leadRow } = await sb.from("leads").select("id, firm_id").eq("id", lead_id).maybeSingle();
  if (!leadRow) return NextResponse.json({ error: "lead not found" }, { status: 404 });
  if (!leadRow.firm_id) return NextResponse.json({ error: "this lead has no firm; set the campaign first" }, { status: 400 });

  const admin = supabaseAdmin();
  const path = `${leadRow.firm_id}/${lead_id}/${Date.now()}-${safeFileName(file.name)}`;
  const buf = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from("case-docs").upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data, error } = await sb.from("case_documents").insert({
    firm_id: leadRow.firm_id, lead_id, claim_id, doc_type,
    file_name: file.name, storage_path: path,
    uploaded_by: auth.user.id, uploaded_by_name: me?.full_name ?? "Staff",
  }).select("*").single();
  if (error) {
    // The metadata row was refused: do not leave orphan bytes behind.
    try { await admin.storage.from("case-docs").remove([path]); } catch {}
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ doc: data });
}
