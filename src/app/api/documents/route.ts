import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

// GET ?lead= : list docs (with signed URLs). POST: upload (multipart).
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lead = new URL(req.url).searchParams.get("lead");
  const { data: docs } = await sb.from("case_documents").select("*").eq("lead_id", lead).order("created_at", { ascending: false });
  const admin = supabaseAdmin();
  const withUrls = await Promise.all((docs ?? []).map(async (d) => {
    const { data: signed } = await admin.storage.from("case-docs").createSignedUrl(d.storage_path, 3600);
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

  const admin = supabaseAdmin();
  const path = `${me?.firm_id ?? "firm"}/${lead_id}/${Date.now()}-${file.name}`;
  const buf = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from("case-docs").upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data, error } = await sb.from("case_documents").insert({
    firm_id: me?.firm_id, lead_id, claim_id, doc_type,
    file_name: file.name, storage_path: path,
    uploaded_by: auth.user.id, uploaded_by_name: me?.full_name ?? "Staff",
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ doc: data });
}
